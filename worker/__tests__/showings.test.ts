import { describe, it, expect } from 'vitest'
import handler from '../index'
import { signJWT } from '../lib/crypto'

const TEST_JWT_SECRET = 'test-jwt-secret-min-32-bytes-long-for-hs256!!!'

async function createSessionCookie(userId: string, tenantId: string, role: string): Promise<string> {
  const jwt = await signJWT({ userId, tenantId, role }, TEST_JWT_SECRET)
  return `re_session=${encodeURIComponent(jwt)}`
}

function makeEnv(mockShowings: any[] = []) {
  return {
    __STATIC_CONTENT: {},
    DB: {
      prepare: (query: string) => ({
        bind: (...params: any[]) => ({
          first: async () => query === 'SELECT role FROM users WHERE id=? AND tenant_id=? AND is_active=1' && params[0] === 'u1' && params[1] === 't1' ? {role:'admin'} : mockShowings[0] || null,
          all: async () => ({ results: mockShowings }),
          run: async () => ({ success: true }),
        }),
      }),
    } as unknown as any,
    JWT_SECRET: TEST_JWT_SECRET,
    APP_NAME: 'Test',
    APP_ENV: 'test',
    APP_BASE_URL: 'https://workspace.primeamericany.com',
  } as any
}

function makeCtx() {
  return {
    waitUntil: async () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext
}

describe('/api/showings endpoints', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const req = new Request('https://workspace.primeamericany.com/api/showings', {
      method: 'GET',
    })
    const res = await handler.fetch(req, makeEnv(), makeCtx())
    expect(res.status).toBe(401)
  })

  it('GET /api/showings returns list of showings for authenticated user', async () => {
    const mockShowings = [
      {
        id: 's1',
        tenant_id: 't1',
        listing_id: 'l1',
        agent_id: 'u1',
        buyer_name: 'Jane Doe',
        shown_at: '2026-09-01T14:00:00Z',
        feedback: 'Loved the backyard',
        listing_address: '123 Main St',
        agent_name: 'Sid Lama',
        agent_email: 'sid@primeamericany.com',
      },
    ]

    const cookie = await createSessionCookie('u1', 't1', 'admin')
    const req = new Request('https://workspace.primeamericany.com/api/showings?listingId=l1', {
      method: 'GET',
      headers: { Cookie: cookie },
    })

    const res = await handler.fetch(req, makeEnv(mockShowings), makeCtx())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].buyer_name).toBe('Jane Doe')
  })

  it('POST /api/showings rejects disconnected name-only records', async () => {
    const cookie = await createSessionCookie('u1', 't1', 'agent')
    const req = new Request('https://workspace.primeamericany.com/api/showings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        listingId: 'l1',
        buyerName: 'John Smith',
        shownAt: '2026-09-02T10:00:00Z',
        feedback: 'Interested in making an offer',
        listingAddress: '456 Elm St, New York, NY',
      }),
    })

    const res = await handler.fetch(req, makeEnv(), makeCtx())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('contact-linked')
  })

  it('POST /api/showings validates buyerName and shownAt', async () => {
    const cookie = await createSessionCookie('u1', 't1', 'agent')
    const req = new Request('https://workspace.primeamericany.com/api/showings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        listingId: 'l1',
        buyerName: '',
        shownAt: '',
      }),
    })

    const res = await handler.fetch(req, makeEnv(), makeCtx())
    expect(res.status).toBe(400)
  })
})
