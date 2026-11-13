import {describe,it,expect,vi} from 'vitest'
import {databaseFixture} from './production-fixture'
import {requestEnrichment} from '../src/enrichment.mjs'
import {runMediaJob} from '../src/media-jobs.mjs'
import {publishJobs,claimJob,finishJob,insertJob} from '../src/job-store.mjs'
import {searchStore} from '../src/store.mjs'

const time=Date.parse('2026-11-13T12:00:00Z')
const row=(extra:Record<string,unknown>={})=>({OriginatingSystemName:'onekey2',ListingKey:'KEY1',ListingId:'MLS1',MlgCanView:true,MlgCanUse:['IDX'],
 StateOrProvince:'NY',StandardStatus:'Active',PropertyType:'Residential',CountyOrParish:'Queens',ModificationTimestamp:'2026-11-13T11:00:00.123456Z',
 Media:[{MediaKey:'P1',Permission:['Public'],Order:0,MediaURL:'https://media.mlsgrid.com/p1'}],...extra})
async function seeded(){
 const fixture=databaseFixture(),lease=await fixture.repo.acquire(time)
 await fixture.repo.apply([row()],null,lease,time,false);await fixture.repo.release(lease)
 fixture.sqlite.exec("UPDATE source_control SET mode='independent';UPDATE listing_media SET attempted_at=0")
 const files=new Map<string,{body:Uint8Array,size:number,httpMetadata:{contentType:string}}>()
 const bucket={head:vi.fn(async(key:string)=>files.get(key)||null),get:vi.fn(async(key:string)=>files.get(key)||null),put:vi.fn(async(key:string,body:Uint8Array,options:{httpMetadata:{contentType:string}})=>{files.set(key,{body,size:body.length,httpMetadata:options.httpMetadata})})}
 const env={LIVE_DB:fixture.db,LIVE_MEDIA:bucket,MLS_GRID_ACCESS_TOKEN:'test'}
 await requestEnrichment(fixture.db,'onekey2','KEY1',time)
 const id=fixture.sqlite.prepare("SELECT id FROM ingestion_jobs WHERE kind='gallery'").get()?.id as string
 return {...fixture,env,files,bucket,id}
}

describe('Durable independent media jobs',()=>{
 it('publishes promptly, keeps a durable outbox on send failure, and coalesces duplicate deliveries',async()=>{
  const {sqlite,env,id,db}=await seeded(),send=vi.fn(async()=>{throw Error('queue unavailable')})
  try{
   expect(await publishJobs({...env,GALLERY_JOBS:{send}},{now:time})).toBe(0)
   expect(sqlite.prepare('SELECT published_until FROM ingestion_jobs').get()?.published_until).toBe(0)
   const accepted=vi.fn(async()=>{})
   expect(await publishJobs({...env,GALLERY_JOBS:{send:accepted}},{now:time})).toBe(1)
   expect(await publishJobs({...env,GALLERY_JOBS:{send:accepted}},{now:time+1})).toBe(0)
   expect(accepted).toHaveBeenCalledWith({id})
   const [first,second]=await Promise.all([claimJob(db,id,time),claimJob(db,id,time)])
   expect(Boolean(first)!==Boolean(second)).toBe(true)
  }finally{sqlite.close()}
 })
 it('finishes gallery work without ever acquiring or moving the primary cursor lease',async()=>{
  const {sqlite,env,id,bucket}=await seeded(),calls:string[]=[]
  try{
   const result=await runMediaJob(env,id,{now:()=>time,fetcher:async(url:string)=>{
    calls.push(url);expect(sqlite.prepare('SELECT lease_until FROM feed_state').get()?.lease_until).toBe(0)
    return url.startsWith('https://api.')?Response.json({value:[row()]}):new Response(new Uint8Array([255,216,255,0]))
   }})
   expect(result.status).toBe('ready');expect(calls).toHaveLength(2);expect(bucket.put).toHaveBeenCalledTimes(1)
   expect(sqlite.prepare('SELECT watermark FROM feed_state').get()?.watermark).toBeNull()
   expect(sqlite.prepare('SELECT completed_at,processing_until FROM listing_enrichment').get()).toEqual({completed_at:time,processing_until:0})
   expect(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_jobs WHERE kind='variant'").get()?.n).toBe(2)
  }finally{sqlite.close()}
 })
 it('recovers validated retained bytes after R2 success and a crashed D1 completion without a source download',async()=>{
  const {sqlite,env,id,files}=await seeded(),fetcher=vi.fn()
  try{
   const file=sqlite.prepare('SELECT file FROM listing_media').get()?.file as string
   files.set(file,{body:new Uint8Array([255,216,255]),size:3,httpMetadata:{contentType:'image/jpeg'}})
   sqlite.prepare("UPDATE listing_media SET state='downloading',attempted_at=?").run(time)
   expect((await runMediaJob(env,id,{now:()=>time,fetcher})).status).toBe('already_ready')
   expect(fetcher).not.toHaveBeenCalled();expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('ready')
   expect(await searchStore(env.LIVE_DB,{production:true}).mediaFile(file)).not.toBeNull()
  }finally{sqlite.close()}
 })
 it('does not exhaust failure retries across more than eight ordinary budget deferrals',async()=>{
  const {sqlite,env,id}=await seeded();let clock=time
  try{
   for(let i=0;i<10;i++){
    await runMediaJob(env,id,{now:()=>clock,fetcher:async()=>{const error=Object.assign(Error('Provider budget unavailable'),{sourceFailure:true,retryAt:clock+60000});throw error}})
    expect(sqlite.prepare("SELECT state,attempts FROM ingestion_jobs WHERE kind='gallery'").get()).toEqual({state:'retry_wait',attempts:0});clock+=60000
   }
   const result=await runMediaJob(env,id,{now:()=>clock,fetcher:async(url:string)=>url.startsWith('https://api.')?Response.json({value:[row()]}):new Response(new Uint8Array([255,216,255,0]))})
   expect(result.status).toBe('ready')
  }finally{sqlite.close()}
 })
 it('separates media rejection from feed credentials and retains truthful retry state',async()=>{
  const {sqlite,env,id}=await seeded()
  try{
   await runMediaJob(env,id,{now:()=>time,fetcher:async(url:string)=>url.startsWith('https://api.')?Response.json({value:[row()]}):new Response('expired',{status:403})})
   expect(sqlite.prepare('SELECT failure FROM feed_state').get()?.failure).toBeNull()
   expect(sqlite.prepare("SELECT state,failure FROM ingestion_jobs WHERE kind='gallery'").get()).toEqual({state:'retry_wait',failure:'source_or_storage_unavailable'})
  }finally{sqlite.close()}
 })
 it('cannot publish a photo when permission is revoked during transfer',async()=>{
  const {sqlite,env,id,repo,db}=await seeded()
  try{
   await runMediaJob(env,id,{now:()=>time,fetcher:async(url:string)=>{
    if(url.startsWith('https://api.'))return Response.json({value:[row()]})
    const lease=await repo.acquire(time)
    await repo.apply([row({MlgCanView:false,ModificationTimestamp:'2026-11-13T11:01:00Z'})],null,lease,time,false);await repo.release(lease)
    return new Response(new Uint8Array([255,216,255,0]))
   }})
   expect(await searchStore(db,{production:true}).listing('onekey2','KEY1')).toBeNull()
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_media').get()?.n).toBe(0)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_enrichment').get()?.n).toBe(0)
  }finally{sqlite.close()}
 })
 it('rejects an expired claim completion that would overwrite newer demand',async()=>{
  const {sqlite,db,id}=await seeded()
  try{
   const old=await claimJob(db,id,time),current=await claimJob(db,id,time+180001)
   expect(current?.claim_token).not.toBe(old?.claim_token)
   await finishJob(db,old,{now:time+180002})
   expect(sqlite.prepare("SELECT state,claim_token FROM ingestion_jobs WHERE kind='gallery'").get()).toEqual({state:'claimed',claim_token:current.claim_token})
   expect(sqlite.prepare('SELECT completed_at FROM listing_enrichment').get()?.completed_at).toBe(0)
  }finally{sqlite.close()}
 })
 it('updates the epoch of a repeated same-version gallery demand so completion can be fenced',async()=>{
  const {sqlite,db,id}=await seeded()
  try{
   const first=await claimJob(db,id,time);await finishJob(db,first,{now:time})
   await requestEnrichment(db,'onekey2','KEY1',time+1000000)
   const second=await claimJob(db,id,time+1000000)
   expect(second.requested_at).toBe(time+1000000)
   await finishJob(db,second,{now:time+1000001})
   expect(sqlite.prepare('SELECT completed_at FROM listing_enrichment').get()?.completed_at).toBe(time+1000001)
  }finally{sqlite.close()}
 })
 it('reopens a superseded variant when an unchanged retained original becomes eligible again',async()=>{
  const {sqlite,db,repo}=await seeded()
  try{
   const file=sqlite.prepare('SELECT file FROM listing_media').get()?.file as string
   sqlite.exec("UPDATE listing_media SET state='ready'")
   const variant={kind:'variant',source:'onekey2',id:'KEY1',revision:file,profile:'cardSmall',now:time}
   await insertJob(db,variant).run();sqlite.exec("UPDATE ingestion_jobs SET state='superseded' WHERE kind='variant'")
   const lease=await repo.acquire(time)
   await repo.apply([row({Media:undefined,ModificationTimestamp:'2026-11-13T11:01:00Z'})],null,lease,time,false,{projection:'core'})
   await insertJob(db,variant).run();expect(sqlite.prepare("SELECT state FROM ingestion_jobs WHERE kind='variant'").get()?.state).toBe('superseded')
   await repo.apply([row({ModificationTimestamp:'2026-11-13T11:01:00Z'})],null,lease,time,false)
   await insertJob(db,variant).run();expect(sqlite.prepare("SELECT state FROM ingestion_jobs WHERE kind='variant'").get()?.state).toBe('pending')
  }finally{sqlite.close()}
 })
 it('cannot complete a demand from an obsolete gallery while a new core version is awaiting its manifest',async()=>{
  const {sqlite,db,repo,id}=await seeded()
  try{
   const old=await claimJob(db,id,time),lease=await repo.acquire(time)
   await repo.apply([row({Media:undefined,ModificationTimestamp:'2026-11-13T11:01:00Z'})],null,lease,time,false,{projection:'core'})
   await finishJob(db,old,{now:time+1})
   expect(sqlite.prepare('SELECT completed_at FROM listing_enrichment').get()?.completed_at).toBe(0)
   expect(sqlite.prepare("SELECT COUNT(*) AS n FROM ingestion_jobs WHERE kind='gallery' AND state='pending'").get()?.n).toBe(1)
  }finally{sqlite.close()}
 })
})
