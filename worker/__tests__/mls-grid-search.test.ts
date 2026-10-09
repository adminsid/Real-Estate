import { describe, expect, it } from 'vitest'
import { openStore } from '../../scripts/mls-grid/store.mjs'
import { listingSignals, recentListingDates } from '../../scripts/mls-grid/consumer.mjs'
const now=new Date('2026-10-07T12:00:00Z')
const row=(i,extra={})=>({ListingKey:'KEY'+String(i).padStart(3,'0'),ListingId:'KEY'+i,OriginatingSystemName:'onekey2',MlgCanView:true,MlgCanUse:['IDX'],StandardStatus:'Active',PropertyType:'Residential',CountyOrParish:'Queens',StateOrProvince:'NY',ListPrice:100000+i*1000,ModificationTimestamp:'2026-10-07T12:00:00Z',...extra})
const media=(key)=>({key:'photo',revision:null,file:key.repeat(64),type:'image/jpeg',order:0,caption:''})
function fixture(run) {const store=openStore(':memory:');try{return run(store)}finally{store.close()}}
describe('Personalized consumer search',()=>{
 it('paginates every allowed size, keeps ties stable, clamps offsets, and rejects unbounded input',()=>fixture(store=>{
  store.apply('onekey2',{rows:Array.from({length:101},(_,i)=>row(i,{ListPrice:100000})),next:null})
  for(const limit of [12,24,48,96]) {
   const first=store.search({limit:String(limit)},now),second=store.search({limit:String(limit),offset:String(limit)},now)
   expect(first.listings).toHaveLength(limit);expect(new Set([...first.listings,...second.listings].map(l=>l.id)).size).toBe(first.listings.length+second.listings.length)
   expect(store.search({limit:String(limit),offset:'9999'},now).offset).toBe(Math.floor(100/limit)*limit)
  }
  expect(store.search({limit:'12',offset:'13'},now).offset).toBe(12)
  for(const params of [{limit:'100000'},{limit:'1'},{sort:'price; DELETE'},{offset:'-1'},{minPrice:'400',maxPrice:'200'},{savedOnly:'1',saved:'bad key'}])expect(()=>store.search(params,now)).toThrow()
 }))
 it('sorts source dates and prices with missing values last, and aggregates the full filtered set',()=>fixture(store=>{
  store.apply('onekey2',{rows:[row(0,{ListPrice:100,OriginalListPrice:200,OnMarketDate:'2026-10-01'}),row(1,{ListPrice:300,OriginalListPrice:200,OnMarketDate:'2026-10-07'}),row(2,{ListPrice:null}),row(3,{CountyOrParish:'Kings (Brooklyn)',ListPrice:50,OriginalListPrice:75})],next:null,media:new Map([['KEY000',[media('a')]]])})
  expect(store.search({borough:'Queens',sort:'priceDesc'},now).listings.map(l=>l.id)).toEqual(['KEY001','KEY000','KEY002'])
  expect(store.search({borough:'Queens',sort:'newest'},now).listings.map(l=>l.id)).toEqual(['KEY001','KEY000','KEY002'])
  expect(store.search({borough:'Queens'},now).insights).toEqual({withPhotos:1,belowOriginal:1,recentlyListed:2})
  expect(store.search({borough:'Queens',belowOriginal:'1'},now).listings.map(l=>l.id)).toEqual(['KEY000'])
  expect(store.search({borough:'Queens',recent:'1'},now).total).toBe(2)
 }))
 it('selects random photo highlights from exactly the same filters, including saved homes, and withdraws revoked photos',()=>fixture(store=>{
  store.apply('onekey2',{rows:[row(0),row(1,{CountyOrParish:'Kings (Brooklyn)'}),row(2,{PropertyType:'Land'}),row(3)],next:null,media:new Map([['KEY000',[media('a')]],['KEY001',[media('b')]],['KEY002',[media('c')]]])})
  const filters={borough:'Queens',type:'Residential',status:'Active',minPrice:'100000',maxPrice:'100500'}
  for(let i=0;i<5;i++){const result=store.search(filters,now);expect(result.total).toBe(1);expect(result.showcase.map(l=>l.id)).toEqual(['KEY000']);expect(result.showcase[0].featuredPhoto).toBe(0)}
  expect(store.search({...filters,q:'not here'},now).showcase).toEqual([])
  expect(store.search({savedOnly:'1',saved:'onekey2:KEY001'},now).showcase.map(l=>l.id)).toEqual(['KEY001'])
  expect(store.search({savedOnly:'1'},now).total).toBe(0)
  expect(store.search({q:'KEY3'},now).showcase).toEqual([])
  store.apply('onekey2',{rows:[row(0,{MlgCanView:false})],next:null})
  expect(store.search(filters,now).showcase).toEqual([])
 }))
 it('keeps recency tied to valid source dates in New York rather than fetch time or future dates',()=>{
  expect(recentListingDates(new Date('2026-10-08T02:00:00Z'))[0]).toBe('2026-10-07')
  for(const date of ['2026-10-01','2026-10-07'])expect(listingSignals({OnMarketDate:date},now).recentlyListed).toBe(true)
  for(const date of ['2026-09-30','2026-10-08','2026-02-30',undefined])expect(listingSignals({OnMarketDate:date,ModificationTimestamp:now.toISOString(),obtainedAt:now.toISOString()},now).recentlyListed).toBe(false)
  expect(listingSignals({ListPrice:80,OriginalListPrice:100},now).belowOriginal).toBe(20)
  for(const price of [0,-1,null,undefined,Infinity])expect(listingSignals({ListPrice:price,OriginalListPrice:100},now).belowOriginal).toBeNull()
 })
})
