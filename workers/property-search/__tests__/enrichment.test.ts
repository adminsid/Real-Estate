import {describe,it,expect,vi} from 'vitest'
import {databaseFixture} from './production-fixture'
import {requestEnrichment,enrichmentStatus} from '../src/enrichment.mjs'
import {syncLive} from '../src/sync.mjs'
import {handleProduction} from '../src/production.mjs'
import {downloadPhotos} from '../src/live-media.mjs'
import {followListing} from '../../../scripts/mls-grid/listing-enrichment.mjs'

const now=Date.parse('2026-10-27T08:00:00Z'),origin='https://preview-search.primeamericany.com'
const row=(id='KEY-1',overrides:Record<string,unknown>={})=>({OriginatingSystemName:'onekey2',ListingKey:id,ListingId:'MLS-'+id,MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',PropertyType:'Residential',StateOrProvince:'NY',CountyOrParish:'Queens',ModificationTimestamp:'2026-10-26T12:00:00Z',Media:[0,1,2].map(i=>({MediaKey:id+'-P'+i,Permission:['Public'],Order:i,MediaURL:'https://media.mlsgrid.com/'+id+'-'+i})),...overrides})
const image=()=>new Response(new Uint8Array([255,216,255,0]))
const env=(db:ReturnType<typeof databaseFixture>['db'])=>({PHOTO_IMPORT_MODE:'on-demand',LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})}})
async function seeded(rows=[row()]){
 const fixture=databaseFixture(),lease=await fixture.repo.acquire(now)
 await fixture.repo.apply(rows,null,lease,now);await fixture.repo.apply([],null,lease,now);await fixture.repo.release(lease)
 return fixture
}

describe('On-demand listing enrichment',()=>{
 it('coalesces repeat visits without moving priority, enforces cooldown and ignores unknown listings',async()=>{
  const {db,sqlite}=await seeded()
  try{
   expect((await requestEnrichment(db,'onekey2','MISSING',now)).state).toBe('available')
   await requestEnrichment(db,'onekey2','KEY-1',now);await requestEnrichment(db,'onekey2','KEY-1',now+100)
   expect(sqlite.prepare('SELECT requested_at FROM listing_enrichment').get()?.requested_at).toBe(now)
   sqlite.prepare('UPDATE listing_enrichment SET completed_at=?').run(now+1000)
   await requestEnrichment(db,'onekey2','KEY-1',now+10000)
   expect((await enrichmentStatus(db,'onekey2','KEY-1',now+10000)).state).toBe('available')
   await requestEnrichment(db,'onekey2','KEY-1',now+1000000)
   expect((await enrichmentStatus(db,'onekey2','KEY-1',now+1000000)).state).toBe('queued')
  }finally{sqlite.close()}
 })
 it('bounds admission globally and deletes demand when a source permission is revoked',async()=>{
  const {db,sqlite,repo}=await seeded()
  try{
   for(let i=0;i<500;i++)sqlite.prepare('INSERT INTO listing_enrichment(source,listing_id,requested_at) VALUES (?,?,?)').run('onekey2','OTHER'+i,now)
   await requestEnrichment(db,'onekey2','KEY-1',now)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_enrichment').get()?.n).toBe(500)
   sqlite.exec('DELETE FROM listing_enrichment');await requestEnrichment(db,'onekey2','KEY-1',now)
   const lease=await repo.acquire(now)
   await repo.apply([row('KEY-1',{MlgCanView:false,ModificationTimestamp:'2026-10-27T07:00:00Z'})],null,lease,now,false)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_enrichment').get()?.n).toBe(0)
  }finally{sqlite.close()}
 })
 it('imports a requested gallery ahead of covers without changing the feed watermark',async()=>{
  const target=row(),background=row('KEY-2'),{db,sqlite,repo}=await seeded([target,background]),calls:string[]=[]
  try{
   sqlite.exec('UPDATE listing_media SET attempted_at=0');await requestEnrichment(db,'onekey2','KEY-1',now)
   const watermark=(await repo.state()).watermark
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:0,maxPhotos:8,fetcher:async(input:string)=>{
    calls.push(input);if(input.startsWith('https://media.')){if(input.includes('KEY-1'))expect((await enrichmentStatus(db,'onekey2','KEY-1',now)).state).toBe('loading');return image()}
    const filter=new URL(input).searchParams.get('$filter')||''
    return Response.json({value:[target,background].filter(item=>filter.includes("'"+item.ListingId+"'"))})
   }})
   expect(result.status).toBe('ok');expect(result.demandProcessed).toBe(1)
   expect(calls.filter(url=>url.startsWith('https://media.'))).toEqual(['https://media.mlsgrid.com/KEY-1-0','https://media.mlsgrid.com/KEY-1-1','https://media.mlsgrid.com/KEY-1-2','https://media.mlsgrid.com/KEY-2-0'])
   expect((await repo.state()).watermark).toBe(watermark)
   expect((await enrichmentStatus(db,'onekey2','KEY-1',now)).state).toBe('available')
   expect(sqlite.prepare('SELECT requests FROM feed_budget').get()?.requests).toBe(6)
  }finally{sqlite.close()}
 })
 it('retains a newly requeued request when cleaning old completed requests',async()=>{
  const {db,sqlite}=await seeded()
  try{
   await requestEnrichment(db,'onekey2','KEY-1',now)
   sqlite.prepare('UPDATE listing_enrichment SET completed_at=?').run(now)
   const later=now+1000000
   await requestEnrichment(db,'onekey2','KEY-1',later)
   await syncLive(env(db),{now:()=>later,pause:async()=>{},maxPages:0,maxPhotos:8,fetcher:vi.fn()})
   expect((await enrichmentStatus(db,'onekey2','KEY-1',later)).state).toBe('waiting')
  }finally{sqlite.close()}
 })
 it('checks completed feed changes after one minute without waiting for photo completion',async()=>{
  const {db,sqlite}=await seeded(),fetcher=vi.fn(async()=>Response.json({value:[]}))
  try{
   sqlite.prepare('UPDATE feed_state SET last_complete=?').run(new Date(now-61000).toISOString())
   expect((await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPhotos:0,fetcher})).status).toBe('ok')
   expect(fetcher).toHaveBeenCalledOnce()
  }finally{sqlite.close()}
 })
 it('does not regenerate recently acquired media URLs in response to a click',async()=>{
  const {db,sqlite}=await seeded(),fetcher=vi.fn()
  try{
   await requestEnrichment(db,'onekey2','KEY-1',now)
   await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:0,maxPhotos:8,fetcher})
   expect(fetcher).not.toHaveBeenCalled()
   expect(await enrichmentStatus(db,'onekey2','KEY-1',now)).toMatchObject({state:'waiting',readyPhotos:0,knownPhotos:3,retryAt:new Date(now+3600000).toISOString()})
  }finally{sqlite.close()}
 })
 it('commits all primary pages before downloading covers and never fills unrequested galleries',async()=>{
  const {db,sqlite}=databaseFixture(),calls:string[]=[]
  try{
   let page=0
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:2,maxPhotos:8,fetcher:async(input:string)=>{
    if(input.startsWith('https://media.')){calls.push('photo');return image()}
    calls.push('facts');page++
    return Response.json({value:[row('PAGE'+page)],...(page===1?{'@odata.nextLink':"https://api.mlsgrid.com/v2/Property?$filter=OriginatingSystemName%20eq%20'onekey2'&$skip=100"}:{})})
   }})
   expect(result.status).toBe('ok');expect(result.records).toBe(2)
   expect(calls).toEqual(['facts','facts','photo','photo'])
   expect(sqlite.prepare("SELECT COUNT(*) AS n FROM listing_media WHERE state='ready'").get()?.n).toBe(2)
  }finally{sqlite.close()}
 })
 it('skips existing covers and private media while selecting one public cover per listing',async()=>{
  const first=row('FIRST'),second=row('SECOND'),{db,sqlite,repo}=await seeded([first,second]),lease=await repo.acquire(now)
  try{
   sqlite.exec("UPDATE listing_media SET state='ready' WHERE listing_id='FIRST' AND position=0;UPDATE listings SET has_photos=1 WHERE id='FIRST'")
   const result=await downloadPhotos([first,second],env(db),async()=>{},{now:()=>now,coversOnly:true,maxDownloads:20,fetcher:async()=>image()})
   expect(result.ready).toBe(1)
   expect(sqlite.prepare("SELECT COUNT(*) AS n FROM listing_media WHERE listing_id='SECOND' AND state='ready'").get()?.n).toBe(1)
   await repo.release(lease)
  }finally{sqlite.close()}
 })
 it('requires same-origin POST and returns only safe progress without calling MLS',async()=>{
  const {db,sqlite}=await seeded(),config={...env(db),PUBLIC_ORIGIN:origin,SEARCH_DB:db}
  const path=origin+'/api/listing/onekey2/KEY-1/enrich'
  try{
   expect((await handleProduction(new Request(path),config,{privateReview:true,now})).status).toBe(403)
   expect((await handleProduction(new Request(path,{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'}}),config,{privateReview:true,now})).status).toBe(403)
   const response=await handleProduction(new Request(path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'}}),config,{privateReview:true,now})
   expect(response.status).toBe(202);expect(await response.json()).toEqual({enrichment:{state:'queued',readyPhotos:0,knownPhotos:3,retryAt:null}})
   expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  }finally{sqlite.close()}
 })
 it('polls local updates, stops on cooldown and cancels safely when the visitor leaves',async()=>{
  const updated=vi.fn(),status=vi.fn(),fetcher=vi.fn(async(input:string)=>input.endsWith('/enrich')?Response.json({}):Response.json({listing:{id:'KEY-1',media:[]},enrichment:{state:'waiting'}}))
  const stop=followListing({source:'onekey2',id:'KEY-1'},{fetcher,visible:()=>true,onUpdate:updated,onStatus:status})
  await vi.waitFor(()=>expect(updated).toHaveBeenCalledOnce())
  expect(fetcher).toHaveBeenCalledTimes(2);expect(status).toHaveBeenCalledWith({state:'waiting'});stop()
 })
})
