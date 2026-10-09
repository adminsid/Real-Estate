import { describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { authorized } from '../src/access.mjs'
import { handleRequest } from '../src/runtime.mjs'
import { searchStore } from '../src/store.mjs'
import { publicProjection } from '../../../scripts/mls-grid/client.mjs'

const origin = 'https://preview-search.primeamericany.com'
const schema = readFileSync(new URL('../migrations/0001_search_staging.sql', import.meta.url), 'utf8')
function fixture() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(schema)
  for (let i=0;i<110;i++) {
    const row = { ListingKey:`TEST-${i}`,OriginatingSystemName:'synthetic',ListingId:`TEST-${i}`,MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',PropertyType:'Residential',CountyOrParish:'Queens',StateOrProvince:'NY',ListPrice:100000+i,BedroomsTotal:2,UnparsedAddress:`${i} Fictional Lane`,ModificationTimestamp:'2026-10-08T00:00:00Z',OnMarketDate:'2026-10-08',InternetAddressDisplayYN:i!==0,Latitude:40.7,Longitude:-73.9,PublicRemarks:'Fictional address and description'}
    const listing=publicProjection(row)
    sqlite.prepare('INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?,?)').run('synthetic',row.ListingKey,'Active','Queens','NY',row.ListPrice,2,'Residential',row.UnparsedAddress.toLowerCase(),JSON.stringify(listing))
    sqlite.prepare('INSERT INTO listing_media VALUES (?,?,?,?,?,?,?,?)').run('synthetic',row.ListingKey,'test',null,'a'.repeat(64),'image/svg+xml',0,'Fictional illustration')
  }
  const db = {
    prepare(sql: string) {
      let values: (string|number)[]=[]
      return {
        bind(...next: (string|number)[]) {if(next.length>100)throw Error('D1 parameter limit');values=next;return this},
        async first() {return sqlite.prepare(sql).get(...values) || null},
        async all() {return {results:sqlite.prepare(sql).all(...values)}},
        async run() {const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}},
      }
    },
  }
  const env={APP_ENV:'staging',PUBLIC_ORIGIN:origin,DATASET:'synthetic',ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'test-audience',SEARCH_DB:db,SEARCH_MEDIA:{get:vi.fn(async()=>({body:'<svg xmlns="http://www.w3.org/2000/svg"/>',size:41}))},ASSETS:{fetch:vi.fn(async(request: Request)=>new Response(request.url.endsWith('/_template.html')?readFileSync(new URL('../../../scripts/mls-grid/preview.html',import.meta.url),'utf8'):'/* asset */'))}}
  return {sqlite,env,store:searchStore(db)}
}
describe('Private search staging',()=>{
  it('fails closed before reading data or static assets on every route',async()=>{
    const {sqlite,env}=fixture()
    try {for(const path of ['/','/app.mjs','/api/search','/api/listing/synthetic/TEST-0','/media/'+ 'a'.repeat(64),'/api/inquiries','/ops/mls-grid']) {
      const response=await handleRequest(new Request(origin+path),env)
      expect(response.status).toBe(403);expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
    }expect(env.ASSETS.fetch).not.toHaveBeenCalled();expect(env.SEARCH_MEDIA.get).not.toHaveBeenCalled()}finally{sqlite.close()}
  })
  it('supports 96-card pages and 100 saved identities within D1 parameter limits',async()=>{
    const {sqlite,store}=fixture()
    try {
      const result=await store.search({borough:'NYC',limit:'96',savedOnly:'1',saved:Array.from({length:100},(_,i)=>`synthetic:TEST-${i}`).join(',')})
      expect(result.total).toBe(100);expect(result.listings).toHaveLength(96);expect(result.listings[0].media).toHaveLength(1)
      expect(result.listings[0].Latitude).toBeUndefined();expect(result.listings[0].PublicRemarks).toBeUndefined();expect(result.listings[0].media[0].caption).toBe('')
      expect((await store.search({limit:'12',offset:'12'})).offset).toBe(12)
      await expect(store.search({sort:'price; DELETE FROM listings'})).rejects.toThrow('Invalid sort')
    }finally{sqlite.close()}
  })
  it('serves SSR deep links, private media, and removes revoked listing media',async()=>{
    const {sqlite,env}=fixture(), authorize=async()=>true
    try {
      const page=await handleRequest(new Request(origin+'/listing/synthetic/TEST-1'),env,{authorize})
      expect(page.status).toBe(200);const html=await page.text();expect(html).toContain('1 Fictional Lane');expect(html).toContain('rel="canonical"');expect(html).toContain('Synthetic listings · private staging')
      const photo=await handleRequest(new Request(origin+'/media/'+ 'a'.repeat(64)),env,{authorize});expect(photo.status).toBe(200);expect(photo.headers.get('Cache-Control')).toBe('private, no-store')
      sqlite.exec('DELETE FROM listings')
      expect((await handleRequest(new Request(origin+'/media/'+ 'a'.repeat(64)),env,{authorize})).status).toBe(404)
      expect((await handleRequest(new Request(origin+'/listing/synthetic/TEST-1'),env,{authorize})).status).toBe(404)
    }finally{sqlite.close()}
  })
  it('saves demo inquiries without delivery and rejects cross-origin or oversized requests',async()=>{
    const {sqlite,env}=fixture(),authorize=async()=>true
    const inquiry={source:'synthetic',id:'TEST-1',kind:'message',name:'Test consumer',email:'test@example.invalid',message:'Synthetic test only'}
    const request=(body: string,from=origin)=>new Request(origin+'/api/inquiries',{method:'POST',headers:{Origin:from,'Content-Type':'application/json'},body})
    try {
      const response=await handleRequest(request(JSON.stringify(inquiry)),env,{authorize});expect(response.status).toBe(201);expect((await response.json()).demo).toBe(true)
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM demo_inquiries').get()?.count).toBe(1)
      expect((await handleRequest(request(JSON.stringify(inquiry),'https://another.example'),env,{authorize})).status).toBe(403)
      expect((await handleRequest(request('x'.repeat(17000)),env,{authorize})).status).toBe(400)
      expect((await handleRequest(new Request(origin+'/api/brand',{method:'POST'}),env,{authorize})).status).toBe(405)
    }finally{sqlite.close()}
  })
})

describe('Cloudflare Access verification',()=>{
  it('verifies signatures, issuer, audience and times instead of trusting supplied headers',async()=>{
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
    const jwk={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'},now=Date.now(),env={ACCESS_TEAM_DOMAIN:'test.cloudflareaccess.com',ACCESS_AUD:'expected'}
    const encode=(text: string)=>Buffer.from(text).toString('base64url')
    async function token(extra={},algorithm='RS256') {
      const value=encode(JSON.stringify({alg:algorithm,kid:'test-key'}))+'.'+encode(JSON.stringify({iss:'https://test.cloudflareaccess.com',aud:['expected'],exp:now/1000+600,iat:now/1000-60,...extra}))
      return value+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(value))).toString('base64url')
    }
    const fetcher=vi.fn(async()=>Response.json({keys:[jwk]})),request=(jwt: string)=>new Request(origin,{headers:{'Cf-Access-Jwt-Assertion':jwt}})
    expect(await authorized(request(await token()),env,fetcher,now)).toBe(true)
    expect(fetcher).toHaveBeenCalledWith('https://test.cloudflareaccess.com/cdn-cgi/access/certs',expect.objectContaining({redirect:'manual'}))
    expect(await authorized(request(await token()),env,async()=>new Response(null,{status:302,headers:{Location:'https://untrusted.example/certs'}}),now)).toBe(false)
    for(const claims of [{aud:['other']},{iss:'https://other.cloudflareaccess.com'},{exp:now/1000-1},{iat:now/1000+120},{nbf:now/1000+120}])expect(await authorized(request(await token(claims)),env,fetcher,now)).toBe(false)
    expect(await authorized(request(await token({},'HS256')),env,fetcher,now)).toBe(false)
    expect(await authorized(request(await token({email:'owner@example.invalid'})),env,fetcher,now,'owner@example.invalid')).toBe(true)
    expect(await authorized(request(await token({email:'someone@example.invalid'})),env,fetcher,now,'owner@example.invalid')).toBe(false)
    expect(await authorized(request(await token()),env,fetcher,now,'owner@example.invalid')).toBe(false)
    const forged=(await token()).split('.');forged[1]=encode(JSON.stringify({iss:'https://test.cloudflareaccess.com',aud:['expected'],exp:now/1000+10000,iat:now/1000-60}))
    expect(await authorized(request(forged.join('.')),env,fetcher,now)).toBe(false)
    expect(await authorized(request(await token()),{...env,ACCESS_AUD:''},fetcher,now)).toBe(false)
    expect(await authorized(request(await token()),env,async()=>new Response('x'.repeat(70000)),now)).toBe(false)
  })
})
