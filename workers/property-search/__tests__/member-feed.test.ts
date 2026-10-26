import {describe,it,expect,vi} from 'vitest'
import {checkMemberFeed,memberFeedPage} from '../src/feed-check.mjs'
import {handleRequest} from '../src/runtime.mjs'
const env={MLS_GRID_ACCESS_TOKEN:'test-only-secret',APP_ENV:'staging',DATASET:'synthetic',PUBLIC_ORIGIN:'https://preview-search.primeamericany.com',FEED_OPERATOR_EMAIL:'owner@example.invalid'}
const member={OriginatingSystemName:'onekey2',MlgCanView:true,MlgCanUse:['IDX'],MemberKey:'private-member-key',MemberMlsId:'private-member-id',MemberFullName:'Private person',Media:[{Permission:['Public'],MediaURL:'https://media.mlsgrid.com/member?token=signed-secret'}]}
describe('Bounded owner-only Member feed check',()=>{
 it('requests only a bounded Member sample and returns aggregate media availability',async()=>{
  const fetcher=vi.fn(async(_url:string,_options:RequestInit)=>Response.json({value:[member,{...member,Media:[{...member.Media[0],Permission:['Private']}]},{...member,MlgCanUse:['VOW']}],'@odata.nextLink':'https://untrusted.example/private'}))
  const result=await checkMemberFeed(env,fetcher)
  expect(result).toMatchObject({state:'connected',sampledMembers:3,membersWithMedia:3,membersWithPublicMedia:1,publicMediaEntries:1,membersAllowingIdx:2})
  const [url,options]=fetcher.mock.calls[0]
  const parsed=new URL(url);expect(parsed.pathname).toBe('/v2/Member');expect(parsed.searchParams.get('$top')).toBe('10');expect(parsed.searchParams.get('$expand')).toBe('Media')
  expect(parsed.searchParams.has('$select')).toBe(false)
  expect(options.redirect).toBe('manual');expect(fetcher).toHaveBeenCalledTimes(1)
  const output=JSON.stringify(result)+memberFeedPage(env,result)
  for(const secret of ['test-only-secret','private-member-key','private-member-id','Private person','signed-secret','untrusted.example'])expect(output).not.toContain(secret)
 })
 it('distinguishes empty, inaccessible and invalid samples without retrying',async()=>{
  expect((await checkMemberFeed(env,async()=>Response.json({value:[]}))).state).toBe('connected_empty')
  for(const [status,state]of [[401,'authentication_failed'],[403,'access_denied'],[429,'rate_limited'],[302,'upstream_error']]as const){const fetcher=vi.fn(async()=>new Response('secret',{status}));expect((await checkMemberFeed(env,fetcher)).state).toBe(state);expect(fetcher).toHaveBeenCalledTimes(1)}
  for(const value of [[{...member,OriginatingSystemName:'other'}],[{...member,MlgCanView:false}],Array(11).fill(member)])expect((await checkMemberFeed(env,async()=>Response.json({value}))).state).toBe('invalid_response')
  expect((await checkMemberFeed(env,async()=>new Response('x'.repeat(1048577)))).state).toBe('invalid_response')
  const rejected=await checkMemberFeed(env,async()=>Response.json({error:{message:'Member media is not supported: test-only-secret'}},{status:400}))
  expect(rejected.providerFlags).toMatchObject({mentionsMember:true,mentionsUnsupported:true});expect(JSON.stringify(rejected)).not.toContain('test-only-secret')
 })
 it('uses the existing owner and same-origin protections; GET never calls the provider',async()=>{
  const authorize=vi.fn(async()=>true),feedFetcher=vi.fn(async()=>Response.json({value:[member]})),url=env.PUBLIC_ORIGIN+'/ops/mls-members'
  expect((await handleRequest(new Request(url),env,{authorize,feedFetcher})).status).toBe(200);expect(feedFetcher).not.toHaveBeenCalled()
  expect((await handleRequest(new Request(url,{method:'POST'}),env,{authorize,feedFetcher})).status).toBe(403)
  expect((await handleRequest(new Request(url,{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN}}),env,{authorize:async()=>false,feedFetcher})).status).toBe(403)
  const response=await handleRequest(new Request(url,{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN}}),env,{authorize,feedFetcher})
  expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(await response.text()).toContain('OneKey Member access verified')
  expect(authorize).toHaveBeenCalledWith(expect.any(Request),env,undefined,expect.any(Number),env.FEED_OPERATOR_EMAIL)
 })
})
