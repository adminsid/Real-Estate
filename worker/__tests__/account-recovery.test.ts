import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import handler, { type Env } from '../index'
import { hashPassword, signJWT } from '../lib/crypto'
import { sqliteD1 } from '../../workers/transactions/__tests__/helpers/sqlite'
import { sendManualUserWelcomeEmail, sendPasswordResetEmail } from '../lib/email'

const ORIGIN = 'https://workspace.primeamericany.com'
const databases: ReturnType<typeof sqliteD1>['sqlite'][] = []
afterEach(() => { databases.splice(0).forEach(db => db.close()); vi.restoreAllMocks() })

async function fixture() {
  const { db, sqlite } = sqliteD1()
  databases.push(sqlite)
  sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,email TEXT,name TEXT,role TEXT,is_active INTEGER,email_verified INTEGER,password_hash TEXT,updated_at TEXT,last_login_at TEXT);
    CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE user_permissions(user_id TEXT,module TEXT,action TEXT,granted INTEGER);
    INSERT INTO tenants VALUES('tenant','Fixture Brokerage');
    INSERT INTO users(id,tenant_id,email,name,role,is_active,email_verified) VALUES('agent','tenant','agent@example.com','Fixture Agent','salesperson',1,0),('admin','tenant','admin@example.com','Admin','admin',1,1);`)
  sqlite.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await hashPassword('old-fixture-password'), 'agent')
  const tokens = new Map<string, string>()
  const send = vi.fn().mockResolvedValue(undefined)
  const env = { DB: db, JWT_SECRET: 'fixture-secret', APP_BASE_URL: ORIGIN, EMAIL: { send }, EMAIL_TOKENS_KV: {
    put: async (key: string, value: string) => { tokens.set(key, value) },
    get: async (key: string) => tokens.get(key) ?? null,
    delete: async (key: string) => { tokens.delete(key) },
  } } as unknown as Env
  const call = (path: string, body?: object, cookie?: string) => handler.fetch(new Request(ORIGIN + path, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, { waitUntil() {}, passThroughOnException() {} } as ExecutionContext)
  return { env, sqlite, tokens, send, call }
}

describe('Workspace account recovery', () => {
  it('has a production email URL and never generates undefined/login', async () => {
    const config = readFileSync('wrangler.toml', 'utf8')
    const baseUrl = config.match(/^APP_BASE_URL\s*=\s*"([^"]+)"/m)?.[1]
    const send = vi.fn().mockResolvedValue(undefined)
    await sendManualUserWelcomeEmail({ send }, 'agent@example.com', 'Fixture', 'fixture-password', 'Brokerage', baseUrl as string)
    expect(send.mock.calls[0][0].text).toContain(ORIGIN + '/login')
  })

  it.each([undefined, 'undefined', 'http://undefined', 'javascript:alert(1)', 'https://user:pass@example.com'])('rejects invalid email URL %s before sending', async baseUrl => {
    const send = vi.fn()
    await expect(sendPasswordResetEmail({ send }, 'agent@example.com', 'Fixture', 'token', baseUrl as string)).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
  })

  it('recovers an active unverified account through emailed reset, then logs in with the same identity', async () => {
    const f = await fixture()
    expect((await f.call('/api/auth/login', { email: 'agent@example.com', password: 'old-fixture-password' })).status).toBe(403)
    expect((await f.call('/api/auth/forgot-password', { email: 'agent@example.com' })).status).toBe(200)
    const text = f.send.mock.calls[0][0].text as string
    const resetUrl = new URL(text.match(/https:\/\/\S+/)![0])
    expect(resetUrl.origin).toBe(ORIGIN)
    const token = resetUrl.searchParams.get('token')!
    expect((await f.call('/api/auth/reset-password', { token, password: 'new-fixture-password' })).status).toBe(200)
    expect(f.sqlite.prepare('SELECT email_verified FROM users WHERE id=?').get('agent')?.email_verified).toBe(1)
    const login = await f.call('/api/auth/login', { email: 'agent@example.com', password: 'new-fixture-password' })
    expect(login.status).toBe(200)
    expect(login.headers.get('set-cookie')).toContain('re_session=')
    expect((await login.json() as any).data.user.id).toBe('agent')
    const session = await f.call('/api/auth/me', undefined, login.headers.get('set-cookie')!.split(';')[0])
    expect(session.status).toBe(200)
    expect((await session.json() as any).data.user.id).toBe('agent')
    expect((await f.call('/api/auth/reset-password', { token, password: 'another-fixture-password' })).status).toBe(400)
    expect((await f.call('/api/auth/login', { email: 'agent@example.com', password: 'old-fixture-password' })).status).toBe(401)
  })

  it('does not verify or reset an account after its email changes', async () => {
    const f = await fixture()
    await f.call('/api/auth/forgot-password', { email: 'agent@example.com' })
    const token = [...f.tokens.keys()][0].slice('reset:'.length)
    f.sqlite.exec("UPDATE users SET email='changed@example.com' WHERE id='agent'")
    expect((await f.call('/api/auth/reset-password', { token, password: 'new-fixture-password' })).status).toBe(400)
    expect(f.sqlite.prepare('SELECT email_verified FROM users WHERE id=?').get('agent')?.email_verified).toBe(0)
  })

  it('rejects invalid reset tokens and leaves activation and verification unchanged', async () => {
    const f = await fixture()
    expect((await f.call('/api/auth/reset-password', { token: 'missing', password: 'new-fixture-password' })).status).toBe(400)
    expect(f.sqlite.prepare('SELECT is_active,email_verified FROM users WHERE id=?').get('agent')).toMatchObject({ is_active: 1, email_verified: 0 })
  })

  it('does not activate a disabled account through a valid reset token', async () => {
    const f = await fixture()
    await f.call('/api/auth/forgot-password', { email: 'agent@example.com' })
    const token = [...f.tokens.keys()][0].slice('reset:'.length)
    f.sqlite.exec("UPDATE users SET is_active=0 WHERE id='agent'")
    expect((await f.call('/api/auth/reset-password', { token, password: 'new-fixture-password' })).status).toBe(400)
    expect(f.sqlite.prepare('SELECT is_active,email_verified FROM users WHERE id=?').get('agent')).toMatchObject({ is_active: 0, email_verified: 0 })
  })

  it('preserves legacy resets for verified users without verifying unverified users', async () => {
    const f = await fixture()
    f.tokens.set('reset:legacy-unverified', 'agent')
    expect((await f.call('/api/auth/reset-password', { token: 'legacy-unverified', password: 'new-fixture-password' })).status).toBe(400)
    f.sqlite.exec("UPDATE users SET email_verified=1 WHERE id='agent'")
    f.tokens.set('reset:legacy-verified', 'agent')
    expect((await f.call('/api/auth/reset-password', { token: 'legacy-verified', password: 'new-fixture-password' })).status).toBe(200)
    expect((await f.call('/api/auth/login', { email: 'agent@example.com', password: 'new-fixture-password' })).status).toBe(200)
  })

  it('admin reset emails use the same recovery flow without changing credentials before redemption', async () => {
    const f = await fixture()
    const jwt = await signJWT({ userId: 'admin', tenantId: 'tenant', role: 'admin' }, f.env.JWT_SECRET)
    expect((await f.call('/api/hr/users/agent/reset-password', {}, 're_session=' + jwt)).status).toBe(200)
    expect(f.send.mock.calls[0][0].text).toContain(ORIGIN + '/reset-password?token=')
    expect(f.sqlite.prepare('SELECT email_verified FROM users WHERE id=?').get('agent')?.email_verified).toBe(0)
    const token = [...f.tokens.keys()][0].slice('reset:'.length)
    expect((await f.call('/api/auth/reset-password', { token, password: 'new-fixture-password' })).status).toBe(200)
    expect((await f.call('/api/auth/login', { email: 'agent@example.com', password: 'new-fixture-password' })).status).toBe(200)
  })

  it('welcome resend supplies verification for unverified accounts', async () => {
    const f = await fixture()
    const jwt = await signJWT({ userId: 'admin', tenantId: 'tenant', role: 'admin' }, f.env.JWT_SECRET)
    expect((await f.call('/api/hr/users/agent/send-welcome', {}, 're_session=' + jwt)).status).toBe(200)
    const text = f.send.mock.calls[0][0].text as string
    expect(text).toContain(ORIGIN + '/login')
    expect(text).toContain(ORIGIN + '/verify-email?token=')
    expect([...f.tokens.keys()].some(key => key.startsWith('verify:'))).toBe(true)
    expect(f.sqlite.prepare('SELECT email_verified FROM users WHERE id=?').get('agent')?.email_verified).toBe(0)
  })

  it('misconfigured welcome links fail before replacing the password', async () => {
    const f = await fixture()
    f.env.APP_BASE_URL = 'undefined'
    const before = f.sqlite.prepare('SELECT password_hash FROM users WHERE id=?').get('agent')?.password_hash
    const jwt = await signJWT({ userId: 'admin', tenantId: 'tenant', role: 'admin' }, f.env.JWT_SECRET)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await f.call('/api/hr/users/agent/send-welcome', {}, 're_session=' + jwt)).status).toBe(500)
    expect(f.sqlite.prepare('SELECT password_hash FROM users WHERE id=?').get('agent')?.password_hash).toBe(before)
    expect(f.send).not.toHaveBeenCalled()
  })
})
