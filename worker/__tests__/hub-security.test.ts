import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest'
const state=vi.hoisted(()=>({user:null as null|{id:string;name:string;email:string;role:string}}))
vi.mock('../../../branding hub/src/lib/auth',()=>({createAuth:()=>({api:{getSession:async()=>state.user?{user:state.user}:null}})}))
import hub from '../../../branding hub/worker/index'
describe('Brand Hub private boundary',()=>{
 afterEach(()=>vi.unstubAllGlobals())
 const db={prepare:vi.fn(()=>({bind:vi.fn(()=>({first:vi.fn(async()=>null),all:vi.fn(async()=>({results:[]})),run:vi.fn(async()=>({meta:{changes:1}}))}))}))}
 const bucket={put:vi.fn(),get:vi.fn()}
 const env={DB:db,prime_america_db:db,prime_america_assets:bucket,TENANT_ID:'tenant-a',INTERNAL_API_SECRET:'test-only',WORKSPACE_URL:'https://workspace.test'}
 beforeEach(()=>{state.user=null;vi.clearAllMocks();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({success:true,data:{tenantId:'tenant-a',user:{id:'canonical-a',role:state.user?.role}}})))})
 for(const path of ['/api/assets','/api/upload-asset','/api/request-marketing','/storage/private.pdf'])it(`rejects unauthenticated ${path}`,async()=>{
  expect((await hub.fetch(new Request('https://hub.test'+path),env as any,{} as any)).status).toBe(401)
 })
 it('rejects an injected profile field before writing storage or SQL',async()=>{
  state.user={id:'local-a',name:'Agent',email:'a@example.com',role:'agent'}
  const form=new FormData();form.set('field',"role='admin', logo_url");form.set('file',new File(['fixture'],'photo.png',{type:'image/png'}))
  const response=await hub.fetch(new Request('https://hub.test/api/upload/logo',{method:'POST',body:form}),env as any,{} as any)
  expect(response.status).toBe(400);expect(bucket.put).not.toHaveBeenCalled()
 })
 it('rejects member asset writes and forged method headers',async()=>{
  state.user={id:'local-a',name:'Agent',email:'a@example.com',role:'agent'}
  const response=await hub.fetch(new Request('https://hub.test/api/assets',{method:'POST',headers:{'Access-Control-Request-Method':'GET'},body:'{}'}),env as any,{} as any)
  expect(response.status).toBe(403)
 })
 for(const invalid of [{caption:'   '},{platforms:['one','one']},{desiredDate:'not-a-date'},{desiredDate:'2000-01-01'}])it(`rejects malformed social submission ${JSON.stringify(invalid)}`,async()=>{
  state.user={id:'local-a',name:'Agent',email:'a@example.com',role:'agent'}
  const response=await hub.fetch(new Request('https://hub.test/api/social/submit',{method:'POST',body:JSON.stringify({commandId:'new-1',caption:'Synthetic draft',platforms:['one'],...invalid})}),env as any,{} as any)
  expect(response.status).toBe(400)
 })
 it('does not serve a private object merely because the user knows its key',async()=>{
  state.user={id:'local-a',name:'Agent',email:'a@example.com',role:'agent'}
  expect((await hub.fetch(new Request('https://hub.test/storage/private.pdf'),env as any,{} as any)).status).toBe(404)
  expect(bucket.get).not.toHaveBeenCalled()
 })
})
