import { describe, expect, it, vi } from 'vitest'
import worker from '../index'

function request(sourceId: string) {
  return new Request('https://crm.internal/api/contacts/upsert-inquiry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'agent-a',
      'X-Tenant-Id': 'tenant-a',
      'X-User-Role': 'system',
    },
    body: JSON.stringify({
      sourceId,
      listingId: 'listing-a',
      assignedTo: 'agent-a',
      firstName: 'Jamie',
      lastName: 'Buyer',
      email: ' JAMIE@EXAMPLE.COM ',
      phone: '(555) 010-1000',
      consentStatus: 'property_contact_only',
      consentCapturedAt: '2026-09-01T12:00:00.000Z',
    }),
  })
}

describe('CRM sourced contacts', () => {
  it('reuses the tenant contact and makes a retried source idempotent', async () => {
    const sourceLinks = new Map<string, string>()
    const executedSql: string[] = []
    const DB = {
      batch: async (statements: { run(): Promise<unknown> }[]) => Promise.all(statements.map(s => s.run())),
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...values: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes('FROM contact_source_links')) {
              const contactId = sourceLinks.get(String(values[2]))
              return contactId ? { contact_id: contactId } : null
            }
            if (sql.includes('FROM users')) return { id: 'agent-a' }
            if (sql.includes('lower(trim(email))')) return { id: 'con-existing' }
            return null
          }),
          run: vi.fn(async () => {
            executedSql.push(sql)
            if (sql.includes('INSERT INTO contact_source_links')) {
              sourceLinks.set(String(values[4]), String(values[2]))
            }
            return { success: true }
          }),
        })),
      })),
    } as unknown as D1Database

    const env = { DB }
    const first = await worker.fetch(request('inquiry-1'), env)
    const second = await worker.fetch(request('inquiry-1'), env)

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(await first.json()).toMatchObject({ data: { contactId: 'con-existing', created: false, sourceCreated: true } })
    expect(await second.json()).toMatchObject({ data: { contactId: 'con-existing', created: false, sourceCreated: false } })
    expect(executedSql.filter((sql) => sql.includes('INSERT INTO contacts'))).toHaveLength(0)
    expect(executedSql.filter((sql) => sql.includes('INSERT INTO contact_source_links'))).toHaveLength(1)
  })

  it('keeps promoted clients out of the listing inquiry pool', async () => {
    const queries: string[] = []
    const DB = {
      prepare: vi.fn((sql: string) => {
        queries.push(sql)
        return {
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue({ cnt: 0 }),
          })),
        }
      }),
    } as unknown as D1Database

    const response = await worker.fetch(new Request(
      'https://crm.internal/api/contacts?lifecycle_stage=inquiries',
      { headers: { 'X-User-Id': 'agent-a', 'X-Tenant-Id': 'tenant-a', 'X-User-Role': 'admin' } },
    ), { DB })

    expect(response.status).toBe(200)
    const contactQueries = queries.filter((sql) => sql.includes('FROM contacts WHERE'))
    expect(contactQueries).toHaveLength(2)
    for (const sql of contactQueries) {
      expect(sql).toContain("lifecycle_stage = 'inquiry'")
      expect(sql).not.toContain('OR source_listing_id IS NOT NULL')
    }
  })

  it('supports an explicit unassigned owner filter for brokers', async () => {
    const queries: string[] = []
    const DB = {
      prepare: vi.fn((sql: string) => {
        queries.push(sql)
        return {
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue({ cnt: 0 }),
          })),
        }
      }),
    } as unknown as D1Database

    const response = await worker.fetch(new Request(
      'https://crm.internal/api/contacts?assigned_to=unassigned',
      { headers: { 'X-User-Id': 'broker-a', 'X-Tenant-Id': 'tenant-a', 'X-User-Role': 'broker' } },
    ), { DB })

    expect(response.status).toBe(200)
    const contactQueries = queries.filter((sql) => sql.includes('FROM contacts WHERE'))
    expect(contactQueries).toHaveLength(2)
    for (const sql of contactQueries) expect(sql).toContain("(assigned_to IS NULL OR assigned_to = '')")
  })

  it('returns the assigned owner identity with each contact', async () => {
    const DB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          all: vi.fn().mockResolvedValue(sql.includes('FROM users WHERE')
            ? { results: [{ id: 'agent-a', name: 'Alex Agent', role: 'salesperson' }] }
            : { results: [{
                id: 'contact-a', tenant_id: 'tenant-a', assigned_to: 'agent-a', first_name: 'Jamie', last_name: 'Buyer',
                email: null, phone: null, type: 'buyer', status: 'prospect', source: null, notes: null,
                tags: null, address: null, is_active: 1, created_at: '2026-09-01', updated_at: '2026-09-01',
              }] }),
          first: vi.fn().mockResolvedValue({ cnt: 1 }),
        })),
      })),
    } as unknown as D1Database

    const response = await worker.fetch(new Request(
      'https://crm.internal/api/contacts',
      { headers: { 'X-User-Id': 'broker-a', 'X-Tenant-Id': 'tenant-a', 'X-User-Role': 'broker' } },
    ), { DB })
    const body: any = await response.json()

    expect(body.data.contacts[0]).toMatchObject({
      assigned_to: 'agent-a',
      assigned_to_name: 'Alex Agent',
      assigned_to_role: 'salesperson',
    })
  })
})
