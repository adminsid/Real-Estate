/**
 * listings-proxy.test.ts
 * Regression tests for the gateway -> Inventory listings proxy.
 *
 * Covers:
 *   - Proxy targets the configured canonical Inventory origin.
 *   - Upstream non-JSON 4xx/5xx does not throw (no undefined helper crash).
 *   - Gateway returns structured JSON for upstream failures.
 *   - INTERNAL_API_SECRET Bearer header is sent to Inventory.
 *   - No raw browser Cookie header is forwarded to Inventory.
 *   - Successful upstream JSON is passed through.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import handler from '../index'
import { signJWT } from '../lib/crypto'

const TEST_JWT_SECRET = 'test-jwt-secret-min-32-bytes-long-for-hs256!!!'
const TEST_INTERNAL_SECRET = 'test-internal-secret-value-do-not-share'
const INVENTORY_ORIGIN = 'https://inventory.primeamericarealestate.com'

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Listings proxy — /api/listings', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('targets the configured canonical Inventory origin', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(200)

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as any
    const url = lastCall[0] as string
    expect(url).toBe(`${INVENTORY_ORIGIN}/api/listings`)
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
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(200)

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as any
    const headers = lastCall[1]?.headers as Record<string, string>
    expect(headers?.Authorization).toBe(`Bearer ${TEST_INTERNAL_SECRET}`)
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
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie, 'X-Custom': 'keep-me' },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(200)

    const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as any
    const headers = lastCall[1]?.headers as Record<string, string>
    expect(headers?.Cookie).toBeUndefined()
    expect(headers?.['X-Custom']).toBeUndefined()
  })

  it('returns structured JSON for upstream non-JSON 404 without throwing', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('error code: 1042', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      error: 'Listing service is temporarily unavailable',
    })
  })

  it('returns structured JSON for upstream non-JSON 502 without throwing', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      error: 'Listing service is temporarily unavailable',
    })
  })

  it('returns structured JSON when upstream JSON parse fails', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('not-json', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      error: 'Listing service returned invalid response',
    })
  })

  it('returns structured JSON when upstream fetch throws', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toEqual({
      success: false,
      error: 'Failed to connect to listing service',
    })
  })

  it('normalizes and passes through successful Inventory JSON response', async () => {
    const upstreamPayload = {
      listings: [
        { id: 'l1', name: 'Test Listing', data: { listPrice: 999000, city: 'NY', bedroomsTotal: 3 } },
      ],
    }
    const expectedNormalized = {
      id: 'l1',
      address: 'Test Listing',
      city: 'NY',
      state: '',
      zip: null,
      price: 999000,
      status: 'active',
      type: '',
      propertyType: '',
      bedrooms: 3,
      bathrooms: 0,
      sqft: 0,
      description: '',
      heroMediaUrl: null,
      media: [],
    }
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    const body = await res.json()
    expect(body).toEqual({ listings: [expectedNormalized] })
  })

  it('normalizes authenticated detail GET and returns structured fields', async () => {
    const upstreamBundle = {
      id: 'l1',
      name: '123 Main St, Brooklyn, NY',
      status: 'active',
      data: {
        listPrice: 850000,
        city: 'Brooklyn',
        stateOrProvince: 'NY',
        postalCode: '11201',
        bedroomsTotal: 2,
        bathroomsTotalInteger: 1,
        livingArea: 900,
        publicRemarks: 'Charming brownstone',
        streetNumber: '123',
        streetName: 'Main',
        streetSuffix: 'St',
      },
      heroMediaUrl: '/media/hero.jpg',
    }
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamBundle), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings/l1', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('l1')
    expect(body.address).toBe('123 Main St, Brooklyn, NY')
    expect(body.price).toBe(850000)
    expect(body.city).toBe('Brooklyn')
    expect(body.state).toBe('NY')
    expect(body.zip).toBe('11201')
    expect(body.bedrooms).toBe(2)
    expect(body.bathrooms).toBe(1)
    expect(body.sqft).toBe(900)
    expect(body.description).toBe('Charming brownstone')
    expect(body.heroMediaUrl).toBe('/media/hero.jpg')
  })

  it('returns "Address unavailable" when listing lacks name and street data', async () => {
    const upstreamPayload = {
      listings: [{ id: 'l2', data: {} }],
    }
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(upstreamPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    const body = await res.json()
    expect(body.listings[0].address).toBe('Address unavailable')
    expect(body.listings[0].price).toBeNull()
  })

  it('returns 401 for unauthenticated requests', async () => {
    globalThis.fetch = vi.fn()

    const request = new Request('https://workspace.primeamericany.com/api/listings')
    const res = await handler.fetch(request, makeEnv(), makeCtx())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/Unauthorized/i)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('does not leak INTERNAL_API_SECRET in error responses', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network error'))
    globalThis.fetch = fetchSpy

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const request = new Request('https://workspace.primeamericany.com/api/listings', {
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(request, makeEnv(), makeCtx())
    const bodyText = await res.text()
    expect(bodyText).not.toContain(TEST_INTERNAL_SECRET)
  })
})

describe('Public Listing DTO security', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = originalFetch })

  const ALLOWED_PUBLIC_KEYS = [
    'id', 'address', 'city', 'state', 'zip', 'price', 'status',
    'type', 'propertyType', 'bedrooms', 'bathrooms', 'sqft',
    'description', 'heroMediaUrl', 'media',
  ]

  function makeUpstreamListing(overrides: Record<string, any> = {}) {
    return {
      id: 'l1',
      name: '123 Main St',
      status: 'active',
      data: {
        listPrice: 850000,
        city: 'Brooklyn',
        stateOrProvince: 'NY',
        postalCode: '11201',
        bedroomsTotal: 2,
        bathroomsTotalInteger: 1,
        livingArea: 900,
        publicRemarks: 'Charming brownstone',
      },
      heroMediaUrl: '/media/hero.jpg',
      media: [
        { id: 'm1', mediaUrl: '/media/1.jpg', caption: 'Front', orderIndex: 0, type: 'image', secretToken: 'abc123' },
      ],
      ...overrides,
    }
  }

  function makePublicEnv() {
    return makeEnv()
  }

  it('public list response never contains raw', async () => {
    const upstream = [makeUpstreamListing()]
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: upstream }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/public/listings'),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    for (const item of body.data) {
      expect(item).not.toHaveProperty('raw')
      expect(item).not.toHaveProperty('secretToken')
    }
  })

  it('public detail response never contains raw', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeUpstreamListing()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/public/listings/l1'),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).not.toHaveProperty('raw')
    expect(body.data).not.toHaveProperty('secretToken')
  })

  it('public list response contains only allowlisted keys', async () => {
    const upstream = [makeUpstreamListing()]
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: upstream }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/public/listings'),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    const item = body.data[0]
    const actualKeys = Object.keys(item).sort()
    expect(actualKeys).toEqual(ALLOWED_PUBLIC_KEYS.sort())
  })

  it('public detail response contains only allowlisted keys', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeUpstreamListing()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/public/listings/l1'),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    const item = body.data
    const actualKeys = Object.keys(item).sort()
    expect(actualKeys).toEqual(ALLOWED_PUBLIC_KEYS.sort())
  })

  it('scrubs media metadata to safe fields only', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify(
          makeUpstreamListing({
            media: [
              { id: 'm1', mediaUrl: '/media/1.jpg', caption: 'Front', orderIndex: 0, type: 'image', secretToken: 'abc123', internalPath: '/private/bucket' },
            ],
          })
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/public/listings/l1'),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    const media = body.data.media
    expect(media).toHaveLength(1)
    expect(media[0]).toEqual({
      id: 'm1',
      mediaUrl: '/media/1.jpg',
      caption: 'Front',
      orderIndex: 0,
      type: 'image',
    })
    expect(media[0]).not.toHaveProperty('secretToken')
    expect(media[0]).not.toHaveProperty('internalPath')
  })

  it('authenticated list response also strips raw', async () => {
    const upstream = [makeUpstreamListing()]
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ listings: upstream }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/listings', {
        headers: { Cookie: cookie },
      }),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    expect(Array.isArray(body.listings)).toBe(true)
    for (const item of body.listings) {
      expect(item).not.toHaveProperty('raw')
      expect(item).not.toHaveProperty('secretToken')
    }
  })

  it('authenticated detail response also strips raw', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeUpstreamListing()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/listings/l1', {
        headers: { Cookie: cookie },
      }),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    expect(body).not.toHaveProperty('raw')
    expect(body).not.toHaveProperty('secretToken')
  })

  it('missing optional fields retain intentional fallbacks', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          listings: [{ id: 'l-empty', data: {} }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const res = await handler.fetch(
      new Request('https://workspace.primeamericany.com/api/public/listings'),
      makePublicEnv(),
      makeCtx()
    )
    const body = await res.json()
    const item = body.data[0]
    expect(item.address).toBe('Address unavailable')
    expect(item.price).toBeNull()
    expect(item.city).toBe('')
    expect(item.state).toBe('')
    expect(item.zip).toBeNull()
    expect(item.bedrooms).toBe(0)
    expect(item.bathrooms).toBe(0)
    expect(item.sqft).toBe(0)
    expect(item.description).toBe('')
    expect(item.heroMediaUrl).toBeNull()
    expect(item.media).toEqual([])
  })
})
