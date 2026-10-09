import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../index'
import { signJWT } from '../lib/crypto'

const TEST_JWT_SECRET = 'test-jwt-secret-min-32-bytes-long-for-hs256!!!'

async function createSessionCookie(userId: string, tenantId: string, role: string): Promise<string> {
  const jwt = await signJWT({ userId, tenantId, role }, TEST_JWT_SECRET)
  return `re_session=${encodeURIComponent(jwt)}`
}

function makeCtx() {
  return {
    waitUntil: async () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext
}

const BASE_URL = 'https://workspace.primeamericany.com'

describe('POST /api/tenant/sync-ny-license — NY DOS Roster Sync', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('rejects unauthenticated requests with 401', async () => {
    const env = {
      DB: {} as any,
      JWT_SECRET: TEST_JWT_SECRET,
    }
    const req = new Request(`${BASE_URL}/api/tenant/sync-ny-license`, {
      method: 'POST',
    })
    const res = await handler.fetch(req, env as any, makeCtx())
    expect(res.status).toBe(401)
  })

  it('rejects salesperson role with 403', async () => {
    const cookie = await createSessionCookie('agent1', 'tenant1', 'salesperson')
    const env = {
      DB: {
        prepare: () => ({
          bind: () => ({
            first: async () => ({ role: 'salesperson', is_active: 1 }),
          }),
        }),
      } as any,
      JWT_SECRET: TEST_JWT_SECRET,
    }
    const req = new Request(`${BASE_URL}/api/tenant/sync-ny-license`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    const res = await handler.fetch(req, env as any, makeCtx())
    expect(res.status).toBe(403)
    const json = await res.json<any>()
    expect(json.error).toContain('Only admins or brokers can sync company license roster')
  })

  it('returns 400 if tenant has no company license number configured', async () => {
    const cookie = await createSessionCookie('broker1', 'tenant1', 'broker')
    const env = {
      DB: {
        prepare: (q: string) => ({
          bind: () => ({
            first: async () => {
              if (q.includes('FROM users WHERE id')) {
                return { role: 'broker', is_active: 1 }
              }
              if (q.includes('SELECT company_license_number FROM tenants')) {
                return { company_license_number: null }
              }
              return null
            },
          }),
        }),
      } as any,
      JWT_SECRET: TEST_JWT_SECRET,
    }
    const req = new Request(`${BASE_URL}/api/tenant/sync-ny-license`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })
    const res = await handler.fetch(req, env as any, makeCtx())
    expect(res.status).toBe(400)
    const json = await res.json<any>()
    expect(json.error).toContain('not configured in Tenant Branding settings')
  })

  it('successfully syncs NY DOS roster and computes diffs', async () => {
    const cookie = await createSessionCookie('admin1', 'tenant1', 'admin')

    // Mock global fetch for Socrata calls
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString()
      if (url.includes('data.ny.gov/resource/yg7h-zjbf.json')) {
        if (url.includes('limit=5000')) {
          // Agents roster
          return new Response(JSON.stringify([
            {
              license_holder_name: 'JOHN BROKER',
              license_number: '10999999999',
              license_type: 'REAL ESTATE BROKER',
              license_expiration_date: '2027-12-31T00:00:00.000',
            },
            {
              license_holder_name: 'JANE AGENT',
              license_number: '10401234567',
              license_type: 'REAL ESTATE SALESPERSON',
              license_expiration_date: '2026-06-30T00:00:00.000',
            },
            {
              license_holder_name: 'NEW DOS AGENT',
              license_number: '10409999999',
              license_type: 'REAL ESTATE SALESPERSON',
              license_expiration_date: '2028-01-15T00:00:00.000',
            },
          ]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        if (url.includes('limit=5')) {
          // Company lookup
          return new Response(JSON.stringify([{
            business_name: 'PRIME AMERICA REAL ESTATE',
            license_holder_name: 'JOHN BROKER',
            license_number: '10999999999',
            license_type: 'REAL ESTATE BROKER',
            license_expiration_date: '2027-12-31T00:00:00.000',
            business_address_1: '123 MAIN ST',
            business_city: 'NEW YORK',
            business_state: 'NY',
            business_zip: '10001',
            county: 'NEW YORK',
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
      }
      return new Response('Not found', { status: 404 })
    })

    const updatedUserStatements: any[] = []

    const env = {
      DB: {
        prepare: (q: string) => ({
          bind: (...args: any[]) => ({
            first: async () => {
              if (q.includes('FROM users WHERE id')) {
                return { role: 'admin', is_active: 1 }
              }
              if (q.includes('SELECT company_license_number FROM tenants')) {
                return { company_license_number: '10999999999' }
              }
              return null
            },
            all: async () => {
              if (q.includes('SELECT id, name, email, license_number, role FROM users')) {
                return {
                  results: [
                    { id: 'u1', name: 'John Broker', email: 'john@prime.com', license_number: '10999999999', role: 'broker' },
                    { id: 'u2', name: 'Jane Agent', email: 'jane@prime.com', license_number: null, role: 'salesperson' },
                    { id: 'u3', name: 'Missing Bob', email: 'bob@prime.com', license_number: null, role: 'salesperson' },
                  ],
                }
              }
              return { results: [] }
            },
            run: async () => {
              if (q.includes('UPDATE users')) {
                updatedUserStatements.push({ query: q, args })
              }
              return { success: true }
            },
          }),
        }),
      } as any,
      JWT_SECRET: TEST_JWT_SECRET,
    }

    const req = new Request(`${BASE_URL}/api/tenant/sync-ny-license`, {
      method: 'POST',
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(req, env as any, makeCtx())
    expect(res.status).toBe(200)

    const json = await res.json<any>()
    expect(json.success).toBe(true)
    expect(json.data.licenseSync).toBeDefined()

    const sync = json.data.licenseSync
    expect(sync.businessName).toBe('PRIME AMERICA REAL ESTATE')
    expect(sync.totalAgents).toBe(3)
    expect(sync.matchedUsers).toBe(2) // John (by license) and Jane (by name)

    // Unclaimed profile from DOS
    expect(sync.autoCreatedUsers).toBe(1)
    expect(sync.autoCreatedList).toEqual([
      { name: 'NEW DOS AGENT', licenseNumber: '10409999999' },
    ])

    // Missing workspace agent
    expect(sync.removedUsersList).toEqual([
      { name: 'Missing Bob', email: 'bob@prime.com' },
    ])

    // 2 users updated in DB
    expect(updatedUserStatements.length).toBe(2)
  })
})
