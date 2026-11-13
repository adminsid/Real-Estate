import {describe,it,expect,vi} from 'vitest'
import {databaseFixture} from './production-fixture'
import {syncLive} from '../src/sync.mjs'
import {downloadPhotos} from '../src/live-media.mjs'

const now=Date.parse('2026-10-14T04:00:00Z')
const row=(id:string,overrides:Record<string,unknown>={})=>({OriginatingSystemName:'onekey2',ListingKey:id,ListingId:id,MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',StateOrProvince:'NY',CountyOrParish:'Queens',ModificationTimestamp:'2026-10-13T12:00:00.123456Z',OnMarketDate:'2026-10-13',Media:[{MediaKey:id+'-PHOTO',Permission:['Public'],Order:0,MediaURL:'https://media.mlsgrid.com/'+id}],...overrides})
const image=()=>new Response(new Uint8Array([255,216,255,0]))
const env=(db:ReturnType<typeof databaseFixture>['db'])=>({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn(async()=>{})}})

describe('Smart bounded import',()=>{
 it('recovers a rejected offset with overlapping timestamp replay, including removals and tied versions',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),seen=row('SEEN'),removed=row('REMOVED',{ModificationTimestamp:'2026-10-13T11:00:00Z'})
  const bad="https://api.mlsgrid.com/v2/Property?$filter=OriginatingSystemName%20eq%20'onekey2'&$skip=999999"
  try{
   await repo.apply([seen,removed],bad,lease,now);sqlite.exec("UPDATE feed_state SET phase='catchup'");await repo.release(lease)
   const links:string[]=[]
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPhotos:0,fetcher:async(input:string)=>{
    links.push(input);return new URL(input).searchParams.has('$skip')?new Response('Invalid $skip offset',{status:400}):Response.json({value:[seen,row('UNSEEN'),row('REMOVED',{MlgCanView:false})]})
   }})
   expect(result.status).toBe('ok');expect(result.cursorRecovered).toBe(true);expect(links).toHaveLength(2)
   const replay=new URL(links[1]);expect(replay.searchParams.has('$skip')).toBe(false)
   expect(replay.searchParams.get('$filter')).toContain('ModificationTimestamp gt 2026-10-13T11:59:59.000Z')
   expect(replay.searchParams.get('$filter')).not.toContain('MlgCanView')
   expect(sqlite.prepare('SELECT id FROM listings ORDER BY id').all()).toEqual([{id:'SEEN'},{id:'UNSEEN'}])
   expect((await repo.state()).watermark).toBe(seen.ModificationTimestamp)
  }finally{sqlite.close()}
 })
 it('prioritizes active NYC ahead of other active listings and pending NYC even when they lack covers',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const rows=[row('A-PENDING',{StandardStatus:'Pending'}),row('B-STATE',{CountyOrParish:'Westchester'}),row('C-NYC')]
  const requested:string[]=[]
  try{
   await repo.apply(rows,null,lease,now);sqlite.exec("UPDATE listing_media SET attempted_at=0; UPDATE listings SET has_photos=1 WHERE id='C-NYC'");await repo.release(lease)
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:0,maxPhotos:1,fetcher:async(input:string)=>{
    if(input.startsWith('https://media.')){requested.push(input);return image()}
    const filter=new URL(input).searchParams.get('$filter')||'';return Response.json({value:rows.filter(item=>filter.includes("'"+item.ListingId+"'"))})
   }})
   expect(result.photoReady).toBe(1);expect(requested).toEqual(['https://media.mlsgrid.com/C-NYC'])
  }finally{sqlite.close()}
 })
 it('fills a larger pass from multiple distinct source batches and records successful bytes',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),rows=Array.from({length:120},(_,i)=>row('B'+String(i).padStart(3,'0')))
  const batches:string[][]=[]
  try{
   await repo.apply(rows,null,lease,now);sqlite.exec('UPDATE listing_media SET attempted_at=0');await repo.release(lease)
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:0,maxPhotos:96,fetcher:async(input:string)=>{
    if(input.startsWith('https://media.'))return image()
    const filter=new URL(input).searchParams.get('$filter')||'',selected=rows.filter(item=>filter.includes("'"+item.ListingId+"'"));batches.push(selected.map(item=>item.ListingId));return Response.json({value:selected})
   }})
   expect(result.photoAttempts).toBe(96);expect(result.photoReady).toBe(96);expect(result.photoBytes).toBe(384);expect(batches.map(batch=>batch.length)).toEqual([50,46])
   expect(new Set(batches.flat()).size).toBe(96)
  }finally{sqlite.close()}
 })
 it('pipelines three downloads while enforcing the download cap',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),rows=Array.from({length:8},(_,i)=>row('P'+i))
  let active=0,peak=0,downloads=0
  try{
   await repo.apply(rows,null,lease,now)
   const result=await downloadPhotos(rows,env(db),async()=>{}, {now:()=>now,maxDownloads:5,concurrency:3,fetcher:async()=>{
    downloads++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return image()
   }})
   expect(peak).toBe(3);expect(downloads).toBe(5);expect(result.ready).toBe(5)
  }finally{sqlite.close()}
 })
 it('serializes reservations and preserves request spacing across concurrent redirects',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),rows=Array.from({length:6},(_,i)=>row('R'+i)),starts:number[]=[]
  let clock=now
  try{
   await repo.apply(rows,null,lease,now);sqlite.exec('UPDATE listing_media SET attempted_at=0');await repo.release(lease)
   const result=await syncLive({...env(db),MEDIA_CONCURRENCY:'3'},{now:()=>clock,pause:async(ms:number)=>{clock+=ms},maxPages:0,maxPhotos:6,fetcher:async(input:string)=>{
    starts.push(clock)
    if(input.startsWith('https://api.'))return Response.json({value:rows})
    if(input.startsWith('https://media.'))return new Response(null,{status:302,headers:{Location:'https://mlsgrid.'+'a'.repeat(32)+'.r2.cloudflarestorage.com/'+input.split('/').pop()}})
    return image()
   }})
   expect(result.photoReady).toBe(6);expect(starts).toHaveLength(13)
   for(let i=1;i<starts.length;i++)expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(550)
   expect(sqlite.prepare('SELECT SUM(requests) AS n FROM feed_budget').get()?.n).toBe(13)
  }finally{sqlite.close()}
 })
 it('uses priority and due-media indexes for a queue full of recently refreshed galleries',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),rows=Array.from({length:60},(_,i)=>row('I'+i))
  let plan=''
  const tracedDb={...db,prepare(sql:string){if(sql.startsWith('SELECT l.provider_id'))plan=JSON.stringify(sqlite.prepare('EXPLAIN QUERY PLAN '+sql).all(now-3600000,12));return db.prepare(sql)}}
  try{
   await repo.apply(rows,null,lease,now);await repo.release(lease)
   await syncLive(env(tracedDb),{now:()=>now,pause:async()=>{},maxPages:0,fetcher:async()=>{throw Error('Fresh photos must not request new URLs')}})
   expect(plan).toContain('listing_photo_priority');expect(plan).toContain('media_retry_parent');expect(plan).not.toContain('TEMP B-TREE')
  }finally{sqlite.close()}
 })
 it('drains in-flight work on throttling and starts no new photo jobs',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),rows=Array.from({length:10},(_,i)=>row('T'+i))
  let active=0,calls=0
  try{
   await repo.apply(rows,null,lease,now)
   const delayedDb={...db,prepare(sql:string){const statement=db.prepare(sql);if(sql.startsWith("UPDATE listing_media SET state='failed'")){const run=statement.run.bind(statement);statement.run=async()=>{await new Promise(resolve=>setTimeout(resolve,80));return run()}}return statement}}
   await expect(downloadPhotos(rows,env(delayedDb),async()=>{}, {now:()=>now,maxDownloads:10,concurrency:3,fetcher:async()=>{
    const call=++calls;active++;await new Promise(resolve=>setTimeout(resolve,call===1?1:15));active--;return call===1?new Response('throttled',{status:429}):image()
   }})).rejects.toThrow('HTTP 429')
   expect(calls).toBeLessThanOrEqual(3);expect(active).toBe(0)
   expect(sqlite.prepare("SELECT COUNT(*) AS n FROM listing_media WHERE state='pending'").get()?.n).toBeGreaterThanOrEqual(7)
  }finally{sqlite.close()}
 })
 it('retries an expired failed photo without refreshing its failure age before reconciliation',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),source=row('RETRY')
  try{
   await repo.apply([source],null,lease,now);sqlite.exec("UPDATE listing_media SET state='failed',attempted_at=0");await repo.release(lease)
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPages:0,maxPhotos:1,fetcher:async(input:string)=>input.startsWith('https://api.')?Response.json({value:[source]}):image()})
   expect(result.photoReady).toBe(1);expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('ready')
  }finally{sqlite.close()}
 })
 it('keeps NYC priority inside a mixed returned batch ahead of a non-NYC cover',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const rows=[row('STATE',{CountyOrParish:'Westchester'}),row('CITY',{Media:[0,1,2].map(i=>({MediaKey:'CITY'+i,Permission:['Public'],Order:i,MediaURL:'https://media.mlsgrid.com/CITY'+i}))})]
  const downloads:string[]=[]
  try{
   await repo.apply(rows,null,lease,now);sqlite.exec("UPDATE listings SET has_photos=1 WHERE id='CITY'; UPDATE listing_media SET state='ready' WHERE media_key='CITY0'")
   const result=await downloadPhotos(rows,env(db),async()=>{}, {now:()=>now,maxDownloads:1,fetcher:async(input:string)=>{downloads.push(input);return image()}})
   expect(result.ready).toBe(1);expect(downloads).toEqual(['https://media.mlsgrid.com/CITY1'])
  }finally{sqlite.close()}
 })
 it('does not use the newer initial maximum to recover an earlier catch-up traversal',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const early=row('EARLY',{ModificationTimestamp:'2026-10-13T11:00:00Z'}),late=row('LATE',{ModificationTimestamp:'2026-10-13T20:00:00Z'})
  const bad="https://api.mlsgrid.com/v2/Property?$filter=OriginatingSystemName%20eq%20'onekey2'&$skip=999999"
  const links:string[]=[]
  try{
   await repo.apply([early,late],null,lease,now)
   await repo.apply([row('SEEN')],bad,lease,now);await repo.release(lease)
   const result=await syncLive(env(db),{now:()=>now,pause:async()=>{},maxPhotos:0,fetcher:async(input:string)=>{
    links.push(input);return new URL(input).searchParams.has('$skip')?new Response('Invalid $skip offset',{status:400}):Response.json({value:[row('EARLY',{MlgCanView:false,ModificationTimestamp:'2026-10-13T12:30:00Z'})]})
   }})
   expect(result.status).toBe('ok');expect(new URL(links[1]).searchParams.get('$filter')).toContain('2026-10-13T11:59:59.000Z')
   expect(sqlite.prepare("SELECT id FROM listings WHERE id='EARLY'").get()).toBeUndefined()
  }finally{sqlite.close()}
 })
})
