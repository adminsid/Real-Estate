import { describe,it,expect,vi } from 'vitest'
import { databaseFixture } from './production-fixture'
import { monitorSnapshot,monitorPage } from '../src/feed-monitor.mjs'
import { handleRequest } from '../src/runtime.mjs'
import { syncLive } from '../src/sync.mjs'
const now=Date.parse('2026-10-13T15:00:00Z'),origin='https://preview-search.primeamericany.com'
describe('Private live MLS monitor',()=>{
 it('reads progress without requesting source data and excludes credentials and pagination',async()=>{
  const {db,sqlite}=databaseFixture(),feedFetcher=vi.fn()
  try{
   sqlite.prepare("UPDATE feed_state SET next_url=?,failure='connection_or_payload',retry_after=?,last_result=?").run('https://api.example.invalid/SECRET-CURSOR',Date.now()+60000,JSON.stringify({status:'connection_or_payload',diagnostic:'MLS Grid returned HTTP 400',records:0}))
   const env={APP_ENV:'staging',DATASET:'live',PUBLIC_ORIGIN:origin,FEED_OPERATOR_EMAIL:'owner@example.invalid',LIVE_DB:db,MLS_GRID_ACCESS_TOKEN:'SECRET-TOKEN'}
   const authorize=vi.fn(async()=>true)
   const response=await handleRequest(new Request(origin+'/ops/mls-sync/status'),env,{authorize,feedFetcher})
   expect(response.status).toBe(200)
   const body=await response.text()
   expect(body).toContain('MLS Grid returned HTTP 400');expect(body).not.toContain('SECRET')
   expect(feedFetcher).not.toHaveBeenCalled()
   expect(authorize.mock.calls[0][4]).toBe('owner@example.invalid')
   expect(response.headers.get('Cache-Control')).toBe('private, no-store')
   const snapshot=JSON.parse(body)
   expect(snapshot.sourceRecords).toBe(0);expect(snapshot.retryAt).not.toBeNull()
  }finally{sqlite.close()}
 })
 it('protects the panel, status endpoint and its assets and rejects cross-origin mutations',async()=>{
  const authorize=vi.fn(async()=>false),env={FEED_OPERATOR_EMAIL:'owner@example.invalid',APP_ENV:'staging',DATASET:'live',PUBLIC_ORIGIN:origin}
  for(const path of ['/admin','/ops/mls-sync','/ops/mls-sync/status','/ops/mls-sync.mjs','/ops/mls-sync.css']){
   expect((await handleRequest(new Request(origin+path),env,{authorize})).status).toBe(403)
  }
  const feedFetcher=vi.fn()
  expect((await handleRequest(new Request(origin+'/ops/mls-sync/status',{method:'POST',headers:{Origin:'https://evil.invalid'}}),env,{authorize:async()=>true,feedFetcher})).status).toBe(403)
  expect(feedFetcher).not.toHaveBeenCalled()
 })
 it('reports photo states and importer accounting windows with known denominators',async()=>{
  const {db,sqlite}=databaseFixture()
  try{
   sqlite.prepare('INSERT INTO listing_media(source,listing_id,media_key,file,position,state) VALUES (?,?,?,?,?,?)').run('onekey2','1','p1','a',0,'ready')
   sqlite.prepare('INSERT INTO listing_media(source,listing_id,media_key,file,position,state) VALUES (?,?,?,?,?,?)').run('onekey2','1','p2','b',1,'pending')
   sqlite.prepare('INSERT INTO feed_budget VALUES (?,?,?)').run(Math.floor(now/3600000),7,2000)
   sqlite.prepare('INSERT INTO geocode_budget VALUES (?,?)').run('2026-10-13',3)
   const snapshot=await monitorSnapshot(db,now)
   expect(snapshot.photos).toEqual({pending:1,ready:1})
   expect(snapshot.budget.hourlyRequests).toBe(7);expect(snapshot.budget.dailyBytes).toBe(2000)
   expect(snapshot.budget.geocoderRequests).toBe(3)
   expect(monitorPage(snapshot)).toContain('every 15 seconds')
   expect(monitorPage(snapshot)).not.toContain('100%')
  }finally{sqlite.close()}
 })
 it('persists the last bounded failure summary without a request when another run is paused',async()=>{
  const {db,sqlite}=databaseFixture(),fetcher=vi.fn(async()=>new Response('',{status:400}))
  try{
   const env={LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}}
   await syncLive(env,{fetcher,pause:async()=>{},now:()=>now,maxPhotos:0})
   const first=await monitorSnapshot(db,now)
   expect(first.lastRun.diagnostic).toBe('MLS Grid returned HTTP 400')
   expect(first.lastRunAt).toBe(new Date(now).toISOString())
   const second=await syncLive(env,{fetcher,pause:async()=>{},now:()=>now,maxPhotos:0})
   expect(second.status).toBe('busy_or_backoff');expect(fetcher).toHaveBeenCalledTimes(1)
   expect((await monitorSnapshot(db,now)).lastRun).toEqual(first.lastRun)
  }finally{sqlite.close()}
 })
})
