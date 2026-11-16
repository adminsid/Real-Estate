import { describe, it, expect, vi } from 'vitest'
import { databaseFixture } from './production-fixture'
import { dispatchSource, CORE_RESERVE, SOURCE_LIMITS, approvedRequest } from '../src/source-dispatch.mjs'
import {feedReady} from '../src/sync.mjs'
const time=Date.parse('2026-11-13T12:00:00Z')
const url="https://api.mlsgrid.com/v2/Property?$filter=OriginatingSystemName%20eq%20'onekey2'"

describe('Subscription-wide source dispatch',()=>{
 it('closes public readiness on a confirmed REST credential rejection from any source job',async()=>{
  const {sqlite,db}=databaseFixture()
  try{
   sqlite.exec("UPDATE source_control SET mode='independent';UPDATE feed_state SET initial_complete=1")
   sqlite.prepare('UPDATE feed_state SET last_complete=?').run(new Date(time).toISOString())
   expect(await feedReady(db,time)).toBe(true)
   await dispatchSource({LIVE_DB:db},{url,kind:'diagnostic'},{now:()=>time,fetcher:async()=>new Response('denied',{status:403})})
   expect(await feedReady(db,time)).toBe(false)
   expect(sqlite.prepare('SELECT source_failure FROM source_control').get()?.source_failure).toBe('credentials')
  }finally{sqlite.close()}
 })
 it('inherits legacy backoff and never fetches through a paused cutover',async()=>{
  const {sqlite,db}=databaseFixture(),fetcher=vi.fn()
  try{
   sqlite.exec("UPDATE source_control SET mode='independent'");sqlite.prepare('UPDATE feed_state SET retry_after=?').run(time+900000)
   expect(await dispatchSource({LIVE_DB:db},{url,kind:'core'},{now:()=>time,fetcher})).toMatchObject({error:'Source backoff active',retryAt:time+900000})
   sqlite.exec("UPDATE feed_state SET retry_after=0;UPDATE source_control SET mode='draining'")
   expect(await dispatchSource({LIVE_DB:db},{url,kind:'core'},{now:()=>time,fetcher})).toHaveProperty('error')
   expect(fetcher).not.toHaveBeenCalled()
  }finally{sqlite.close()}
 })
 it('reserves core capacity in every rolling request and byte window',async()=>{
  for(const metric of ['hourRequests','dayRequests','hourBytes','dayBytes'] as const){
   const {sqlite,db}=databaseFixture(),fetcher=vi.fn(async()=>Response.json({value:[]}))
   try{
    sqlite.exec("UPDATE source_control SET mode='independent'")
    const hour=Math.floor(time/3600000),requests=metric.endsWith('Requests')?SOURCE_LIMITS[metric]-CORE_RESERVE[metric]:0,bytes=metric.endsWith('Bytes')?SOURCE_LIMITS[metric]-CORE_RESERVE[metric]:0
    sqlite.prepare('INSERT INTO feed_budget VALUES (?,?,?)').run(metric.startsWith('day')?hour-3:hour,requests,bytes)
    expect(await dispatchSource({LIVE_DB:db,MLS_GRID_ACCESS_TOKEN:'test'},{url,kind:'diagnostic'},{now:()=>time,fetcher})).toHaveProperty('error','Provider budget unavailable')
    expect(fetcher).not.toHaveBeenCalled()
    expect(await dispatchSource({LIVE_DB:db,MLS_GRID_ACCESS_TOKEN:'test'},{url,kind:'core'},{now:()=>time,fetcher})).toHaveProperty('status',200)
   }finally{sqlite.close()}
  }
 })
 it('records uncertain dispatch before external I/O and conservatively recovers after restart',async()=>{
  const {sqlite,db}=databaseFixture();let clock=time
  try{
   sqlite.exec("UPDATE source_control SET mode='independent'")
   const first=await dispatchSource({LIVE_DB:db},{url,kind:'core'},{now:()=>clock,fetcher:async()=>{
    expect(sqlite.prepare('SELECT outcome FROM source_attempts').get()?.outcome).toBe('may_have_dispatched');throw Error('network timeout')
   }})
   expect(first).toHaveProperty('error','Source transfer outcome uncertain')
   expect(sqlite.prepare('SELECT bytes FROM feed_budget').get()?.bytes).toBe(8*1024*1024)
   const second=await dispatchSource({LIVE_DB:db},{url,kind:'core'},{now:()=>clock,pause:async(ms:number)=>{clock+=ms},fetcher:async()=>{
    expect(clock-time).toBeGreaterThanOrEqual(31000);return Response.json({value:[]})
   }})
   expect(second.status).toBe(200)
   expect(sqlite.prepare('SELECT requests FROM feed_budget').get()?.requests).toBe(2)
   expect(sqlite.prepare("SELECT COUNT(*) AS n FROM source_attempts WHERE outcome='may_have_dispatched'").get()?.n).toBe(1)
  }finally{sqlite.close()}
 })
 it('honors source Retry-After without interpreting media credentials as REST credentials',async()=>{
  const {sqlite,db}=databaseFixture()
  try{
   sqlite.exec("UPDATE source_control SET mode='independent'")
   const response=await dispatchSource({LIVE_DB:db},{url,kind:'core'},{now:()=>time,fetcher:async()=>new Response('slow',{status:429,headers:{'Retry-After':'3600'}})})
   expect(response.status).toBe(429)
   expect(sqlite.prepare('SELECT source_backoff_until FROM source_control').get()?.source_backoff_until).toBe(time+3600000)
   expect(sqlite.prepare('SELECT failure FROM feed_state').get()?.failure).toBeNull()
  }finally{sqlite.close()}
 })
 it('refuses arbitrary hosts, credentials, private paths, or non-media request classes',()=>{
  for(const input of ['https://evil.invalid/v2/Property','https://user@api.mlsgrid.com/v2/Property','https://api.mlsgrid.com/v2/Office','http://media.mlsgrid.com/a'])expect(()=>approvedRequest(input,'core')).toThrow()
  expect(()=>approvedRequest('https://media.mlsgrid.com/a','core')).toThrow()
 })
 it('rechecks media eligibility, claim expiry and backoff atomically after pacing',async()=>{
  for(const mutation of ["DELETE FROM listings",'UPDATE listing_components SET manifest_version=NULL',`UPDATE ingestion_jobs SET claim_until=${time}`,`UPDATE source_control SET source_backoff_until=${time+3600000}`]){
   const {sqlite,db,repo}=databaseFixture();let clock=time
   try{
    const lease=await repo.acquire(time)
    await repo.apply([{OriginatingSystemName:'onekey2',ListingKey:'KEY1',ListingId:'MLS1',ModificationTimestamp:'2026-11-13T11:00:00Z',MlgCanView:true,MlgCanUse:['IDX'],StateOrProvince:'NY',StandardStatus:'Active',Media:[{MediaKey:'P1',Permission:['Public']}]}],null,lease,time,false)
    await repo.release(lease)
    const file=sqlite.prepare('SELECT file FROM listing_media').get()?.file as string
    sqlite.prepare("INSERT INTO ingestion_jobs(id,kind,source,listing_id,revision,requested_at,state,claim_token,claim_until) VALUES ('job','gallery','onekey2','KEY1','v',?,'claimed','token',?)").run(time,time+180000)
    sqlite.prepare("UPDATE source_control SET mode='independent',last_dispatch_at=?").run(time)
    sqlite.exec("UPDATE listing_media SET state='downloading'")
    const fetcher=vi.fn()
    const result=await dispatchSource({LIVE_DB:db},{url:'https://media.mlsgrid.com/p1',kind:'gallery',jobId:'job',token:'token',mediaKey:'P1',mediaRevision:file},
      {now:()=>clock,pause:async(ms:number)=>{clock+=ms;sqlite.exec(mutation)},fetcher})
    expect(result).toHaveProperty('error');expect(fetcher).not.toHaveBeenCalled()
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM source_attempts').get()?.n).toBe(0)
   }finally{sqlite.close()}
  }
 })
})
