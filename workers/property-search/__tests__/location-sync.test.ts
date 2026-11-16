import { describe,it,expect,vi } from 'vitest'
import { databaseFixture } from './production-fixture'
import { refreshLocationInventory,refreshNYCLocations,geocodeListings,acceptedCandidate } from '../src/location-sync.mjs'
import { locationAddress } from '../../../scripts/mls-grid/location-model.mjs'
import { syncLive } from '../src/sync.mjs'
import { handleProduction } from '../src/production.mjs'
import { searchStore } from '../src/store.mjs'
const now=Date.parse('2026-10-13T15:00:00Z')
const row=(overrides:Record<string,unknown>={})=>({OriginatingSystemName:'onekey2',ListingKey:'LOC-1',ListingId:'LOC1001',MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',PropertyType:'Residential',CountyOrParish:'Queens',StateOrProvince:'NY',City:'New York',PostalCity:'Flushing',PostalCode:'11355',StreetNumber:'123',StreetName:'Maple',ListPrice:500000,ModificationTimestamp:'2026-10-13T12:00:00.123100Z',Media:[{MediaKey:'P1',Permission:['Public'],MediaModificationTimestamp:'2026-10-13T12:00:00Z',MediaURL:'https://media.mlsgrid.com/example',Order:0}],...overrides})
const candidate=(overrides:Record<string,unknown>={})=>({score:100,location:{x:-73.81,y:40.76},attributes:{Addr_type:'PointAddress',Postal:'11355'},...overrides})
describe('Verified location import',()=>{
 it('reprojects unchanged inventory without advancing the main cursor or losing ready photos',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  try{
   await repo.apply([row()], 'https://api.mlsgrid.com/v2/Property?main=1',lease,now)
   sqlite.exec("UPDATE listings SET projection_version=0; UPDATE listing_media SET state='ready'; UPDATE listings SET has_photos=1")
   const before=await repo.state()
   await refreshLocationInventory({LIVE_DB:db},repo,{locationInitial:()=> 'refresh',page:async()=>({rows:[row()],next:null})},lease,{now:()=>now})
   expect((await repo.state()).next_url).toBe(before.next_url)
   expect((await repo.state()).cycle_watermark).toBe(before.cycle_watermark)
   expect(sqlite.prepare('SELECT state FROM listing_media').get()?.state).toBe('ready')
   expect((await searchStore(db,{production:true}).search({borough:'NYC',areas:'["Flushing"]'})).total).toBe(1)
   expect(sqlite.prepare('SELECT complete,processed FROM location_refresh').get()).toEqual({complete:1,processed:1})
  }finally{sqlite.close()}
 })
 it('prioritizes existing NYC neighborhoods without moving the statewide replay cursor',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  try{
   await repo.apply([row()],null,lease,now)
   sqlite.exec("UPDATE listings SET projection_version=0; UPDATE location_refresh SET next_url='statewide-next'")
   const properties=vi.fn(()=> 'selected-ids')
   await refreshNYCLocations({LIVE_DB:db},repo,{properties,page:async()=>({rows:[row()],next:null})},lease,{now:()=>now})
   expect(properties).toHaveBeenCalledWith(['LOC1001'])
   expect(sqlite.prepare('SELECT projection_version FROM listings').get()?.projection_version).toBe(1)
   expect(sqlite.prepare('SELECT next_url FROM location_refresh').get()?.next_url).toBe('statewide-next')
  }finally{sqlite.close()}
 })
 it('reconciles newly private photos during replay and prevents an older location rollback',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  try{
   await repo.apply([row()],null,lease,now)
   await refreshLocationInventory({LIVE_DB:db},repo,{locationInitial:()=> 'refresh',page:async()=>({rows:[row({PostalCity:'Elmhurst',ModificationTimestamp:'2026-10-13T13:00:00Z',Media:[{MediaKey:'P1',Permission:['Private']}]})],next:null})},lease,{now:()=>now})
   expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_media').get()?.n).toBe(0)
   await repo.apply([row()],null,lease,now,false,{refreshLocations:true})
   expect((await searchStore(db,{production:true}).listing('onekey2','LOC-1')).PostalCity).toBe('Elmhurst')
  }finally{sqlite.close()}
 })
 it('imports NYS inventory on demand and keeps other states out',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  try{
   await repo.apply([row({CountyOrParish:'Albany',PostalCity:'Albany'}),row({ListingKey:'NJ',StateOrProvince:'NJ'})],null,lease,now)
   const store=searchStore(db,{production:true})
   expect((await store.search({borough:'NYC'})).total).toBe(0)
   expect((await store.search({borough:'NYS'})).total).toBe(1)
  }finally{sqlite.close()}
 })
 it('geocodes off the read path, reuses public addresses, and clears derived locations after address changes',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now)
  const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{if(init.redirect!=='manual')throw Error('Workers requires manual redirect checks');return Response.json({candidates:[candidate()]})})
  try{
   await repo.apply([row(),row({ListingKey:'LOC-2'}),row({ListingKey:'HIDDEN',InternetAddressDisplayYN:false})],null,lease,now)
   await geocodeListings({LIVE_DB:db},lease,{fetcher,now:()=>now})
   expect(fetcher).toHaveBeenCalledTimes(1)
   expect(sqlite.prepare('SELECT SUM(latitude IS NOT NULL) AS n FROM listings').get()?.n).toBe(2)
   expect(sqlite.prepare("SELECT address_key,latitude FROM listings WHERE id='HIDDEN'").get()).toEqual({address_key:null,latitude:null})
   const listing=await searchStore(db,{production:true}).listing('onekey2','LOC-1')
   expect(listing.mapLocation.source).toBe('nys-address-point')
   await repo.apply([row({StreetNumber:'456',ModificationTimestamp:'2026-10-13T14:00:00Z'})],null,lease,now)
   expect(sqlite.prepare("SELECT latitude FROM listings WHERE id='LOC-1'").get()?.latitude).toBeNull()
  }finally{sqlite.close()}
 })
 it('honors the daily budget and refuses expired leases',async()=>{
  const {sqlite,db,repo}=databaseFixture(),lease=await repo.acquire(now),fetcher=vi.fn()
  try{
   await repo.apply([row()],null,lease,now)
   sqlite.prepare('INSERT INTO geocode_budget VALUES (?,1000)').run('2026-10-13')
   await geocodeListings({LIVE_DB:db},lease,{fetcher,now:()=>now})
   sqlite.exec('DELETE FROM geocode_budget')
   await repo.release(lease)
   await geocodeListings({LIVE_DB:db},lease,{fetcher,now:()=>now})
   expect(fetcher).not.toHaveBeenCalled()
  }finally{sqlite.close()}
 })
 it('backs off the feed when the location replay is unauthorized',async()=>{
  const {sqlite,db}=databaseFixture()
  try{
   const result=await syncLive({LIVE_SYNC_ENABLED:'true',LOCATION_REFRESH_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test-only',LIVE_DB:db,LIVE_MEDIA:{put:vi.fn()}},{fetcher:async()=>new Response('',{status:401}),pause:async()=>{},now:()=>now,maxPhotos:0})
   expect(result.status).toBe('credentials')
   expect(sqlite.prepare('SELECT failure,retry_after FROM feed_state').get()).toEqual({failure:'credentials',retry_after:now+3600000})
  }finally{sqlite.close()}
 })
 it('does not cache vendor errors while caching successful pinned map assets',async()=>{
  const env={PUBLIC_ORIGIN:'https://preview-search.primeamericany.com',ASSETS:{fetch:async()=>new Response('missing',{status:404})}}
  const request=new Request(env.PUBLIC_ORIGIN+'/vendor/maplibre-4.7.1.js')
  const failed=await handleProduction(request,env,{privateReview:true})
  expect(failed.headers.get('Cache-Control')).toBe('private, no-store')
  env.ASSETS.fetch=async()=>new Response('map renderer')
  const ready=await handleProduction(request,env,{privateReview:true})
  expect(ready.headers.get('Cache-Control')).toContain('immutable')
 })
 it('rejects low confidence, ZIP mismatches, interpolated streets, ambiguous matches, and withheld addresses',()=>{
  expect(acceptedCandidate({candidates:[candidate()]},'11355')).toEqual({latitude:40.76,longitude:-73.81})
  for(const candidates of [[candidate({score:97})],[candidate({attributes:{Addr_type:'StreetAddress',Postal:'11355'}})],[candidate({attributes:{Addr_type:'PointAddress',Postal:'10001'}})],[candidate(),candidate({location:{x:-73.9,y:40.8}})]])expect(acceptedCandidate({candidates},'11355')).toBeNull()
  expect(locationAddress({...row(),addressWithheld:true})).toBeNull()
  expect(locationAddress(row({PostalCode:11355}))).toBeNull()
 })
})
