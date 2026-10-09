import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../index'

describe('public listing inquiry attribution', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('derives tenant and assigned agent from Inventory, not browser input', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json({
      id: 'listing-a',
      tenantId: 'tenant-from-inventory',
      createdBy: 'agent-fallback',
      data: { listAgentUserId: 'agent-from-inventory' },
    }))
    const crmFetch = vi.fn().mockResolvedValue(Response.json({ data: { contactId: 'con-a' } }))
    let intake: Record<string,unknown> | null = null
    const DB = {
      batch: async (statements: {run():Promise<unknown>}[]) => Promise.all(statements.map(s=>s.run())),
      prepare: vi.fn((sql:string) => ({
        all: async()=>({results:[]}),
        run: async()=>({success:true,meta:{changes:0}}),
        bind: vi.fn((...values:unknown[]) => ({
          first: vi.fn(async()=>sql.includes('FROM listing_lead_intakes')?intake:{id:'tenant-from-inventory'}),
          all: vi.fn(async()=>({results:[]})),
          run: vi.fn(async()=>{
            if(sql.includes('INSERT OR IGNORE INTO listing_lead_intakes')) intake={tenant_id:values[0],id:values[1],listing_id:values[2],assigned_to:values[3],payload_json:values[4],status:'pending'}
            return {success:true,meta:{changes:1}}
          }),
        })),
      })),
    } as unknown as D1Database
    const env = {
      DB,
      INTERNAL_API_SECRET: 'internal-secret',
      INVENTORY_WORKER_URL: 'https://inventory.internal',
      CRM: { fetch: crmFetch } as unknown as Fetcher,
    } as any

    const response = await handler.fetch(new Request('https://workspace.test/api/public/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listingId: 'listing-a',
        inquiryId: 'inquiry-a',
        first_name: 'Jamie',
        last_name: 'Buyer',
        email: 'jamie@example.com',
        phone: '5550101000',
        tenantId: 'attacker-tenant',
        agentId: 'attacker-agent',
      }),
    }), env, { waitUntil() {}, passThroughOnException() {} } as ExecutionContext)

    expect(response.status).toBe(200)
    const crmRequest = crmFetch.mock.calls[0][1] as RequestInit
    const headers = new Headers(crmRequest.headers)
    const body = JSON.parse(String(crmRequest.body))
    expect(headers.get('X-Tenant-Id')).toBe('tenant-from-inventory')
    expect(headers.get('X-User-Id')).toBe('agent-from-inventory')
    expect(body.assignedTo).toBe('agent-from-inventory')
    expect(body.sourceId).toBe('inquiry-a')
  })
})
