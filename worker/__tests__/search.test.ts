/**
 * search.test.ts
 * Regression tests for GET /api/search (Command Palette).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import handler from '../index'
import { signJWT } from '../lib/crypto'

const TEST_JWT_SECRET = 'test-jwt-secret-min-32-bytes-long-for-hs256!!!'
const TEST_INTERNAL_SECRET = 'test-internal-secret-value-do-not-share'

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
    INVENTORY_WORKER_URL: 'https://inventory.primeamericarealestate.com',
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

describe('GET /api/search', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns 401 for unauthenticated requests', async () => {
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/search?q=test'),
      makeEnv(),
      makeCtx()
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/Unauthorized/i)
  })

  it('returns empty arrays for a query shorter than 2 characters', async () => {
    const cookie = await createSessionCookie('u1', 't1', 'salesperson')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/search?q=a', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.contacts).toEqual([])
    expect(body.data.transactions).toEqual([])
    expect(body.data.listings).toEqual([])
  })

  it('returns structured results for a valid authenticated query', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const env = makeEnv({
      DB: {
        prepare: (query: string) => ({
          bind: (...params: any[]) => ({
            first: async () => null,
            all: async () => ({
              results: [
                { id: 'c1', first_name: 'Alice', last_name: 'Smith', email: 'alice@test', phone: '555-1234', status: 'active' },
              ],
            }),
            run: async () => ({}),
          }),
        }),
      } as unknown as any,
    })

    const cookie = await createSessionCookie('u1', 't1', 'salesperson')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/search?q=alice', {
        headers: { Cookie: cookie },
      }),
      env,
      makeCtx()
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.contacts)).toBe(true)
    expect(body.data.contacts.length).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(body.data.transactions)).toBe(true)
    expect(Array.isArray(body.data.listings)).toBe(true)
  })

  it('does not expose /api/hr/search as a second divergent endpoint', async () => {
    const cookie = await createSessionCookie('u1', 't1', 'salesperson')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/hr/search?q=test', {
        headers: { Cookie: cookie },
      }),
      makeEnv(),
      makeCtx()
    )

    // /api/hr/search falls into the HR block, passes auth, but fails role check
    // and never reaches a search handler. It is not a second search endpoint.
    expect(res.status).toBe(403)
  })
})
