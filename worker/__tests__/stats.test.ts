/**
 * stats.test.ts
 * Regression tests for GET /api/stats, focused on activeListings from Inventory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../index'
import { signJWT } from '../lib/crypto'

const TEST_JWT_SECRET = 'test-jwt-secret-min-32-bytes-long-for-hs256!!!'
const TEST_INTERNAL_SECRET = 'test-internal-secret-value-do-not-share'
const INVENTORY_ORIGIN = 'https://inventory.primeamericarealestate.com'

async function createSessionCookie(userId: string, tenantId: string, role: string): Promise<string> {
  const jwt = await signJWT({ userId, tenantId, role }, TEST_JWT_SECRET)
  return `re_session=${encodeURIComponent(jwt)}`
}

function makeEnv(overrides: Record<string, any> = {}) {
  return {
    __STATIC_CONTENT: {},
    DB: {
      prepare: (query: string) => ({
        bind: (...params: any[]) => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({}),
        }),
      }),
    } as unknown as any,
    EMAIL_TOKENS_KV: {
      get: async () => null,
      put: async () => {},
      delete: async () => {},
    } as unknown as any,
    EMAIL: { send: async () => {} },
    JWT_SECRET: TEST_JWT_SECRET,
    INTERNAL_API_SECRET: TEST_INTERNAL_SECRET,
    APP_NAME: 'Test',
    APP_ENV: 'test',
    APP_BASE_URL: 'https://workspace.primeamericany.com',
    FROM_EMAIL: 'test@example.com',
    INVENTORY_WORKER_URL: INVENTORY_ORIGIN,
    CRM: {} as any,
    TRANSACTIONS: {} as any,
    ASSETS_BUCKET: {} as any,
    ANALYTICS: {} as any,
    ...overrides,
  }
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: async () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext
}

function makeInventoryListing(id: string, status: string, overrides: Record<string, any> = {}) {
  return {
    id,
    name: `Listing ${id}`,
    status,
    data: { listPrice: 100000, city: 'NY', stateOrProvince: 'NY', postalCode: '10001' },
    ...overrides,
  }
}

describe('GET /api/stats — activeListings', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns correct activeListings count from Inventory', async () => {
    const upstreamPayload = {
      listings: [
        makeInventoryListing('l1', 'active'),
        makeInventoryListing('l2', 'active'),
        makeInventoryListing('l3', 'draft'),
        makeInventoryListing('l4', 'hold'),
        makeInventoryListing('l5', 'pending'),
      ],
    }
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/stats', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.activeListings).toBe(2)
  })

  it('sends INTERNAL_API_SECRET Bearer header to Inventory', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/stats', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    const inventoryCall = fetchSpy.mock.calls.find((call: any) => {
      const url = call[0] as string
      return url.includes('/api/listings')
    })
    expect(inventoryCall).toBeDefined()
    const headers = inventoryCall![1]?.headers || {}
    expect(headers.Authorization).toBe(`Bearer ${TEST_INTERNAL_SECRET}`)
  })

  it('does NOT forward raw browser Cookie header to Inventory', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/stats', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    const inventoryCall = fetchSpy.mock.calls.find((call: any) => {
      const url = call[0] as string
      return url.includes('/api/listings')
    })
    expect(inventoryCall).toBeDefined()
    const headers = inventoryCall![1]?.headers || {}
    expect(headers.Cookie).toBeUndefined()
  })

  it('returns 0 activeListings and does not crash when Inventory returns non-JSON', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('<html>error code: 522</html>', {
        status: 522,
        headers: { 'Content-Type': 'text/html' },
      })
    )

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/stats', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.activeListings).toBe(0)
  })

  it('returns 0 activeListings and does not crash when upstream fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/stats', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.activeListings).toBe(0)
  })

  it('returns 401 for unauthenticated requests', async () => {
    globalThis.fetch = vi.fn()

    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/stats'),
      makeEnv(),
      makeCtx()
    )

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/Unauthorized/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does not leak INTERNAL_API_SECRET in error responses', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/stats', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    const text = await res.text()
    expect(text).not.toContain(TEST_INTERNAL_SECRET)
  })
})
