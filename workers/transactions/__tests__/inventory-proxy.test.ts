import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../index'

describe('Transactions Inventory proxy', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('forwards the authenticated tenant context to Inventory', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchSpy

    const response = await worker.fetch(
      new Request('https://internal/api/transactions/listings', {
        headers: {
          'X-User-Id': 'user-a',
          'X-Tenant-Id': 'tenant-a',
          'X-User-Role': 'admin',
        },
      }),
      {
        DB: {} as D1Database,
        INVENTORY_WORKER_URL: 'https://inventory.primeamericarealestate.com',
        INTERNAL_API_SECRET: 'inventory-internal-secret-test',
        OUTCOMES_ROOM: {} as DurableObjectNamespace,
      },
    )

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers)
    expect(headers.get('x-user-id')).toBe('user-a')
    expect(headers.get('x-tenant-id')).toBe('tenant-a')
    expect(headers.get('x-user-role')).toBe('admin')
  })

  it.each(['/api/transactions', '/api/transactions/results?period=all'])('keeps GET %s read-only when Inventory has a new agent listing', async (path) => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        listings: [{
          id: 'listing-a',
          createdBy: 'agent-a',
          name: '10 Main Street',
          status: 'active',
          propertyType: 'Residential',
          listAgentEmail: 'agent@example.com',
          price: 725000,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )

    const batch = vi.fn().mockResolvedValue([])
    const DB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(sql.includes('SELECT email FROM users') ? { email: 'agent@example.com' } : null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
      })),
      batch,
    } as unknown as D1Database

    const response = await worker.fetch(
      new Request(`https://internal${path}`, {
        headers: {
          'X-User-Id': 'agent-a',
          'X-Tenant-Id': 'tenant-a',
          'X-User-Role': 'salesperson',
        },
      }),
      {
        DB,
        INVENTORY_WORKER_URL: 'https://inventory.primeamericarealestate.com',
        INTERNAL_API_SECRET: 'inventory-internal-secret-test',
        OUTCOMES_ROOM: {} as DurableObjectNamespace,
      },
    )

    expect(response.status).toBe(200)
    expect(batch).not.toHaveBeenCalled()
  })

  it('explicitly syncs an agent listing using Inventory nested data fields', async () => {
    const listingResponse =
      new Response(JSON.stringify({
        listings: [{
          id: 'listing-a', updatedAt: 'v1',
          createdBy: 'agent-a',
          name: '10 Main Street',
          status: 'active',
          propertyType: 'Residential Lease',
          data: { listAgentEmail: 'agent@example.com', listPrice: 725000 },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    globalThis.fetch = vi.fn(async (url) => String(url).endsWith('/api/business-events')
      ? Response.json({ events: [{ id: 'event-a', tenant_id: 'tenant-a', listing_id: 'listing-a', event_type: 'agreement_executed', evidence_document_id: 'signed-agreement', source_version: 'v1', occurred_at: '2026-09-01' }] })
      : listingResponse)

    const batch = vi.fn().mockResolvedValue([{ meta: { changes: 1 } }])
    const DB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...values: unknown[]) => ({
          values,
          first: vi.fn().mockResolvedValue(sql.includes('SELECT email FROM users') ? { email: 'agent@example.com' } : null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
      })),
      batch,
    } as unknown as D1Database

    const response = await worker.fetch(
      new Request('https://internal/api/transactions/sync-listings', {
        method: 'POST',
        headers: {
          'X-User-Id': 'agent-a',
          'X-Tenant-Id': 'tenant-a',
          'X-User-Role': 'salesperson',
        },
      }),
      {
        DB,
        INVENTORY_WORKER_URL: 'https://inventory.primeamericarealestate.com',
        INTERNAL_API_SECRET: 'inventory-internal-secret-test',
        OUTCOMES_ROOM: {} as DurableObjectNamespace,
      },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, data: { imported: 1 } })
    expect(batch).toHaveBeenCalledTimes(1)
    const inserted = batch.mock.calls[0][0][0] as { values: unknown[] }
    expect(inserted.values[1]).toBe('tenant-a')
    expect(inserted.values[2]).toBe('agent-a')
    expect(inserted.values[3]).toBe('listing-a')
    expect(inserted.values[5]).toBe('lease')
    expect(inserted.values[7]).toBe(725000)
  })

  it('does not import a listing owned by a different stable user id', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => Response.json({
      listings: [{
        id: 'listing-other',
        createdBy: 'agent-other',
        name: '20 Main Street',
        data: { listAgentUserId: 'agent-other', listAgentEmail: 'shared@example.com' },
      }],
    }))
    const batch = vi.fn().mockResolvedValue([])
    const DB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({ all: vi.fn().mockResolvedValue({ results: [] }) })),
      })),
      batch,
    } as unknown as D1Database

    const response = await worker.fetch(new Request('https://internal/api/transactions/sync-listings', {
      method: 'POST',
      headers: { 'X-User-Id': 'agent-a', 'X-Tenant-Id': 'tenant-a', 'X-User-Role': 'salesperson' },
    }), {
      DB,
      INVENTORY_WORKER_URL: 'https://inventory.primeamericarealestate.com',
      INTERNAL_API_SECRET: 'inventory-internal-secret-test',
      OUTCOMES_ROOM: {} as DurableObjectNamespace,
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { imported: 0 } })
    expect(batch).not.toHaveBeenCalled()
  })
})
