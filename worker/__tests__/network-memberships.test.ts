import { describe, expect, it } from 'vitest'
import handler from '../index'
import { signJWT } from '../lib/crypto'

const secret = 'test-jwt-secret-min-32-bytes-long-for-hs256!!!'

async function setup(role = 'salesperson', privateContact = false, tenant = 't1') {
  const writes: string[] = []
  const env = {
    JWT_SECRET: secret, APP_ENV: 'test', __STATIC_CONTENT: {},
    DB: {
      prepare: (sql: string) => ({
        bind: (...params: unknown[]) => ({
          first: async () => {
            if (sql.includes('SELECT role FROM users')) return { role }
            if (sql.includes('FROM network_connections')) {
              return params[1] === tenant ? { id: 'c1', created_by: 'other-agent', is_private: privateContact ? 1 : 0 } : null
            }
            return null
          },
          all: async () => ({ results: [] }),
          run: async () => { writes.push(sql); return { success: true } },
        }),
      }),
    },
  }
  const jwt = await signJWT({ userId: 'u1', tenantId: 't1', role }, secret)
  const request = (action: string) => handler.fetch(new Request('https://workspace.primeamericany.com/api/network/c1/' + action, {
    method: 'POST', headers: { Cookie: 're_session=' + encodeURIComponent(jwt) },
  }), env as never, { waitUntil() {}, passThroughOnException() {} } as ExecutionContext)
  return { request, writes }
}

describe('canonical network membership', () => {
  it('saves an existing contact without inserting a duplicate connection', async () => {
    const { request, writes } = await setup()
    expect((await request('save')).status).toBe(200)
    expect(writes).toHaveLength(1)
    expect(writes[0]).toContain('INSERT OR IGNORE INTO network_memberships')
  })
  it('does not let agents save another agent’s private contact', async () => {
    const { request, writes } = await setup('salesperson', true)
    expect((await request('save')).status).toBe(404)
    expect(writes).toHaveLength(0)
  })
  it('does not let agents promote contacts to the brokerage', async () => {
    const { request, writes } = await setup()
    expect((await request('share')).status).toBe(403)
    expect(writes).toHaveLength(0)
  })
  it('lets brokers share the original contact', async () => {
    const { request, writes } = await setup('broker', true)
    expect((await request('share')).status).toBe(200)
    expect(writes[0]).toContain('SET is_private = 0')
  })
  it('rejects contacts from another tenant', async () => {
    const { request, writes } = await setup('broker', false, 't2')
    expect((await request('save')).status).toBe(404)
    expect(writes).toHaveLength(0)
  })
})
