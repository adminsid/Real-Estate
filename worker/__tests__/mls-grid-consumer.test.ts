import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { DEFAULT_BRAND } from '../../scripts/mls-grid/brand.mjs'
import { mortgagePayment, monthlyFee, consumerProfile, showingInstant, validateInquiry, publicEmail, publicMapURL, previewFields } from '../../scripts/mls-grid/consumer.mjs'
import { publicProjection } from '../../scripts/mls-grid/client.mjs'
import { openStore } from '../../scripts/mls-grid/store.mjs'
import { createPreviewServer } from '../../scripts/mls-grid/preview-server.mjs'
const row = (extra = {}) => ({ ListingKey:'KEY1', ListingId:'KEY123', OriginatingSystemName:'onekey2', MlgCanView:true, MlgCanUse:['IDX'], StandardStatus:'Active', PropertyType:'Residential', StateOrProvince:'NY', CountyOrParish:'Queens', ListPrice:500000, ModificationTimestamp:'2026-10-01T12:00:00Z', ...extra })

describe('Consumer decisions', () => {
 it('links only supplied public coordinates and never restores withheld location', () => {
  const location={Latitude:40.73,Longitude:-73.99}
  const url=new URL(publicMapURL(location))
  expect(url.origin).toBe('https://www.google.com')
  expect(url.searchParams.get('query')).toBe('40.73,-73.99')
  expect(url.searchParams.get('api')).toBe('1')
  for(const listing of [{...location,addressWithheld:true},{Latitude:null,Longitude:null},{Latitude:'40.73',Longitude:-73.99},{Latitude:91,Longitude:0},{Latitude:0,Longitude:181},{Latitude:NaN,Longitude:0},{Latitude:0,Longitude:0},{}])expect(publicMapURL(listing)).toBeNull()
  expect(publicMapURL(publicProjection(row({...location,InternetAddressDisplayYN:false})))).toBeNull()
 })
 it('calculates amortization, zero interest, and cash purchases', () => {
  expect(mortgagePayment(400000,20,6.5,30).payment).toBeCloseTo(2022.62,2)
  expect(mortgagePayment(120000,0,0,10).payment).toBe(1000)
  expect(mortgagePayment(500000,100,6.5,30).payment).toBe(0)
  for(const args of [[100,101,6,30],[100,-1,6,30],[0,20,6,30],[100,20,-1,30],[100,20,6,1.5]])expect(()=>mortgagePayment(...args)).toThrow()
 })
 it('keeps unknown fee periods distinct from zero and converts actual periods', () => {
  expect(monthlyFee(1200,'Annually')).toBe(100)
  expect(monthlyFee(600,'Quarterly')).toBe(200)
  expect(monthlyFee(500,'unknown')).toBeNull()
  expect(monthlyFee(undefined,'Monthly')).toBeNull()
  expect(monthlyFee(0,undefined)).toBe(0)
 })
 it('matches each consumer type without applying purchase assumptions to leases or land', () => {
  for(const [type,subtype,key]of [['Residential Lease','','rental'],['Residential Income','','investment'],['Commercial Sale','','commercial-sale'],['Commercial Lease','','commercial-lease'],['Land','','land'],['Residential','Stock Cooperative','coop'],['Residential','Condominium','condo'],['Residential','Single Family Residence','house']])expect(consumerProfile({PropertyType:type,PropertySubType:subtype}).key).toBe(key)
 })
 it('summarizes business and investment facts without residential assumptions or invented missing values',()=>{
  const commercial={PropertyType:'Commercial Lease',BuildingAreaTotal:0,BedroomsTotal:4,BusinessType:['Retail'],ListPrice:5000}
  expect(previewFields(commercial)).toContain('BuildingAreaTotal')
  expect(previewFields(commercial)).not.toContain('BedroomsTotal')
  expect(previewFields(commercial)).not.toContain('BuildingAreaUnits')
  expect(previewFields({PropertyType:'Residential Income',NumberOfUnitsTotal:0,NetOperatingIncome:-500})).toContain('NetOperatingIncome')
  expect(previewFields({PropertyType:'Residential Lease',PetsAllowed:[],RentIncludes:['Water']})).toEqual(['RentIncludes'])
 })
 it('uses New York DST offsets and rejects nonexistent calendar dates', () => {
  expect(showingInstant('2026-10-10','10:00')).toBe('2026-10-10T14:00:00.000Z')
  expect(showingInstant('2026-12-10','10:00')).toBe('2026-12-10T15:00:00.000Z')
  expect(()=>showingInstant('2026-02-30','10:00')).toThrow()
  expect(()=>showingInstant('2026-03-08','02:30')).toThrow()
 })
 it('validates tour preferences, missing message, and contact email without guessing addresses', () => {
  const now=new Date('2026-10-07T12:00:00Z'),data={kind:'tour',date:'2026-10-10',time:'10:00',name:'Demo',email:'demo@example.com'}
  expect(validateInquiry(data,now).requestedAt).toBe('2026-10-10T14:00:00.000Z')
  expect(()=>validateInquiry({...data,date:'2026-10-01'},now)).toThrow('future')
  expect(()=>validateInquiry({...data,time:'02:00'},now)).toThrow('preferred time')
  expect(()=>validateInquiry({...data,kind:'message'},now)).toThrow('question')
  expect(publicEmail({AttributionContact:'agent@example.com'})).toBe('agent@example.com')
  expect(publicEmail({AttributionContact:'718-555-0100',ListAgentEmail:'secret@example.com'})).toBeNull()
 })
 it('permits reviewed arrays and negative/false/zero facts while suppressing withheld location text', () => {
  const listing=publicProjection(row({Heating:['Electric'],WaterfrontYN:false,ParkingTotal:0,NetOperatingIncome:-500,InternetAddressDisplayYN:false,PublicRemarks:'Secret location',TaxLegalDescription:'Secret lot',OwnerName:'Private',ShowingInstructions:'Private'}))
  expect(listing.Heating).toEqual(['Electric']);expect(listing.WaterfrontYN).toBe(false);expect(listing.ParkingTotal).toBe(0);expect(listing.NetOperatingIncome).toBe(-500)
  for(const field of ['PublicRemarks','TaxLegalDescription','OwnerName','ShowingInstructions'])expect(listing).not.toHaveProperty(field)
 })
 it('suppresses old media captions when an existing listing later withholds its address',()=>{
  const store=openStore(':memory:');try{
   store.apply('onekey2',{rows:[row()],next:null,media:new Map([['KEY1',[{key:'photo',revision:null,file:'a'.repeat(64),type:'image/jpeg',order:0,caption:'Secret Street'}]]])})
   store.apply('onekey2',{rows:[row({InternetAddressDisplayYN:false,PublicRemarks:'Secret Street'})],next:null})
   expect(store.listing('onekey2','KEY1').media[0].caption).toBe('')
   expect(store.search().listings[0]).not.toHaveProperty('PublicRemarks')
  }finally{store.close()}
 })
 it('filters all five boroughs by source county aliases rather than ambiguous city names',()=>{
  const store=openStore(':memory:');try{
   const boroughs=['Manhattan','Brooklyn','Queens','Bronx','Staten Island'],counties=['New York (Manhattan)','Kings (Brooklyn)','Queens','Bronx County','Richmond (Staten Island)'];
   store.apply('onekey2',{rows:counties.map((county,index)=>row({ListingKey:'KEY'+index,CountyOrParish:county,StateOrProvince:'NY',City:'New York'})),next:null});
   for(const borough of boroughs)expect(store.search({borough}).total).toBe(1);
   expect(store.search({borough:'NYC'}).total).toBe(5);
   expect(()=>store.search({borough:'invalid'})).toThrow('Invalid borough');
  }finally{store.close()}
 })
})

describe('Local preview HTTP flow', () => {
 let store,server,origin,directory
 const file='a'.repeat(64)
 beforeAll(async()=>{
  directory=await mkdtemp('/tmp/mls-preview-test-');await mkdir(directory+'/media/optimized',{recursive:true})
  await writeFile(directory+'/media/'+file,Buffer.from([255,216,255,0]));await writeFile(directory+'/media/optimized/'+file+'-card.webp',Buffer.from('RIFFtestWEBP'))
  store=openStore(':memory:');store.apply('onekey2',{rows:[row()],next:null,media:new Map([['KEY1',[{key:'photo',revision:null,file,type:'image/jpeg',order:0,caption:''}]]])})
  server=createPreviewServer(store,directory+'/demo.sqlite');await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});origin='http://127.0.0.1:'+server.address().port
 })
 afterAll(async()=>{if(server?.listening)await new Promise<void>(resolve=>server.close(resolve));store?.close();if(directory)await rm(directory,{recursive:true,force:true})})
 it('serves a deep-link page and eligible details with a strict script policy', async()=>{
  const page=await fetch(origin+'/listing/onekey2/KEY1');expect(page.status).toBe(200);expect(page.headers.get('content-security-policy')).not.toContain('unsafe-inline');expect(await page.text()).toContain('listing-content')
  expect((await (await fetch(origin+'/api/listing/onekey2/KEY1')).json()).listing.ListingId).toBe('123')
 })
 it('saves a local inquiry, rejects cross-site writes and unavailable listings', async()=>{
  const body={kind:'message',source:'onekey2',id:'KEY1',name:'Local Test',email:'test@example.com',message:'Is there a floor plan?'}
  const post=(originHeader,data)=>fetch(origin+'/api/inquiries',{method:'POST',headers:{Origin:originHeader,'Content-Type':'application/json'},body:JSON.stringify(data)})
  expect((await post('https://foreign.example',body)).status).toBe(403)
  const result=await post(origin,body);expect(result.status).toBe(201);expect((await result.json()).demo).toBe(true)
  expect((await post(origin,{...body,id:'missing'})).status).toBe(404)
  expect((await post(origin,{...body,message:''})).status).toBe(400)
  expect((await fetch(origin+'/api/inquiries')).status).toBe(404)
 })
 it('serves smaller representations with distinct validators and safe original fallback',async()=>{
  const original=await fetch(origin+'/media/'+file),card=await fetch(origin+'/media/'+file+'?variant=card')
  expect(original.headers.get('content-type')).toBe('image/jpeg');expect(card.headers.get('content-type')).toBe('image/webp')
  expect(original.headers.get('etag')).not.toBe(card.headers.get('etag'));expect(card.headers.get('cache-control')).toBe('private, no-cache')
  expect((await fetch(origin+'/media/'+file+'?variant=card',{headers:{'If-None-Match':card.headers.get('etag')}})).status).toBe(304)
  expect((await fetch(origin+'/media/'+file+'?variant=display')).headers.get('content-type')).toBe('image/jpeg')
  expect((await fetch(origin+'/media/'+file+'?variant=bad')).status).toBe(400)
 })
 it('saves validated service branding locally, rejects cross-site writes, and loads the same kit on restart',async()=>{
  const post=(data,site=origin)=>fetch(origin+'/api/brand',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify(data)})
  expect((await post(DEFAULT_BRAND,'https://foreign.example')).status).toBe(403)
  expect((await post({...DEFAULT_BRAND,accent:'#ffffff'})).status).toBe(400)
  expect((await post({...DEFAULT_BRAND,name:'x'.repeat(5000)})).status).toBe(413)
  const next={...DEFAULT_BRAND,name:'A < B & Search',font:'modern',colorMode:'signature'}
  expect((await post(next)).status).toBe(200)
  expect(JSON.parse(await readFile(directory+'/brand.json','utf8'))).toEqual(next)
  const html=await (await fetch(origin+'/listing/onekey2/KEY1')).text()
  expect(html).toContain('A &lt; B &amp; Search')
  expect(html).toContain('property="og:image"')
  const reopened=createPreviewServer(store,directory+'/demo.sqlite',{publicURL:'https://search.example',embedOrigins:['https://broker.example']})
  try{
   await new Promise<void>((resolve,reject)=>{reopened.once('error',reject);reopened.listen(0,'127.0.0.1',resolve)})
   const address=reopened.address();if(!address||typeof address==='string')throw Error('Missing server address')
   const restartedOrigin='http://127.0.0.1:'+address.port
   expect((await(await fetch(restartedOrigin+'/api/brand')).json()).brand).toEqual(next)
   const restartedPage=await fetch(restartedOrigin+'/listing/onekey2/KEY1')
   expect(restartedPage.headers.get('x-robots-tag')).toBe('noindex, nofollow')
   expect(await restartedPage.text()).toContain('rel="canonical" href="https://search.example/listing/onekey2/KEY1"')
   const embed=await fetch(restartedOrigin+'/embed');expect(embed.headers.get('content-security-policy')).toContain("frame-ancestors 'self' https://broker.example")
   expect(await embed.text()).toContain('data-embed-origins="'+restartedOrigin+' https://broker.example"')
  }finally{if(reopened.listening)await new Promise<void>(resolve=>reopened.close(resolve))}
 })
 it('isolates the embedded view and keeps listing URLs and metadata on full pages',async()=>{
  const embedded=await fetch(origin+'/embed?type=Residential')
  expect(embedded.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
  expect(embedded.headers.get('content-security-policy')).not.toContain('unsafe-inline')
  const html=await embedded.text()
  expect(html).toContain('data-embedded="true"')
  expect(html).toContain(origin+'/listing/onekey2/KEY1')
  expect(html).toContain('target="_blank" rel="noopener"')
  expect((await fetch(origin+'/')).headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  const host=await(await fetch(origin+'/embed-demo')).text();expect(host).toContain('data-property-search');expect(host).toContain('/embed-loader.js')
  const css=await fetch(origin+'/theme.css?accent=%23303d50&colorMode=signature')
  expect(css.headers.get('content-type')).toContain('text/css')
  expect(await css.text()).toContain('body[data-experience="rental"]{--accent:#303d50;')
  expect((await fetch(origin+'/theme.css?accent=red%3Bbackground%3Ared')).status).toBe(400)
 })
 it('withdraws detail access immediately when permission is revoked',async()=>{
  store.apply('onekey2',{rows:[row({MlgCanUse:['VOW']})],next:null});expect((await fetch(origin+'/api/listing/onekey2/KEY1')).status).toBe(404)
  const page=await fetch(origin+'/listing/onekey2/KEY1');expect(page.status).toBe(404);expect(page.headers.get('x-robots-tag')).toBe('noindex, nofollow');expect(await page.text()).not.toContain('og:image')
  expect((await fetch(origin+'/media/'+file+'?variant=card',{headers:{'If-None-Match':`"${file}-card"`}})).status).toBe(404)
 })
})
