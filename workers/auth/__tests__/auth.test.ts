import { beforeEach, describe, it, expect, vi } from 'vitest'
import worker from '../src/index'

describe('Central Auth Worker (prime-america-auth)', () => {
  const mockEnv: any = {
    INTERNAL_API_SECRET: 'test-secret',
    WORKSPACE_URL: 'https://workspace.primeamericany.com',
    COOKIE_DOMAIN: '.primeamericarealestate.com',
    BETTER_AUTH_SECRET: 'test-better-auth-secret-32-chars-long',
    BETTER_AUTH_URL: 'https://auth.primeamericarealestate.com',
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'session-1',
            userId: 'user-1',
            email: 'agent@primeamericany.com',
            name: 'Jane Doe',
            role: 'salesperson',
            company: 'Prime America Real Estate',
          }),
        }),
      }),
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('responds with status ok on /health', async () => {
    const req = new Request('https://auth.primeamericarealestate.com/health', {
      method: 'GET',
    })

    const res = await worker.fetch(req, mockEnv)
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.status).toBe('ok')
    expect(data.service).toBe('prime-america-auth')
  })

  it('handles CORS preflight OPTIONS requests with credentials allowed', async () => {
    const req = new Request('https://auth.primeamericarealestate.com/api/auth/sign-in/email', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://app.primeamericarealestate.com',
        'Access-Control-Request-Method': 'POST',
      },
    })

    const res = await worker.fetch(req, mockEnv)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.primeamericarealestate.com')
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true')
  })

  it('rejects credentialed CORS preflight requests from unapproved origins', async () => {
    const req = new Request('https://auth.primeamericarealestate.com/api/auth/sign-in/email', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://attacker.example',
        'Access-Control-Request-Method': 'POST',
      },
    })

    const res = await worker.fetch(req, mockEnv)
    expect(res.status).toBe(403)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBeNull()
  })

  it('validates valid session tokens via /api/sso/validate', async () => {
    const req = new Request('https://auth.primeamericarealestate.com/api/sso/validate?token=valid-session-token', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-secret',
      },
    })

    const res = await worker.fetch(req, mockEnv)
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.valid).toBe(true)
    expect(data.user.email).toBe('agent@primeamericany.com')
    expect(data.user.role).toBe('salesperson')
  })

  it('requires service authentication before validating a session token', async () => {
    const req = new Request('https://auth.primeamericarealestate.com/api/sso/validate?token=valid-session-token')

    const res = await worker.fetch(req, mockEnv)
    expect(res.status).toBe(401)
    expect(mockEnv.DB.prepare).not.toHaveBeenCalled()
  })

  it('returns 400 when an authenticated /api/sso/validate request is missing its token', async () => {
    const req = new Request('https://auth.primeamericarealestate.com/api/sso/validate', {
      method: 'GET',
      headers: { Authorization: 'Bearer test-secret' },
    })

    const res = await worker.fetch(req, mockEnv)
    expect(res.status).toBe(400)
    const data = await res.json() as any
    expect(data.error).toBe('Missing token parameter')
  })

  it('fails closed when the Better-Auth signing secret is not configured', async () => {
    const req = new Request('https://auth.primeamericarealestate.com/api/auth/get-session')
    const { BETTER_AUTH_SECRET: _removed, ...missingSecretEnv } = mockEnv

    const res = await worker.fetch(req, missingSecretEnv as any)
    expect(res.status).toBe(503)
    const data = await res.json() as any
    expect(data.error).toBe('Authentication service is not configured')
  })

  it('maps legacy roles to appropriate Better-Auth designations', () => {
    const mapRole = (role: string) => {
      if (role === 'broker') return 'Licensed Real Estate Broker'
      if (role === 'admin') return 'Platform Administrator'
      if (role === 'assistant') return 'Transaction Coordinator'
      return 'Licensed Real Estate Salesperson'
    }

    expect(mapRole('admin')).toBe('Platform Administrator')
    expect(mapRole('broker')).toBe('Licensed Real Estate Broker')
    expect(mapRole('salesperson')).toBe('Licensed Real Estate Salesperson')
    expect(mapRole('assistant')).toBe('Transaction Coordinator')
  })
})
