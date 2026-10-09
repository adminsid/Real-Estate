import { describe,it,expect,vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { replica,timestampKey } from '../src/replica.mjs'
import { feedReady,syncLive } from '../src/sync.mjs'
import { downloadPhotos } from '../src/live-media.mjs'
import { handleProduction } from '../src/production.mjs'
import { searchStore } from '../src/store.mjs'
import { searchQuery } from '../../../scripts/mls-grid/search-query.mjs'

export function databaseFixture() {
 const sqlite=new DatabaseSync(':memory:')
 sqlite.exec(readFileSync(new URL('../production-migrations/0001_replica.sql',import.meta.url),'utf8'))
 function prepare(sql:string) {
  let values: (string|number|null)[]=[]
  return {
   bind(...next: (string|number|null)[]){if(next.length>100)throw Error('D1 parameter limit');values=next;return this},
   async first(){return sqlite.prepare(sql).get(...values)||null},
   async all(){return {results:sqlite.prepare(sql).all(...values)}},
   async run(){const result=sqlite.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}}},
  }
 }
 const db={prepare,async batch(statements:ReturnType<typeof prepare>[]) {
  sqlite.exec('BEGIN');try {const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}
 }}
 return {sqlite,db,repo:replica(db)}
}
const now=Date.parse('2026-10-09T20:00:00Z')
const row=(overrides:Record<string,unknown>={})=>({OriginatingSystemName:'onekey2',ListingKey:'KEY-1',ListingId:'KEY1001',MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',PropertyType:'Residential',CountyOrParish:'Queens',StateOrProvince:'NY',City:'Flushing',PostalCode:'11355',UnparsedAddress:'123 Maple Avenue',StreetNumber:'123',StreetName:'Maple',ListPrice:500000,BedroomsTotal:2,ModificationTimestamp:'2026-10-09T18:00:00.123100Z',OnMarketDate:'2026-10-08',ListOfficeName:'Test brokerage',ListAgentFullName:'Test agent',AttributionContact:'agent@example.invalid',PrivateRemarks:'NEVER PUBLIC',Media:[{MediaKey:'PHOTO-1',Permission:['Public'],MediaModificationTimestamp:'2026-10-09T18:00:00Z',MediaURL:'https://media.mlsgrid.com/test?secret=signed',Order:0}],...overrides})
const configure=(db:ReturnType<typeof databaseFixture>['db'])=>({APP_ENV:'production',PUBLIC_ORIGIN:'https://search.primeamericany.com',APPROVED_IDX_ORIGIN:'https://search.primeamericany.com',PUBLIC_RELEASE_ENABLED:'true',DISPLAY_REVIEW_COMPLETE:'true',SEARCH_DB:db,SEARCH_RATE_LIMIT:{limit:vi.fn(async()=>({success:true}))},PHOTO_RATE_LIMIT:{limit:vi.fn(async()=>({success:true}))},SEARCH_MEDIA:{get:vi.fn(async()=>({body:'image',size:5}))},ASSETS:{fetch:vi.fn(async()=>new Response(readFileSync(new URL('../../../scripts/mls-grid/preview.html',import.meta.url),'utf8')))}})

async function seeded() {
 const fixture=databaseFixture(),lease=await fixture.repo.acquire(now)
 await fixture.repo.apply([row()],null,lease,now)
 await fixture.repo.apply([],null,lease,now)
 return {...fixture,lease}
}
describe('Production listing replica',()=>{
 it('retains sub-millisecond removals and the exact provider watermark',async()=>{
  const {sqlite,repo,db,lease}=await seeded()
  try {
   await repo.apply([row({MlgCanView:false,ModificationTimestamp:'2026-10-09T18:00:00.123900Z'})],null,lease,now)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n).toBe(0)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_media').get()?.n).toBe(0)
   await repo.apply([row()],null,lease,now)
   expect((await searchStore(db,{production:true}).search({})).total).toBe(0)
   expect((await repo.state()).watermark).toBe('2026-10-09T18:00:00.123900Z')
   expect(timestampKey('2026-10-09T18:00:00Z')<timestampKey('2026-10-09T18:00:00.1Z')).toBe(true)
  }finally{sqlite.close()}
 })
 it('does not publish a visible-only bootstrap before an unfiltered catch-up',async()=>{
  const {sqlite,repo,db}=databaseFixture(),lease=await repo.acquire(now)
  try {
   await repo.apply([row()], 'https://api.mlsgrid.com/v2/Property?next=1',lease,now)
   await repo.apply([row({ListingKey:'KEY-2',ModificationTimestamp:'2026-10-09T19:00:00Z'})],null,lease,now)
   expect(await feedReady(db,now)).toBe(false)
   expect((await repo.state()).watermark).toBe(row().ModificationTimestamp)
   await repo.apply([row({MlgCanView:false,ModificationTimestamp:'2026-10-09T18:30:00Z'})],null,lease,now)
   expect(await feedReady(db,now)).toBe(true)
   expect(sqlite.prepare('SELECT id FROM listings ORDER BY id').all()).toEqual([{id:'KEY-2'}])
   expect((await repo.state()).watermark).toBe('2026-10-09T19:00:00Z')
  }finally{sqlite.close()}
 })
 it('advances checkpoint for excluded records, sanitizes withheld addresses, and uses indexed text',async()=>{
  const {sqlite,repo,db,lease}=await seeded()
  try {
   await repo.apply([row({InternetAddressDisplayYN:false,PublicRemarks:'Secret address 123 Maple',ModificationTimestamp:'2026-10-09T19:00:00Z'}),row({ListingKey:'KEY-OUT',CountyOrParish:'Nassau',ModificationTimestamp:'2026-10-09T19:30:00Z'})],null,lease,now)
   const store=searchStore(db,{production:true}),listing=await store.listing('onekey2','KEY-1')
   expect(listing.UnparsedAddress).toBeUndefined();expect(listing.PrivateRemarks).toBeUndefined();expect(listing.PublicRemarks).toBeUndefined();expect(listing.media).toHaveLength(0)
   expect((await store.search({q:'maple'})).total).toBe(0)
   expect((await store.search({q:'11355'})).total).toBe(1)
   expect((await repo.state()).watermark).toBe('2026-10-09T19:30:00Z')
   const q=searchQuery({type:'Residential',status:'Active',sort:'priceAsc'},new Date(now),true)
   const plan=sqlite.prepare(`EXPLAIN QUERY PLAN SELECT id FROM listings WHERE ${q.where} ORDER BY ${q.sortExpression},id,source LIMIT 24`).all(...q.values)
   expect(JSON.stringify(plan)).toContain('listing_price');expect(JSON.stringify(plan)).not.toContain('TEMP B-TREE')
  }finally{sqlite.close()}
 })
 it('fences expired sync runs and retains rolling budgets across midnight',async()=>{
  const {sqlite,repo,lease}=await seeded()
  try {
   await expect(repo.apply([row({MlgCanView:false})],null,'other-run',now)).rejects.toThrow('lease expired')
   sqlite.prepare('INSERT INTO feed_budget VALUES (?,?,?)').run(Math.floor(now/3600000)-1,1,2990000000)
   await expect(repo.request(lease,now)).rejects.toThrow('budget')
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n).toBe(1)
  }finally{sqlite.close()}
 })
 it('reads the replication cursor only after acquiring its exclusive lease',async()=>{
  const {sqlite,db}=databaseFixture()
  let acquired=false
  const protectedDb={...db,prepare(sql:string) {
   const statement=db.prepare(sql)
   if(sql==='SELECT * FROM feed_state WHERE source=?') {
    const first=statement.first.bind(statement)
    statement.first=async()=>{expect(acquired).toBe(true);return first()}
   }
   if(sql.startsWith('UPDATE feed_state SET lease_id=')) {
    const run=statement.run.bind(statement)
    statement.run=async()=>{const result=await run();acquired=Boolean(result.meta.changes);return result}
   }
   return statement
  }}
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:protectedDb,LIVE_MEDIA:{put:vi.fn()}},{fetcher:async()=>Response.json({value:[]}),pause:async()=>{},now:()=>now,maxPages:1,maxPhotos:0})
   expect(result.status).toBe('ok');expect(result.initialComplete).toBe(false)
  }finally{sqlite.close()}
 })
 it('spaces actual request dispatches despite variable D1 reservation latency',async()=>{
  const {sqlite,db}=databaseFixture();let clock=now,reservations=0
  const dispatches:number[]=[]
  const slowDb={...db,prepare(sql:string) {
   const statement=db.prepare(sql)
   if(sql.startsWith('INSERT INTO feed_budget')) {
    const run=statement.run.bind(statement)
    statement.run=async()=>{clock+=reservations++===0?300:0;return run()}
   }
   return statement
  }}
  try {
   const fetcher=async()=>{dispatches.push(clock);return Response.json(dispatches.length<3?{value:[],'@odata.nextLink':`https://api.mlsgrid.com/v2/Property?$filter=OriginatingSystemName%20eq%20'onekey2'&$skip=${dispatches.length}`}:{value:[]})}
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:slowDb,LIVE_MEDIA:{put:vi.fn()}},{fetcher,pause:async(ms:number)=>{clock+=ms},now:()=>clock,maxPages:3,maxPhotos:0})
   expect(result.status).toBe('ok');expect(dispatches).toHaveLength(3)
   for(let i=1;i<dispatches.length;i++)expect(dispatches[i]-dispatches[i-1]).toBeGreaterThanOrEqual(550)
  }finally{sqlite.close()}
 })
 it('stores validated photo bytes privately and removes replaced or revoked manifests',async()=>{
  const {sqlite,repo,db,lease}=await seeded(),bucket={put:vi.fn(async()=>{})},fetcher=vi.fn(async()=>new Response(new Uint8Array([255,216,255,0])))
  try {
   const env={LIVE_DB:db,LIVE_MEDIA:bucket,MLS_GRID_ACCESS_TOKEN:'test-only'}
   const result=await downloadPhotos([row()],env,async()=>{}, {fetcher,now:()=>now})
   expect(result.ready).toBe(1);expect(bucket.put).toHaveBeenCalledOnce()
   const store=searchStore(db,{production:true});expect((await store.search({photosOnly:'1'})).total).toBe(1)
   expect(JSON.stringify(await store.listing('onekey2','KEY-1'))).not.toContain('signed')
   await repo.apply([row({Media:[],ModificationTimestamp:'2026-10-09T19:00:00Z'})],null,lease,now)
   expect((await store.search({photosOnly:'1'})).total).toBe(0)
   expect((await store.listing('onekey2','KEY-1')).media).toHaveLength(0)
  }finally{sqlite.close()}
 })
 it('does not let failed photos stop facts or checkpoint progress; media 429 backs off',async()=>{
  const {sqlite,repo,db}=databaseFixture()
  const sourceRow=row(),feed=vi.fn(async(input:string)=>input.startsWith('https://api.')?Response.json({value:[sourceRow]}):new Response('throttled',{status:429}))
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},{fetcher:feed,pause:async()=>{},now:()=>now,maxPages:1})
   expect(result.status).toBe('rate_limit');expect((await repo.state()).phase).toBe('catchup');expect((await repo.state()).retry_after).toBeGreaterThan(now)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n).toBe(1)
   expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('failed')
  }finally{sqlite.close()}
 })
 it('rechecks eligibility when a download finishes after a removal',async()=>{
  const {sqlite,repo,db,lease}=await seeded()
  try {
   const fetcher=async()=>{await repo.apply([row({MlgCanView:false,ModificationTimestamp:'2026-10-09T19:00:00Z'})],null,lease,now);return new Response(new Uint8Array([255,216,255,0]))}
   await downloadPhotos([row()],{LIVE_DB:db,LIVE_MEDIA:{put:async()=>{}},MLS_GRID_ACCESS_TOKEN:'test-only'},async()=>{}, {fetcher,now:()=>now})
   expect((await searchStore(db,{production:true}).search({})).total).toBe(0)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_media').get()?.n).toBe(0)
  }finally{sqlite.close()}
 })
})
describe('Public release gate and consumer routes',()=>{
 it('requires exact domain approval, completed display review, and a fresh completed feed',async()=>{
  const {sqlite,db}=await seeded(),env=configure(db)
  try {
   for(const settings of [{PUBLIC_RELEASE_ENABLED:'false'},{APPROVED_IDX_ORIGIN:'https://primeamericany.com'},{DISPLAY_REVIEW_COMPLETE:'false'}]) {
    for(const path of ['/','/app.mjs','/api/search','/media/'+'a'.repeat(64),'/sitemap.xml']) {
     const response=await handleProduction(new Request(env.PUBLIC_ORIGIN+path),{...env,...settings},{now});expect(response.status).toBe(503);expect(response.headers.get('X-Robots-Tag')).toContain('noindex')
    }
   }
   expect(env.ASSETS.fetch).not.toHaveBeenCalled();expect(env.SEARCH_MEDIA.get).not.toHaveBeenCalled()
   expect((await handleProduction(new Request(env.PUBLIC_ORIGIN+'/api/search'),env,{now:now+12*3600000+1})).status).toBe(503)
  }finally{sqlite.close()}
 })
 it('limits abusive reads before accessing inventory or photos and leaves static assets available',async()=>{
  const {sqlite,db}=await seeded(),env=configure(db)
  try {
   env.SEARCH_RATE_LIMIT.limit.mockResolvedValue({success:false});env.PHOTO_RATE_LIMIT.limit.mockResolvedValue({success:false})
   const first=vi.spyOn(db,'prepare')
   for(const path of ['/api/search','/listing/onekey2/KEY-1','/sitemap.xml','/media/'+'a'.repeat(64)]) {
    const response=await handleProduction(new Request(env.PUBLIC_ORIGIN+path,{headers:{'CF-Connecting-IP':'192.0.2.1'}}),env,{now})
    expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('60');expect(response.headers.get('Cache-Control')).toContain('no-store')
   }
   expect(first).not.toHaveBeenCalled();expect(env.SEARCH_MEDIA.get).not.toHaveBeenCalled()
   expect(env.SEARCH_RATE_LIMIT.limit).toHaveBeenCalledWith({key:'consumer:192.0.2.1'})
   expect((await handleProduction(new Request(env.PUBLIC_ORIGIN+'/app.mjs'),env,{now})).status).toBe(200)
   first.mockRestore()
  }finally{sqlite.close()}
 })
 it('renders canonical listing pages, sitemap links, and honest contact behavior without MLS calls',async()=>{
  const {sqlite,db}=await seeded(),env=configure(db)
  try {
   const page=await handleProduction(new Request(env.PUBLIC_ORIGIN+'/listing/onekey2/KEY-1'),env,{now}),html=await page.text()
   expect(page.status).toBe(200);expect(html).toContain('data-environment="production"');expect(html).toContain('href="https://search.primeamericany.com/listing/onekey2/KEY-1"');expect(html).toContain('index,follow')
   expect((await handleProduction(new Request(env.PUBLIC_ORIGIN+'/sitemap.xml?page=0'),env,{now})).status).toBe(200)
   expect((await handleProduction(new Request(env.PUBLIC_ORIGIN+'/api/inquiries',{method:'POST'}),env,{now})).status).toBe(405)
   const head=await handleProduction(new Request(env.PUBLIC_ORIGIN+'/api/search',{method:'HEAD'}),env,{now});expect(await head.text()).toBe('')
   sqlite.exec('DELETE FROM listings')
   expect((await handleProduction(new Request(env.PUBLIC_ORIGIN+'/listing/onekey2/KEY-1'),env,{now})).status).toBe(404)
  }finally{sqlite.close()}
 })
})
