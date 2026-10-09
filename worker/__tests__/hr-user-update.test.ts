import { describe, it, expect } from 'vitest'
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

/**
 * Build a minimal D1 mock that:
 * - sequences `.first()` calls from the `firstResponses` queue
 * - returns empty arrays for `.all()` (used by permission override lookup)
 * - always succeeds for `.run()` (UPDATE / DELETE)
 */
function makeEnv(firstResponses: Array<any> = []) {
  const queue = [...firstResponses]
  return {
    __STATIC_CONTENT: {},
    DB: {
      prepare: (_query: string) => ({
        bind: (..._params: any[]) => ({
          first: async () => queue.shift() ?? null,
          all: async () => ({ results: [] }),
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

const BASE_URL = 'https://workspace.primeamericany.com'

// Calls in the happy-path admin PUT /api/hr/users/:id request:
//   1. getSession -> SELECT role FROM users WHERE id=? AND tenant_id=? AND is_active=1
//   2. can() for admin role: returns true immediately without a DB query
//   3. SELECT id, role, email FROM users WHERE id = ? AND tenant_id = ? (target user lookup)
//   4. [if email changed] SELECT id FROM users WHERE email=? AND tenant_id=? AND id!=? (conflict check)
//   5. UPDATE users SET ... (uses .run(), not .first())
//   6. SELECT * FROM users WHERE id = ? (return updated user, uses .first())
// NOTE: for a non-broker/admin session user, requireAuth -> getSession returns null -> 401

describe('PUT /api/hr/users/:id — agent profile update', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const req = new Request(`${BASE_URL}/api/hr/users/agent1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    })
    // No cookie → requireAuth throws 401
    const res = await handler.fetch(req, makeEnv(), makeCtx())
    expect(res.status).toBe(401)
  })

  it('rejects non-broker/admin sessions with 403', async () => {
    // getSession needs a DB first() call to validate the session user is active
    const sessionUser = { role: 'salesperson' }
    const cookie = await createSessionCookie('agent1', 'tenant1', 'salesperson')
    const req = new Request(`${BASE_URL}/api/hr/users/agent2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'New Name' }),
    })
    // Queue: [1] getSession user active check
    const res = await handler.fetch(req, makeEnv([sessionUser]), makeCtx())
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid email format', async () => {
    const sessionUser = { role: 'admin' }
    const targetUser = { id: 'agent1', role: 'salesperson', email: 'old@primeamericany.com' }
    const cookie = await createSessionCookie('admin1', 'tenant1', 'admin')
    const req = new Request(`${BASE_URL}/api/hr/users/agent1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'not-an-email' }),
    })
    // Queue: [1] getSession, [2] target user
    // can() for admin skips DB. Email check fires before conflict lookup.
    const res = await handler.fetch(req, makeEnv([sessionUser, targetUser]), makeCtx())
    expect(res.status).toBe(400)
    const json = await res.json() as any
    expect(json.error).toMatch(/invalid email/i)
  })

  it('returns 409 when updated email already belongs to another user in the same tenant', async () => {
    const sessionUser = { role: 'admin' }
    const targetUser = { id: 'agent1', role: 'salesperson', email: 'old@primeamericany.com' }
    const conflictUser = { id: 'agent2' }
    const cookie = await createSessionCookie('admin1', 'tenant1', 'admin')
    const req = new Request(`${BASE_URL}/api/hr/users/agent1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'taken@primeamericany.com' }),
    })
    // Queue: [1] getSession, [2] target user, [3] conflict user
    const res = await handler.fetch(req, makeEnv([sessionUser, targetUser, conflictUser]), makeCtx())
    expect(res.status).toBe(409)
    const json = await res.json() as any
    expect(json.error).toMatch(/already exists/i)
  })

  it('successfully updates email and licenseExpirationDate for an unclaimed agent', async () => {
    const sessionUser = { role: 'admin' }
    const targetUser = { id: 'agent1', role: 'salesperson', email: 'unclaimed_xyz@placeholder.local' }
    const updatedUser = {
      id: 'agent1', tenant_id: 'tenant1', role: 'salesperson',
      email: 'newagent@primeamericany.com',
      name: 'Jane Agent', phone: null, title: null,
      license_number: null, license_state: 'NY',
      license_expiration_date: '2027-06-30',
      avatar_url: null, is_active: 1, email_verified: 1,
      invited_by: null, last_login_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-06T00:00:00Z',
      password_hash: 'hashed',
    }
    const cookie = await createSessionCookie('admin1', 'tenant1', 'admin')
    const req = new Request(`${BASE_URL}/api/hr/users/agent1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        email: 'newagent@primeamericany.com',
        licenseExpirationDate: '2027-06-30',
      }),
    })
    // Queue: [1] getSession, [2] target user, [3] conflict check → null (no conflict), [4] updated user
    const res = await handler.fetch(req, makeEnv([sessionUser, targetUser, null, updatedUser]), makeCtx())
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.success).toBe(true)
    expect(json.data.user.email).toBe('newagent@primeamericany.com')
    expect(json.data.user.license_expiration_date).toBe('2027-06-30')
    // password_hash must be stripped from the response
    expect(json.data.user.password_hash).toBeUndefined()
  })

  it('skips conflict check when submitted email matches current email (no-op)', async () => {
    const sameEmail = 'same@primeamericany.com'
    const sessionUser = { role: 'admin' }
    const targetUser = { id: 'agent1', role: 'salesperson', email: sameEmail }
    const updatedUser = {
      id: 'agent1', tenant_id: 'tenant1', role: 'salesperson',
      email: sameEmail, name: 'Same Agent', phone: null, title: null,
      license_number: null, license_state: 'NY', license_expiration_date: null,
      avatar_url: null, is_active: 1, email_verified: 1,
      invited_by: null, last_login_at: null,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-06T00:00:00Z',
      password_hash: 'hashed',
    }
    const cookie = await createSessionCookie('admin1', 'tenant1', 'admin')
    const req = new Request(`${BASE_URL}/api/hr/users/agent1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: sameEmail, name: 'Same Agent' }),
    })
    // No conflict check since email hasn't changed.
    // Queue: [1] getSession, [2] target user, [3] updated user
    const res = await handler.fetch(req, makeEnv([sessionUser, targetUser, updatedUser]), makeCtx())
    expect(res.status).toBe(200)
    const json = await res.json() as any
    expect(json.success).toBe(true)
    expect(json.data.user.email).toBe(sameEmail)
  })
})
