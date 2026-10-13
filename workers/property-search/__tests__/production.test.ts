import { describe,it,expect,vi } from 'vitest'
import { databaseFixture } from './production-fixture'
import { readFileSync } from 'node:fs'
import { replica,timestampKey } from '../src/replica.mjs'
import { feedReady,syncLive } from '../src/sync.mjs'
import { downloadPhotos } from '../src/live-media.mjs'
import { handleProduction } from '../src/production.mjs'
import { searchStore } from '../src/store.mjs'
import { searchQuery } from '../../../scripts/mls-grid/search-query.mjs'

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
   expect((await store.search({borough:'NYC',q:'maple'})).total).toBe(0)
   expect((await store.search({borough:'NYC',q:'11355'})).total).toBe(1)
   expect((await store.search({borough:'NYS',q:'maple'})).total).toBe(1)
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
 it('does no per-photo work for listings excluded from the replica',async()=>{
  const {sqlite,db}=databaseFixture(),prepared=vi.spyOn(db,'prepare')
  const outside=Array.from({length:20},(_,i)=>row({ListingKey:`OUT-${i}`,CountyOrParish:'Nassau',Media:Array.from({length:30},(_,j)=>({MediaKey:`P-${i}-${j}`,Permission:['Public']}))}))
  try {
   expect(await downloadPhotos(outside,{LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},async()=>{})).toEqual({attempted:0,ready:0,failed:0})
   expect(prepared.mock.calls.length).toBeLessThanOrEqual(2)
  }finally{sqlite.close()}
 })
 it('bounds database work when 100 retained listings already have ready photos',async()=>{
  const {sqlite,repo,db}=databaseFixture(),lease=await repo.acquire(now)
  const rows=Array.from({length:100},(_,i)=>row({ListingKey:`READY-${i}`,Media:Array.from({length:10},(_,j)=>({MediaKey:`PHOTO-${i}-${j}`,Permission:['Public']}))}))
  try {
   await repo.apply(rows,null,lease,now)
   sqlite.exec("UPDATE listing_media SET state='ready'")
   const prepared=vi.spyOn(db,'prepare'),fetcher=vi.fn()
   expect(await downloadPhotos(rows,{LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},async()=>{},{fetcher,now:()=>now})).toEqual({attempted:0,ready:0,failed:0})
   expect(prepared.mock.calls.length).toBeLessThanOrEqual(2)
   expect(fetcher).not.toHaveBeenCalled()
  }finally{sqlite.close()}
 })
 it('settles a bounded feed response to actual bytes without refunding request counts',async()=>{
  const {sqlite,repo}=databaseFixture(),lease=await repo.acquire(now)
  try {
   await repo.request(lease,now,8*1024*1024)
   await repo.settleBytes(lease,now,8*1024*1024,1000,now)
   expect(sqlite.prepare('SELECT requests,bytes FROM feed_budget').get()).toEqual({requests:1,bytes:1000})
   await expect(repo.settleBytes(lease,now,8*1024*1024,9*1024*1024,now)).rejects.toThrow('byte accounting')
   await expect(repo.settleBytes('wrong-lease',now,8*1024*1024,1000,now)).rejects.toThrow('lease expired')
  }finally{sqlite.close()}
 })
 it('bootstraps current marketing inventory and accepts 100-row bounded pages',async()=>{
  const {sqlite,db}=databaseFixture(),links:string[]=[]
  const rows=Array.from({length:100},(_,i)=>row({ListingKey:`N-${i}`,Media:[]}))
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},{fetcher:async(input:string)=>{links.push(input);return Response.json({value:rows})},pause:async()=>{},now:()=>now,maxPhotos:0})
   expect(result.status).toBe('ok');expect(result.records).toBe(100)
   expect(new URL(links[0]).searchParams.get('$top')).toBe('100')
   expect(new URL(links[0]).searchParams.get('$filter')).toContain("StandardStatus in ('Active','Coming Soon','Active Under Contract','Pending')")
   expect((await replica(db).state()).phase).toBe('catchup')
   await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},{fetcher:async(input:string)=>{links.push(input);return Response.json({value:[]})},pause:async()=>{},now:()=>now,maxPhotos:0})
   expect(new URL(links[1]).searchParams.get('$filter')).not.toContain('StandardStatus')
   expect(new URL(links[1]).searchParams.get('$filter')).not.toContain('MlgCanView')
  }finally{sqlite.close()}
 })
 it('charges fully consumed photo and redirect bodies instead of maximum reservations',async()=>{
  const {sqlite,db}=databaseFixture(),sourceRow=row(),image=new Uint8Array([255,216,255,0])
  const body=JSON.stringify({value:[sourceRow]}),redirectBody='redirect',requests:string[]=[]
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})}},{fetcher:async(input:string,init?:RequestInit)=>{
    requests.push(input)
    if(input.startsWith('https://api.'))return new Response(body)
    if(input.startsWith('https://media.')){expect(init?.headers).toEqual({'User-Agent':'test-only'});return new Response(redirectBody,{status:302,headers:{Location:'https://mlsgrid.'+'a'.repeat(32)+'.r2.cloudflarestorage.com/photo'}})}
    expect(init?.headers).toBeUndefined()
    return new Response(image,{headers:{'Content-Length':'20'}})
   },pause:async()=>{},now:()=>now})
   expect(result.status).toBe('ok');expect(result.photoAttempts).toBe(1)
   expect(sqlite.prepare('SELECT requests,bytes FROM feed_budget').get()).toEqual({requests:3,bytes:new TextEncoder().encode(body).length+redirectBody.length+20})
   expect(requests).toHaveLength(3)
  }finally{sqlite.close()}
 })
 it('keeps the full photo reservation for an interrupted stream',async()=>{
  const {sqlite,db}=databaseFixture(),sourceRow=row(),body=JSON.stringify({value:[sourceRow]})
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},{fetcher:async(input:string)=>input.startsWith('https://api.')?new Response(body):new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([255,216,255]));controller.error(Error('interrupted'))}})),pause:async()=>{},now:()=>now})
   expect(result.status).toBe('ok')
   expect(sqlite.prepare('SELECT requests,bytes FROM feed_budget').get()).toEqual({requests:2,bytes:new TextEncoder().encode(body).length+15*1024*1024})
   expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('failed')
  }finally{sqlite.close()}
 })
 it('retains the maximum reservation and never stores an oversized media body',async()=>{
  const {sqlite,db}=databaseFixture(),body=JSON.stringify({value:[row()]}),bucket={put:vi.fn()}
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:bucket},{fetcher:async(input:string)=>input.startsWith('https://api.')?new Response(body):new Response(new Uint8Array(15*1024*1024+1)),pause:async()=>{},now:()=>now})
   expect(result.status).toBe('ok');expect(bucket.put).not.toHaveBeenCalled()
   expect(sqlite.prepare('SELECT requests,bytes FROM feed_budget').get()).toEqual({requests:2,bytes:new TextEncoder().encode(body).length+15*1024*1024})
   expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('failed')
  }finally{sqlite.close()}
 })
 it('settles a consumed media error while preserving provider backoff and facts',async()=>{
  const {sqlite,db}=databaseFixture(),body=JSON.stringify({value:[row()]})
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},{fetcher:async(input:string)=>input.startsWith('https://api.')?new Response(body):new Response('throttled',{status:429}),pause:async()=>{},now:()=>now})
   expect(result.status).toBe('rate_limit')
   expect(sqlite.prepare('SELECT requests,bytes FROM feed_budget').get()).toEqual({requests:2,bytes:new TextEncoder().encode(body).length+9})
   expect((await replica(db).state()).retry_after).toBe(now+900000)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n).toBe(1)
  }finally{sqlite.close()}
 })
 it('backs off on throttling even when the media error body is interrupted',async()=>{
  const {sqlite,db}=databaseFixture(),body=JSON.stringify({value:[row()]})
  try {
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},{fetcher:async(input:string)=>input.startsWith('https://api.')?new Response(body):new Response(new ReadableStream({start(controller){controller.error(Error('interrupted error body'))}}),{status:429}),pause:async()=>{},now:()=>now})
   expect(result.status).toBe('rate_limit')
   expect(sqlite.prepare('SELECT requests,bytes FROM feed_budget').get()).toEqual({requests:2,bytes:new TextEncoder().encode(body).length+15*1024*1024})
   expect((await replica(db).state()).retry_after).toBe(now+900000)
  }finally{sqlite.close()}
 })
 it('does not regenerate still-valid backfill URLs on the next cron pass',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const covers=Array.from({length:12},(_,i)=>row({ListingKey:`BACKFILL-${i}`,ListingId:`KEYBACKFILL${i}`,Media:[0,1].map(j=>({MediaKey:`B-${i}-${j}`,Permission:['Public'],Order:j,MediaURL:`https://media.mlsgrid.com/backfill-${i}-${j}`}))}))
  const fetcher=vi.fn(async(input:string)=>input.startsWith('https://api.')?Response.json({value:covers}):new Response(new Uint8Array([255,216,255,0])))
  const env={LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})}}
  try {
   await repo.apply(covers,null,lease,now);sqlite.exec('UPDATE listing_media SET attempted_at=0');await repo.release(lease)
   const first=await syncLive(env,{fetcher,pause:async()=>{},now:()=>now,maxPages:0})
   expect(first.photoAttempts).toBe(12)
   const second=await syncLive(env,{fetcher,pause:async()=>{},now:()=>now+60000,maxPages:0})
   expect(second.photoAttempts).toBe(0)
   expect(fetcher.mock.calls.filter(([input])=>input.startsWith('https://api.'))).toHaveLength(1)
  }finally{sqlite.close()}
 })
 it('records URL freshness for recent failures without retrying them early',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const sourceRow=row({Media:[0,1].map(j=>({MediaKey:`M-${j}`,Permission:['Public'],Order:j,MediaURL:`https://media.mlsgrid.com/mixed-${j}`}))})
  const fetcher=vi.fn(async(input:string)=>input.startsWith('https://api.')?Response.json({value:[sourceRow]}):new Response(new Uint8Array([255,216,255,0])))
  const env={LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})}}
  try {
   await repo.apply([sourceRow],null,lease,now)
   sqlite.exec('UPDATE listing_media SET attempted_at=0')
   sqlite.prepare("UPDATE listing_media SET state='failed',attempted_at=? WHERE media_key='M-1'").run(now-3599999)
   await repo.release(lease)
   const first=await syncLive(env,{fetcher,pause:async()=>{},now:()=>now,maxPages:0})
   expect(first.photoAttempts).toBe(1)
   expect(sqlite.prepare("SELECT state,attempted_at FROM listing_media WHERE media_key='M-1'").get()).toEqual({state:'failed',attempted_at:now})
   const second=await syncLive(env,{fetcher,pause:async()=>{},now:()=>now+60000,maxPages:0})
   expect(second.photoAttempts).toBe(0)
   expect(fetcher.mock.calls.filter(([input])=>input.startsWith('https://api.'))).toHaveLength(1)
  }finally{sqlite.close()}
 })
 it('records fresh media URLs on price updates even when photo files are unchanged',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const sourceRow=row()
  try {
   await repo.apply([sourceRow],null,lease,now)
   sqlite.exec('UPDATE listing_media SET attempted_at=0')
   await repo.apply([row({ListPrice:510000,ModificationTimestamp:'2026-10-09T19:00:00Z'})],null,lease,now)
   expect(sqlite.prepare('SELECT attempted_at FROM listing_media').get()?.attempted_at).toBe(now)
  }finally{sqlite.close()}
 })
 it('starts no further photo jobs after the bounded run deadline',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now);let clock=now
  const rows=Array.from({length:3},(_,i)=>row({ListingKey:`DEADLINE-${i}`,Media:[{MediaKey:`D-${i}`,Permission:['Public'],MediaURL:`https://media.mlsgrid.com/deadline-${i}`}]}))
  try {
   await repo.apply(rows,null,lease,now)
   const result=await downloadPhotos(rows,{LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})},MLS_GRID_ACCESS_TOKEN:'test-only'},async()=>{}, {fetcher:async()=>{clock+=80000;return new Response(new Uint8Array([255,216,255,0]))},now:()=>clock,deadline:now+150000,maxDownloads:3})
   expect(result.attempted).toBe(2)
   expect(sqlite.prepare("SELECT COUNT(*) AS n FROM listing_media WHERE state='pending'").get()?.n).toBe(1)
  }finally{sqlite.close()}
 })
 it('downloads one ordered cover per listing before filling a gallery',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const rows=Array.from({length:3},(_,i)=>row({ListingKey:`COVER-${i}`,Media:[2,0,1].map(j=>({MediaKey:`P-${i}-${j}`,Permission:['Public'],Order:j,MediaURL:`https://media.mlsgrid.com/p-${i}-${j}`}))}))
  const downloaded:string[]=[]
  try {
   await repo.apply(rows,null,lease,now)
   const result=await downloadPhotos(rows,{LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})},MLS_GRID_ACCESS_TOKEN:'test-only'},async()=>{}, {fetcher:async(input:string)=>{downloaded.push(input);return new Response(new Uint8Array([255,216,255,0]))},now:()=>now,maxDownloads:3})
   expect(result.ready).toBe(3)
   expect(downloaded).toEqual(['https://media.mlsgrid.com/p-0-0','https://media.mlsgrid.com/p-1-0','https://media.mlsgrid.com/p-2-0'])
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings WHERE has_photos=1').get()?.n).toBe(3)
  }finally{sqlite.close()}
 })
 it('backfills listings without cover photos ahead of an existing gallery',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const gallery=row({ListingKey:'A-GALLERY',ListingId:'KEYGALLERY',Media:[0,1].map(j=>({MediaKey:`G-${j}`,Permission:['Public'],Order:j,MediaURL:`https://media.mlsgrid.com/gallery-${j}`}))})
  const covers=Array.from({length:12},(_,i)=>row({ListingKey:`B-COVER-${i}`,ListingId:`KEYCOVER${i}`,Media:[{MediaKey:`C-${i}`,Permission:['Public'],Order:0,MediaURL:`https://media.mlsgrid.com/cover-${i}`}]}))
  const requested:string[]=[]
  try {
   await repo.apply([gallery,...covers],null,lease,now)
   sqlite.exec("UPDATE listing_media SET attempted_at=0; UPDATE listing_media SET state='ready' WHERE media_key='G-0'; UPDATE listings SET has_photos=1 WHERE id='A-GALLERY'")
   await repo.release(lease)
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})}},{fetcher:async(input:string)=>{
    if(input.startsWith('https://api.')){requested.push(input);const filter=new URL(input).searchParams.get('$filter') || '';return Response.json({value:covers.filter(item=>filter.includes(`'${item.ListingId}'`))})}
    return new Response(new Uint8Array([255,216,255,0]))
   },pause:async()=>{},now:()=>now,maxPages:0})
   expect(result.status).toBe('ok');expect(result.photoAttempts).toBe(12)
   const filter=new URL(requested[0]).searchParams.get('$filter')
   expect(filter).not.toContain('KEYGALLERY')
   for(let i=0;i<12;i++)expect(filter).toContain(`'KEYCOVER${i}'`)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings WHERE has_photos=1').get()?.n).toBe(13)
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
