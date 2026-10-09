import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../index'

const TEST_INTERNAL_SECRET = 'test-internal-secret-value-do-not-share'

function makeEnv() {
  return {
    __STATIC_CONTENT: {},
    DB: {prepare:()=>({bind:()=>({first:async()=>({id:'tenant_primeamerica'})})})} as unknown as D1Database,
    EMAIL_TOKENS_KV: {} as KVNamespace,
    EMAIL: { send: async () => {} },
    JWT_SECRET: 'test-jwt-secret-min-32-bytes-long-for-hs256!!!',
    INTERNAL_API_SECRET: TEST_INTERNAL_SECRET,
    APP_NAME: 'Test',
    APP_ENV: 'test',
    APP_BASE_URL: 'https://workspace.primeamericany.com',
    FROM_EMAIL: 'test@example.com',
    INVENTORY_WORKER_URL: 'https://inventory.primeamericarealestate.com',
    OPENHOUSE_WORKER_URL: 'https://openhouse.primeamericarealestate.com',
    CRM: {} as Fetcher,
    TRANSACTIONS: {} as Fetcher,
    PRIME_VIEW: {} as Fetcher,
    AUTH: {} as Fetcher,
    ASSETS_BUCKET: {} as R2Bucket,
    ANALYTICS: {} as AnalyticsEngineDataset,
  }
}

function makeCtx(): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as ExecutionContext
}

describe('public Open House proxy', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('authenticates its server-to-server event request', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    globalThis.fetch = fetchSpy

    const response = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/public/openhouses'),
      makeEnv(),
      makeCtx(),
    )

    expect(response.status).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const headers = new Headers(fetchSpy.mock.calls[0][1]?.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${TEST_INTERNAL_SECRET}`)
  })
})
