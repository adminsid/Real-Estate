import {describe,it,expect,vi} from 'vitest'
import {databaseFixture} from './production-fixture'
import {syncLive,feedReady} from '../src/sync.mjs'
import {feedPage} from '../src/feed-check.mjs'
const now=Date.parse('2026-10-27T15:00:00Z'),old=now-12*86400000
const row=(id:string,extra:Record<string,unknown>={})=>({OriginatingSystemName:'onekey2',ListingKey:id,ListingId:id,MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',StateOrProvince:'NY',CountyOrParish:'Queens',ModificationTimestamp:new Date(old-86400000).toISOString(),Media:[{MediaKey:id+'-PHOTO',Permission:['Public'],Order:0}],...extra})
const env=(db:ReturnType<typeof databaseFixture>['db'])=>({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}})
async function stale(){const f=databaseFixture(),lease=await f.repo.acquire(old);await f.repo.apply([row('KEEP'),row('ABSENT')],null,lease,old);await f.repo.apply([],null,lease,old);await f.repo.release(lease);f.sqlite.exec("UPDATE listing_media SET state='ready',type='image/jpeg';UPDATE listings SET has_photos=1");return f}
describe('Safe synchronization after a missed removal window',()=>{
 it('shows actual configured synchronization and dataset on the connection page',()=>{
  const html=feedPage({MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_SYNC_ENABLED:'true',DATASET:'live'})
  expect(html).toContain('<dd>Enabled</dd>');expect(html).toContain('Live OneKey');expect(html).not.toContain('Fictional staging listings')
 })
 it('rebuilds membership before pruning absent listings while reusing unchanged photo state',async()=>{
  const {sqlite,db,repo}=await stale(),links:string[]=[]
  const invoke=(rows:ReturnType<typeof row>[])=>syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:1,maxPhotos:0,fetcher:async(input:string)=>{links.push(input);return Response.json({value:rows})}})
  try{
   expect((await invoke([row('KEEP')])).status).toBe('ok')
   let state=await repo.state();expect(state.phase).toBe('catchup');expect(state.initial_complete).toBe(0);expect(state.reconcile_id).toBeTruthy()
   expect(state.watermark).toBe(new Date(now-5*60000).toISOString());expect(await feedReady(db,now)).toBe(false)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n).toBe(2)
   await invoke([]);state=await repo.state();expect(state.phase).toBe('reconcile');expect(state.initial_complete).toBe(0)
   const catchup=new URL(links[1]).searchParams.get('$filter')||'';expect(catchup).not.toContain('MlgCanView');expect(catchup).not.toContain('StandardStatus')
   await invoke([]);expect((await repo.state()).phase).toBe('reconcile')
   await invoke([]);expect((await repo.state()).initial_complete).toBe(1)
   expect(sqlite.prepare('SELECT id FROM listings').all()).toEqual([{id:'KEEP'}]);expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('ready')
   expect(await feedReady(db,now)).toBe(true);expect(links).toHaveLength(2)
  }finally{sqlite.close()}
 })
 it('keeps old cache and the release closed if the fresh snapshot fails',async()=>{
  const {sqlite,db,repo}=await stale()
  try{
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPhotos:0,fetcher:async()=>new Response('',{status:500})})
   expect(result.status).toBe('connection_or_payload');expect((await repo.state()).initial_complete).toBe(0)
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n).toBe(2);expect(await feedReady(db,now)).toBe(false)
  }finally{sqlite.close()}
 })
 it('includes new eligible listings and removals received during unfiltered catchup',async()=>{
  const {sqlite,db,repo}=await stale()
  const invoke=(rows:ReturnType<typeof row>[])=>syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:1,maxPhotos:0,fetcher:async()=>Response.json({value:rows})})
  try{
   await invoke([row('KEEP')]);await invoke([row('KEEP',{MlgCanView:false,ModificationTimestamp:new Date(now-60000).toISOString()}),row('NEW',{ModificationTimestamp:new Date(now-30000).toISOString()})]);await invoke([]);await invoke([])
   expect(sqlite.prepare('SELECT id FROM listings').all()).toEqual([{id:'NEW'}]);expect((await repo.state()).initial_complete).toBe(1)
  }finally{sqlite.close()}
 })
 it('cannot start or prune with an expired replication lease',async()=>{
  const {sqlite,db,repo}=await stale(),lease=await repo.acquire(now)
  try{
   await expect(repo.beginReconciliation(lease,now+240001)).rejects.toThrow('lease')
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listings').get()?.n).toBe(2)
   expect(await feedReady(db,now)).toBe(false)
  }finally{sqlite.close()}
 })
})
