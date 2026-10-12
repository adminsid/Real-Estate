import {describe,expect,it} from 'vitest'
import {openStore} from '../../scripts/mls-grid/store.mjs'
import {searchStore} from '../../workers/property-search/src/store.mjs'
import {DatabaseSync} from 'node:sqlite'
import {readFileSync} from 'node:fs'
import {publicProjection} from '../../scripts/mls-grid/client.mjs'
const now=new Date('2026-10-11T12:00:00Z')
const row=(id:number,extra={})=>({ListingKey:'KEY'+id,ListingId:'KEY'+id,OriginatingSystemName:'onekey2',MlgCanView:true,MlgCanUse:['IDX'],InternetAddressDisplayYN:true,StandardStatus:'Active',PropertyType:'Residential',CountyOrParish:'Queens',City:'Astoria',StateOrProvince:'NY',ListPrice:500000+id*1000,BedroomsTotal:2,BathroomsTotalInteger:1,ModificationTimestamp:now.toISOString(),...extra})
function fixture(run){const store=openStore(':memory:');try{return run(store)}finally{store.close()}}
describe('Consumer discovery filters and map inventory',()=>{
  it('distinguishes studios, exact bedroom counts, bathrooms and missing facts',()=>fixture(store=>{
    store.apply('onekey2',{rows:[row(1,{BedroomsTotal:0}),row(2,{BedroomsTotal:2,BathroomsTotalInteger:2}),row(3,{BedroomsTotal:3}),row(4,{BedroomsTotal:null,BathroomsTotalInteger:null})],next:null})
    expect(store.search({bedsExact:'0'}).listings.map(l=>l.id)).toEqual(['KEY1'])
    expect(store.search({bedsExact:'2',baths:'2'}).listings.map(l=>l.id)).toEqual(['KEY2'])
    expect(store.search({beds:'2'}).total).toBe(2)
    expect(()=>store.search({bedsExact:'2.5'})).toThrow('Invalid')
  }))
  it('keeps required amenities strict and preferences optional, with matching semantics across UI and SQL',()=>fixture(store=>{
    store.apply('onekey2',{rows:[row(1,{LaundryFeatures:['Washer Hookup'],PetsAllowed:['No']}),row(2,{LaundryFeatures:['In Unit'],PetsAllowed:['Cats OK']}),row(3,{LaundryFeatures:null}),row(4,{LaundryFeatures:'In Unit'})],next:null})
    expect(store.search({required:'laundry'}).listings.map(l=>l.id)).toEqual(['KEY2','KEY4'])
    expect(store.search({required:'laundry',preferred:'cats',sort:'best'}).listings.map(l=>l.id)).toEqual(['KEY2','KEY4'])
    expect(store.search({preferred:'cats',sort:'best'}).total).toBe(4)
    expect(store.search({preferred:'cats',sort:'best'}).listings[0].id).toBe('KEY2')
    expect(()=>store.search({required:'anything'})).toThrow('Invalid amenities')
  }))
  it('uses documented subtypes and source locations rather than inferred neighborhood boundaries',()=>fixture(store=>{
    store.apply('onekey2',{rows:[row(1,{PropertySubType:'Stock Cooperative'}),row(2,{PropertySubType:'Condominium',City:'Sunnyside'}),row(3,{PropertySubType:'Single Family Residence',City:"O'Brien Place"})],next:null})
    expect(store.search({subtype:'coop'}).listings.map(l=>l.id)).toEqual(['KEY1'])
    expect(store.search({places:JSON.stringify(['Astoria','Sunnyside'])}).total).toBe(2)
    expect(store.search({places:JSON.stringify(["O'Brien Place"])}).total).toBe(1)
    expect(()=>store.search({places:JSON.stringify(Array(9).fill('Astoria'))})).toThrow('Invalid places')
  }))
  it('does not infer size units, monthly fees, tax costs or availability from missing data',()=>fixture(store=>{
    store.apply('onekey2',{rows:[row(1,{LivingArea:1000,LivingAreaUnits:'Square Feet',AssociationFee:500,AssociationFeeFrequency:'Monthly',AvailabilityDate:'2026-11-01',TaxAnnualAmount:3000}),row(2,{LivingArea:2000,AssociationFee:200,AvailabilityDate:''}),row(3,{LivingArea:1000,LivingAreaUnits:'Square Meters',AssociationFee:500,AssociationFeeFrequency:'Annually',AvailabilityDate:'2026-12-01'})],next:null})
    expect(store.search({minArea:'900'}).listings.map(l=>l.id)).toEqual(['KEY1'])
    expect(store.search({maxFee:'600'}).listings.map(l=>l.id)).toEqual(['KEY1'])
    expect(store.search({maxTax:'3500'}).listings.map(l=>l.id)).toEqual(['KEY1'])
    expect(store.search({availableBy:'2026-11-15'}).listings.map(l=>l.id)).toEqual(['KEY1'])
    expect(()=>store.search({availableBy:'2026-02-30'})).toThrow('Invalid')
  }))
  it('requires numeric reported parking rather than unknown text or zero strings',()=>fixture(store=>{
    store.apply('onekey2',{rows:[row(1,{ParkingTotal:'Unknown'}),row(2,{ParkingTotal:'0'}),row(3,{ParkingTotal:0}),row(4,{ParkingTotal:1}),row(5,{GarageSpaces:2}),row(6)],next:null})
    expect(store.search({parking:'1'}).listings.map(l=>l.id)).toEqual(['KEY4','KEY5'])
  }))
  it('maps every filtered match independently of card pagination and never maps a withheld address',()=>fixture(store=>{
    const rows=Array.from({length:30},(_,i)=>row(i,{Latitude:40.75,Longitude:-73.9,InternetAddressDisplayYN:i!==0,CountyOrParish:i===29?'Kings County':'Queens'}))
    store.apply('onekey2',{rows,next:null})
    const first=store.discovery({borough:'Queens',limit:'12',offset:'12'})
    expect(first.total).toBe(29);expect(first.points).toHaveLength(28);expect(first.unmapped).toBe(1)
    expect(first.points.some(point=>point.id==='KEY0')).toBe(false)
    expect(first.areas).toEqual([{borough:'Queens',total:29,mapped:28}])
    store.apply('onekey2',{rows:[row(1,{MlgCanView:false})],next:null})
    expect(store.discovery({borough:'Queens'}).points).toHaveLength(27)
    expect(store.search({bounds:'-74.0,40.7,-73.8,40.8'}).total).toBe(28)
    expect(()=>store.discovery({bounds:'-180,-90,180,90'})).toThrow('Invalid map bounds')
  }))
  it('offers borough totals and location choices without inventing property coordinates',()=>fixture(store=>{
    store.apply('onekey2',{rows:[row(1),row(2,{City:'Sunnyside'}),row(3,{CountyOrParish:'Kings County',City:'Brooklyn'})],next:null})
    const discovery=store.discovery({borough:'NYC',places:JSON.stringify(['Astoria'])})
    expect(discovery.total).toBe(1);expect(discovery.mapped).toBe(0);expect(discovery.unmapped).toBe(1)
    expect(discovery.points).toEqual([]);expect(discovery.places).toHaveLength(3)
  }))
  it('uses the same richer search contract on the indexed live D1 replica',async()=>{
    const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../../workers/property-search/production-migrations/0001_replica.sql',import.meta.url),'utf8'))
    const records=[row(1,{PropertySubType:'Stock Cooperative',LaundryFeatures:['In Unit'],Latitude:40.75,Longitude:-73.9}),row(2)]
    for(const record of records){const listing=publicProjection(record);sqlite.prepare('INSERT INTO listings(source,id,status,city,state,price,beds,property_type,search_text,public_json,borough,missing_price,missing_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run('onekey2',record.ListingKey,'Active','Astoria','NY',record.ListPrice,2,'Residential','astoria',JSON.stringify(listing),'Queens',0,1)}
    const db={prepare(sql:string){let values:(string|number)[]=[];return {bind(...next:(string|number)[]){values=next;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return {results:sqlite.prepare(sql).all(...values)}}}}}
    try{const store=searchStore(db,{production:true});const result=await store.search({borough:'Queens',subtype:'coop',required:'laundry',sort:'best'});expect(result.total).toBe(1);expect(result.listings[0].id).toBe('KEY1');expect((await store.discovery({borough:'NYC'})).mapped).toBe(1)}finally{sqlite.close()}
  })
})
