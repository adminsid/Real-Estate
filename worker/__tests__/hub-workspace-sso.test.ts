import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { sqliteD1 } from '../../workers/transactions/__tests__/helpers/sqlite'
import handler from '../index'
import { signJWT } from '../lib/crypto'
import { authStore, workspaceAuth } from '../../../branding hub/worker/workspace-auth'
import { safeHubReturn } from '../../../branding hub/src/lib/workspace-login'
import { getSafeRedirectUrl } from '../../src/lib/login-redirect'

const HUB = 'https://inside.primeamericarealestate.com'
const WORKSPACE = 'https://workspace.test'
const fixtureDatabases: ReturnType<typeof sqliteD1>['sqlite'][] = []
afterEach(() => { for (const db of fixtureDatabases.splice(0)) db.close(); vi.restoreAllMocks() })
function setup() {
  const ws = sqliteD1(), hub = sqliteD1()
  fixtureDatabases.push(ws.sqlite, hub.sqlite)
  ws.sqlite.exec(`CREATE TABLE users(id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, name TEXT, role TEXT, is_active INTEGER);
    INSERT INTO users VALUES('canonical','tenant','agent@example.com','Workspace Agent','salesperson',1);
    CREATE TABLE sso_tokens(token TEXT PRIMARY KEY,tenant_id TEXT,user_id TEXT,target_app TEXT,return_to TEXT,expires_at TEXT,used_at TEXT);`)
  hub.sqlite.exec(`CREATE TABLE "user"(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,company TEXT,headshot_url TEXT,createdAt TEXT,updatedAt TEXT);
    INSERT INTO "user"(id,email,name,role,headshot_url) VALUES('existing-profile','Agent@example.com','Existing Agent','admin','/storage/headshot.png');`)
  hub.sqlite.exec(readFileSync('../branding hub/migrations/016_workspace_login.sql','utf8'))
  const env = { DB: ws.db, JWT_SECRET:'test-jwt', INTERNAL_API_SECRET:'other-app-secret', BRAND_HUB_SSO_SECRET:'hub-test-secret', BRAND_HUB_TENANT_ID:'tenant' }
  const call = (request: Request) => handler.fetch(request, env as never, {} as never)
  const service = vi.fn<typeof fetch>(async (input, init) => {
    // Cloudflare's edge Fetch rejects redirect:error before any network request.
    if (init?.redirect === 'error') throw new TypeError('Invalid redirect value at the edge')
    return call(new Request(input, init))
  })
  const store = authStore(hub.db as never)
  const auth = workspaceAuth({ store, tenantId:'tenant', workspaceUrl:WORKSPACE, secret:env.BRAND_HUB_SSO_SECRET, fetcher:service })
  const start = async () => {
    const response = (await auth.handle(new Request(HUB+'/auth/workspace/start?return_to='+encodeURIComponent('/brand-guidelines#ai'))))!
    const stateCookie = response.headers.getSetCookie()[0].split(';')[0]
    const login = new URL(response.headers.get('location')!)
    const jwt = await signJWT({userId:'canonical',tenantId:'tenant',role:'salesperson'},env.JWT_SECRET)
    const redirect = await call(new Request(WORKSPACE+login.searchParams.get('redirect'),{headers:{Cookie:`re_session=${jwt}`}}))
    expect(redirect.status).toBe(302)
    const callback = redirect.headers.get('location')!
    return { callback, stateCookie }
  }
  const complete = async () => {
    const { callback, stateCookie } = await start()
    const response = (await auth.handle(new Request(callback,{headers:{Cookie:stateCookie}})))!
    const cookie = response.headers.getSetCookie().find(c=>c.startsWith('__Host-hub_session='))?.split(';')[0] || ''
    return { response, cookie, callback, stateCookie }
  }
  return { ws, hub, env, call, service, store, auth, start, complete }
}

describe('Workspace to Hub authentication integration', () => {
  it('preserves the existing profile and deep link, hashes sessions, and uses the current Workspace role', async () => {
    const f=setup(); const {response,cookie}=await f.complete()
    expect(response.headers.get('location')).toBe('/brand-guidelines#ai')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(cookie).toMatch(/^__Host-hub_session=/)
    expect(response.headers.getSetCookie().find(c=>c.startsWith('__Host-hub_session='))).toContain('Secure; HttpOnly; SameSite=Lax')
    const session=await f.auth.session(new Request(HUB,{headers:{Cookie:cookie}}))
    expect(session?.user).toMatchObject({id:'existing-profile',canonicalId:'canonical',role:'salesperson',headshot_url:'/storage/headshot.png'})
    const row=f.hub.sqlite.prepare('SELECT token_hash FROM hub_workspace_sessions').get()!
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(cookie).not.toContain(String(row.token_hash))
    expect(f.hub.sqlite.prepare('SELECT count(*) AS n FROM "user"').get()?.n).toBe(1)
    f.ws.sqlite.exec("UPDATE users SET role='broker',email='changed@example.com'")
    expect((await f.auth.session(new Request(HUB,{headers:{Cookie:cookie}})))?.user).toMatchObject({id:'existing-profile',role:'broker',email:'changed@example.com'})
    f.ws.sqlite.exec('UPDATE users SET is_active=0')
    expect(await f.auth.session(new Request(HUB,{headers:{Cookie:cookie}}))).toBeNull()
  })
  it('rejects missing browser state, callback replay, and token replay',async()=>{
    const f=setup(); const {callback,stateCookie}=await f.start()
    expect((await f.auth.handle(new Request(callback)))?.headers.get('location')).toContain('error=expired')
    expect(f.service).not.toHaveBeenCalled()
    expect((await f.auth.handle(new Request(callback,{headers:{Cookie:stateCookie}})))?.headers.get('location')).toBe('/brand-guidelines#ai')
    expect((await f.auth.handle(new Request(callback,{headers:{Cookie:stateCookie}})))?.headers.get('location')).toContain('error=expired')
    const url=new URL(callback)
    const replay=await f.call(new Request(WORKSPACE+'/api/sso/validate',{method:'POST',headers:{Authorization:'Bearer hub-test-secret','X-SSO-App':'brand-hub'},body:JSON.stringify({token:url.searchParams.get('sso_token'),callback:url.pathname+'?state='+url.searchParams.get('state')})}))
    expect(replay.status).toBe(401)
  })
  it('rejects expired attempts and sessions; logout revokes only the hub session',async()=>{
    const f=setup(); const pending=await f.start()
    f.hub.sqlite.exec("UPDATE hub_login_attempts SET expires_at='2000-01-01'")
    expect((await f.auth.handle(new Request(pending.callback,{headers:{Cookie:pending.stateCookie}})))?.headers.get('location')).toContain('error=expired')
    const {cookie}=await f.complete()
    expect((await f.auth.handle(new Request(HUB+'/api/auth/sign-out',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.test'}})))?.status).toBe(403)
    const logout=await f.auth.handle(new Request(HUB+'/api/auth/sign-out',{method:'POST',headers:{Cookie:cookie,Origin:HUB}}))
    expect(logout?.status).toBe(200); expect(logout?.headers.get('set-cookie')).not.toContain('re_session')
    expect(await f.auth.session(new Request(HUB,{headers:{Cookie:cookie}}))).toBeNull()
    const second=await f.complete(); f.hub.sqlite.exec("UPDATE hub_workspace_sessions SET expires_at='2000-01-01'")
    expect(await f.auth.session(new Request(HUB,{headers:{Cookie:second.cookie}}))).toBeNull()
  })
  it('fails closed on Workspace outage and retires hub credential routes',async()=>{
    const f=setup(); const {cookie}=await f.complete()
    f.service.mockRejectedValue(new Error('Unavailable'))
    expect(await f.auth.session(new Request(HUB,{headers:{Cookie:cookie}}))).toBeNull()
    for(const path of ['/api/auth/sign-in/email','/api/auth/admin/create-user','/api/agent-signup','/api/admin/reset-password']) expect((await f.auth.handle(new Request(HUB+path,{method:'POST'})))?.status).toBe(410)
    expect(await f.auth.handle(new Request(HUB+'/brand-guide.md'))).toBeNull()
  })
  it('uses edge-supported manual redirects and refuses an upstream redirect',async()=>{
    const f=setup(); const {callback,stateCookie}=await f.start()
    f.service.mockResolvedValue(new Response(null,{status:302,headers:{Location:'https://untrusted.test'}}))
    const response=await f.auth.handle(new Request(callback,{headers:{Cookie:stateCookie}}))
    expect(f.service.mock.calls[0][1]?.redirect).toBe('manual')
    expect(response?.headers.get('location')).toContain('error=unavailable')
    expect(response?.headers.get('set-cookie')).not.toContain('__Host-hub_session=')
    expect(f.hub.sqlite.prepare('SELECT count(*) AS n FROM hub_workspace_sessions').get()?.n).toBe(0)
  })
  it('binds tokens to app, tenant and callback and scopes the hub credential',async()=>{
    const f=setup(); const {callback}=await f.start(); const url=new URL(callback)
    const token=url.searchParams.get('sso_token')!; const body={token,callback:url.pathname+'?state='+url.searchParams.get('state')}
    const validate=(data:unknown,secret='hub-test-secret',app='brand-hub')=>f.call(new Request(WORKSPACE+'/api/sso/validate',{method:'POST',headers:{Authorization:`Bearer ${secret}`,'X-SSO-App':app},body:JSON.stringify(data)}))
    expect((await validate({...body,callback:'/dashboard'})).status).toBe(403)
    expect((await validate(body,'other-app-secret')).status).toBe(403)
    expect((await validate(body,'hub-test-secret','inventory')).status).toBe(401)
    f.ws.sqlite.exec("UPDATE sso_tokens SET target_app='inventory'")
    expect((await validate(body)).status).toBe(401)
    f.ws.sqlite.exec("UPDATE sso_tokens SET target_app='brand-hub'; UPDATE users SET tenant_id='other'; UPDATE sso_tokens SET tenant_id='other'")
    expect((await validate(body)).status).toBe(403)
    const membership=await f.call(new Request(WORKSPACE+'/api/internal/app-membership',{method:'POST',headers:{Authorization:'Bearer hub-test-secret','X-SSO-App':'brand-hub'},body:JSON.stringify({tenantId:'other',userId:'canonical'})}))
    expect(membership.status).toBe(403)
  })
  it('refuses to link one existing profile to a second canonical identity',async()=>{
    const f=setup(); await f.complete()
    await expect(f.store.profile({id:'different-user',email:'agent@example.com',name:'Other',role:'admin'},'tenant')).rejects.toThrow()
    expect(f.hub.sqlite.prepare('SELECT workspace_user_id FROM hub_workspace_identities').get()?.workspace_user_id).toBe('canonical')
  })
  it('keeps the active Workspace hostname and refuses untrusted origin hints',async()=>{
    const f=setup(); const jwt=await signJWT({userId:'canonical',tenantId:'tenant',role:'salesperson'},f.env.JWT_SECRET)
    const launch=await f.call(new Request('https://app.primeamericarealestate.com/api/sso/redirect?app=brand-hub&return_to=%2Fdashboard',{headers:{Cookie:`re_session=${jwt}`}}))
    const start=launch.headers.get('location')!
    expect(new URL(start).searchParams.get('workspace_origin')).toBe('https://app.primeamericarealestate.com')
    const login=await f.auth.handle(new Request(start))
    expect(new URL(login!.headers.get('location')!).origin).toBe('https://app.primeamericarealestate.com')
    const malicious=await f.auth.handle(new Request(HUB+'/auth/workspace/start?workspace_origin=https://evil.test'))
    expect(new URL(malicious!.headers.get('location')!).origin).toBe(WORKSPACE)
    const direct=await f.auth.handle(new Request(HUB+'/auth/workspace/start',{headers:{Cookie:'re_session=routing-hint-not-authentication'}}))
    expect(new URL(direct!.headers.get('location')!).origin).toBe('https://app.primeamericarealestate.com')
    expect(f.hub.sqlite.prepare('SELECT count(*) AS n FROM hub_workspace_sessions').get()?.n).toBe(0)
  })
  it('rejects external SSO destinations before minting a token',async()=>{
    const f=setup(); const jwt=await signJWT({userId:'canonical',tenantId:'tenant',role:'salesperson'},f.env.JWT_SECRET)
    for(const destination of ['//evil.test','/\\evil.test','https://inside.primeamericarealestate.com.evil.test/','https://evil.test']) {
      const response=await f.call(new Request(WORKSPACE+'/api/sso/redirect?app=brand-hub&return_to='+encodeURIComponent(destination),{headers:{Cookie:`re_session=${jwt}`}}))
      expect(response.status).toBe(400)
    }
    expect(f.ws.sqlite.prepare('SELECT count(*) AS n FROM sso_tokens').get()?.n).toBe(0)
  })
})
describe('login destination rules',()=>{
  for(const value of ['//evil.test','/\\evil.test','https://evil.test','/auth/workspace/start','/login','/api/auth/get-session']) it('rejects unsafe hub return '+value,()=>expect(safeHubReturn(value)).toBe('/dashboard'))
  for(const value of ['//evil.test','/\\evil.test','https://unrelated.workers.dev','http://inside.primeamericarealestate.com','https://inside.primeamericarealestate.com:444']) it('rejects unsafe Workspace return '+value,()=>expect(getSafeRedirectUrl(value)).toBeNull())
  it('retains the local SSO continuation and guide anchor',()=>{
    expect(getSafeRedirectUrl('/api/sso/redirect?app=brand-hub')).toBe('/api/sso/redirect?app=brand-hub')
    expect(safeHubReturn('/brand-guidelines#ai')).toBe('/brand-guidelines#ai')
  })
})
