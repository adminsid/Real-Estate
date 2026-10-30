import { describe,it,expect,vi } from 'vitest'
import { databaseFixture } from './production-fixture'
import { imageObject } from '../src/image-variants.mjs'
import { handleProduction } from '../src/production.mjs'
import { syncLive } from '../src/sync.mjs'
const now=Date.parse('2026-10-13T15:00:00Z')
describe('Capped responsive photo delivery',()=>{
 it('stores and reuses a derivative while preserving the original',async()=>{
  const {sqlite,db}=databaseFixture(),objects=new Map<string,Uint8Array>(),store={mediaFile:vi.fn(async()=>({file:'original'}))}
  const get=vi.fn(async(key:string)=>key==='original'?{body:new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.close()}}),size:3}:objects.has(key)?{body:objects.get(key),size:objects.get(key)?.length}:null)
  const put=vi.fn(async(key:string,bytes:Uint8Array)=>{objects.set(key,bytes)})
  const transform=vi.fn(()=>({output:async()=>({response:()=>new Response(new Uint8Array([4,5]))})})),input=vi.fn(()=>({transform}))
  const env={SEARCH_DB:db,SEARCH_MEDIA:{get,put},IMAGES:{input},IMAGE_TRANSFORM_LIMIT:'1000'}
  try{
   expect((await imageObject(env,store,{file:'original',type:'image/jpeg'},'card',{now})).type).toBe('image/webp')
   expect(transform).toHaveBeenCalledWith({width:720,fit:'scale-down'})
   await imageObject(env,store,{file:'original',type:'image/jpeg'},'card',{now})
   expect(input).toHaveBeenCalledTimes(1);expect(put.mock.calls[0][0]).toContain('optimized/v1/')
   expect(sqlite.prepare('SELECT attempts FROM image_transform_budget').get()?.attempts).toBe(1)
  }finally{sqlite.close()}
 })
 it('falls back to the original when the cap is exhausted and never stores revoked derivatives',async()=>{
  const {sqlite,db}=databaseFixture(),input=vi.fn(),get=vi.fn(async(key:string)=>key==='original'?{body:'original',size:8}:null),put=vi.fn()
  try{
   sqlite.prepare('INSERT INTO image_transform_budget VALUES (?,1000)').run('2026-10')
   const result=await imageObject({SEARCH_DB:db,SEARCH_MEDIA:{get,put},IMAGES:{input},IMAGE_TRANSFORM_LIMIT:'1000'},{mediaFile:async()=>null},{file:'original',type:'image/jpeg'},'display',{now})
   expect(result.representation).toBe('original');expect(input).not.toHaveBeenCalled();expect(put).not.toHaveBeenCalled()
   sqlite.exec('DELETE FROM image_transform_budget')
   input.mockReturnValue({transform:()=>({output:async()=>({response:()=>new Response(new Uint8Array([4]))})})})
   const revoked=await imageObject({SEARCH_DB:db,SEARCH_MEDIA:{get,put},IMAGES:{input},IMAGE_TRANSFORM_LIMIT:'1000'},{mediaFile:async()=>null},{file:'original',type:'image/jpeg'},'display',{now})
   expect(revoked).toBeNull();expect(put).not.toHaveBeenCalled()
  }finally{sqlite.close()}
 })
 it('rechecks photo permission before returning a conditional 304',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  try{
   await repo.apply([{OriginatingSystemName:'onekey2',ListingKey:'ETAG',ListingId:'ETAG1',MlgCanView:true,MlgCanUse:['IDX'],StateOrProvince:'NY',StandardStatus:'Active',ModificationTimestamp:'2026-10-13T12:00:00Z',Media:[{MediaKey:'ETAGPHOTO',Permission:['Public']}]}],null,lease,now)
   sqlite.exec("UPDATE listing_media SET state='ready',type='image/jpeg'")
   const file=sqlite.prepare('SELECT file FROM listing_media').get()?.file
   const env={PUBLIC_ORIGIN:'https://preview-search.primeamericany.com',SEARCH_DB:db,SEARCH_MEDIA:{get:async()=>({body:new Uint8Array([1,2,3]),size:3})}}
   const url=env.PUBLIC_ORIGIN+'/media/'+file
   const first=await handleProduction(new Request(url),env,{privateReview:true,now})
   const headers={'If-None-Match':first.headers.get('ETag')||''}
   expect((await handleProduction(new Request(url,{headers}),env,{privateReview:true,now})).status).toBe(304)
   sqlite.exec("DELETE FROM listing_media")
   const revoked=await handleProduction(new Request(url,{headers}),env,{privateReview:true,now})
   expect(revoked.status).toBe(404);expect(revoked.headers.get('Cache-Control')).toBe('private, no-store')
  }finally{sqlite.close()}
 })
 it('downloads queued photos despite a main cursor HTTP400 without moving its checkpoint',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const row={OriginatingSystemName:'onekey2',ListingKey:'PHOTO',ListingId:'PHOTO1',MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',StateOrProvince:'NY',CountyOrParish:'Queens',ModificationTimestamp:'2026-10-13T12:00:00Z',Media:[{MediaKey:'P1',Permission:['Public'],MediaURL:'https://media.mlsgrid.com/example',Order:0}]}
  try{
   await repo.apply([row],'https://api.mlsgrid.com/v2/Property?$filter=OriginatingSystemName%20eq%20%27onekey2%27&cursor=bad',lease,now)
   sqlite.exec('UPDATE listing_media SET attempted_at=0')
   await repo.release(lease)
   const bucket={put:vi.fn(async()=>{})}
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:bucket},{now:()=>now,pause:async()=>{},fetcher:async(url:string)=>url.startsWith('https://media.')?new Response(new Uint8Array([255,216,255,1])):url.includes('cursor=bad')?new Response('',{status:400}):Response.json({value:[row]}),maxPhotos:48})
   expect(result.status).toBe('connection_or_payload');expect(result.photoAttempts).toBe(1)
   expect(bucket.put).toHaveBeenCalledTimes(1);expect((await repo.state()).next_url).toContain('cursor=bad')
   expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('ready')
  }finally{sqlite.close()}
 })
})
