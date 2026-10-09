import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { sqliteD1 } from '../../../workers/transactions/__tests__/helpers/sqlite'
import { handleListingInquiries } from '../listing-inquiries'

let store: ReturnType<typeof sqliteD1>
const actor = { tenantId:'t1', userId:'u1', role:'salesperson' }
const listing = async (id:string) => id === 'l1' || id === 'l2' ? {id,name:'123 Main St'} : null
async function request(path:string, body?:object, method=body?'POST':'GET', identity=actor) {
  const response = await handleListingInquiries(new Request(`https://test${path}`,{method,body:body?JSON.stringify(body):undefined}),store.db,identity,listing)
  return { status:response.status, ...await response.json() as {data:any;error?:string} }
}
const visit = (requestId='11111111-1111-1111-1111-111111111111') => ({contactId:'c1',listingId:'l1',requestId,shownAt:'2027-01-01T15:00:00Z',status:'scheduled'})
beforeEach(()=>{
  store=sqliteD1()
  store.sqlite.exec(`CREATE TABLE contacts(id TEXT PRIMARY KEY,tenant_id TEXT,assigned_to TEXT,first_name TEXT,last_name TEXT,email TEXT,phone TEXT,normalized_phone TEXT,type TEXT,status TEXT,source TEXT,lifecycle_stage TEXT,qualification_status TEXT,is_archived INTEGER DEFAULT 0,is_active INTEGER DEFAULT 1,source_listing_id TEXT);
    CREATE TABLE showings(id TEXT PRIMARY KEY,tenant_id TEXT,listing_id TEXT,agent_id TEXT,buyer_name TEXT,shown_at TEXT,feedback TEXT,listing_address TEXT);
    CREATE TABLE contact_source_links(id TEXT,tenant_id TEXT,contact_id TEXT,listing_id TEXT);
    INSERT INTO contacts(id,tenant_id,assigned_to,first_name,last_name,email,lifecycle_stage) VALUES('c1','t1','u1','Jane','Doe','jane@example.com','active_client'),('c2','t1','u2','Other','Agent','other@example.com','lead'),('c3','t2','u1','Another','Tenant','tenant@example.com','lead');`)
  store.sqlite.exec(readFileSync('worker/db/migrations/056_listing_inquiry_showings.sql','utf8'))
})
afterEach(()=>store.sqlite.close())
describe('shared listing inquiries and appointments',()=>{
  it('links both directions, deduplicates retries, and keeps repeat visits on one inquiry without changing lifecycle',async()=>{
    expect((await request('/api/listing-inquiries',visit())).status).toBe(200)
    await request('/api/listing-inquiries',visit())
    await request('/api/listing-inquiries',visit('22222222-2222-2222-2222-222222222222'))
    const byListing=await request('/api/listing-inquiries?listingId=l1')
    const byContact=await request('/api/listing-inquiries?contactId=c1')
    expect(byListing.data.inquiries).toEqual(byContact.data.inquiries)
    expect(byListing.data.total).toBe(1)
    expect(byListing.data.inquiries[0].showing_count).toBe(2)
    expect(byListing.data.inquiries[0].lifecycle_stage).toBe('active_client')
  })
  it('allows several listings for the same person and interest without an appointment',async()=>{
    await request('/api/listing-inquiries',visit())
    await request('/api/listing-inquiries',{...visit('33333333-3333-3333-3333-333333333333'),listingId:'l2',shownAt:undefined})
    expect((await request('/api/listing-inquiries?contactId=c1')).data.total).toBe(2)
    expect((await request('/api/listing-inquiries?listingId=l2')).data.inquiries[0].showing_count).toBe(0)
  })
  it('reschedules and cancels the same visit without deleting its inquiry',async()=>{
    const created=await request('/api/listing-inquiries',visit())
    const result=await request(`/api/listing-inquiries/${created.data.id}/showings`)
    const id=result.data.showings[0].id
    expect((await request(`/api/inquiry-showings/${id}`,{shownAt:'2027-01-02T17:00:00Z'},'PATCH')).status).toBe(200)
    expect((await request(`/api/inquiry-showings/${id}`,{status:'canceled',feedback:'Client canceled'},'PATCH')).status).toBe(200)
    const visits=await request(`/api/listing-inquiries/${created.data.id}/showings`)
    expect(visits.data.showings).toHaveLength(1)
    expect(visits.data.showings[0]).toMatchObject({status:'canceled',shown_at:'2027-01-02T17:00:00.000Z'})
    expect((await request('/api/listing-inquiries')).data.inquiries[0].next_showing).toBeNull()
  })
  it('protects tenant and agent boundaries for reads, writes, and updates',async()=>{
    expect((await request('/api/listing-inquiries',{...visit(),contactId:'c2'})).status).toBe(403)
    expect((await request('/api/listing-inquiries',{...visit(),contactId:'c3'})).status).toBe(404)
    const created=await request('/api/listing-inquiries',visit())
    expect((await request('/api/listing-inquiries',undefined,'GET',{...actor,userId:'u2'})).data.total).toBe(0)
    expect((await request(`/api/listing-inquiries/${created.data.id}`,{archived:true},'PATCH',{...actor,tenantId:'t2'})).status).toBe(404)
    const visits=await request(`/api/listing-inquiries/${created.data.id}/showings`)
    expect((await request(`/api/inquiry-showings/${visits.data.showings[0].id}`,{status:'completed'},'PATCH',{...actor,userId:'u2'})).status).toBe(404)
    expect((await request('/api/listing-inquiries',undefined,'GET',{...actor,userId:'u2',role:'broker'})).data.total).toBe(1)
  })
  it('reuses matched contacts and rejects conflicting identities',async()=>{
    expect((await request('/api/listing-inquiries',{...visit(),contactId:undefined,firstName:'Jane',email:' JANE@example.com '})).data.contactId).toBe('c1')
    store.sqlite.exec("UPDATE contacts SET normalized_phone='2125551212' WHERE id='c2'")
    expect((await request('/api/listing-inquiries',{...visit(),contactId:undefined,firstName:'Jane',email:'jane@example.com',phone:'212-555-1212'})).status).toBe(409)
  })
  it('creates an outside agent once and records distinct visits',async()=>{
    const data={...visit(),contactId:undefined,firstName:'Sam',lastName:'Agent',email:'sam@example.com',attendeeRole:'outside_agent'}
    expect((await request('/api/listing-inquiries',data)).status).toBe(200)
    await request('/api/listing-inquiries',{...data,requestId:'44444444-4444-4444-4444-444444444444'})
    expect(store.sqlite.prepare("SELECT COUNT(*) n FROM contacts WHERE email='sam@example.com'").get()).toMatchObject({n:1})
    const pool=await request('/api/listing-inquiries')
    expect(pool.data.inquiries[0]).toMatchObject({attendee_role:'outside_agent',showing_count:2})
  })
  it('preserves archives separately from the contact lifecycle',async()=>{
    const created=await request('/api/listing-inquiries',visit())
    await request(`/api/listing-inquiries/${created.data.id}`,{archived:true},'PATCH')
    expect((await request('/api/listing-inquiries')).data.total).toBe(0)
    expect((await request('/api/listing-inquiries?archived=1')).data.total).toBe(1)
    await request('/api/listing-inquiries',visit('55555555-5555-5555-5555-555555555555'))
    expect((await request('/api/listing-inquiries')).data.total).toBe(1)
  })
  it('connects incoming source evidence without duplicating inquiries or modifying consent',()=>{
    store.sqlite.exec("INSERT INTO contact_source_links VALUES ('s1','t1','c1','l1'),('s2','t1','c1','l1'),('s3','t2','c1','l2')")
    expect(store.sqlite.prepare('SELECT COUNT(*) n FROM listing_inquiries').get()).toMatchObject({n:1})
  })
  it('rejects invalid dates, future completion, and missing listings',async()=>{
    expect((await request('/api/listing-inquiries',{...visit(),shownAt:'bad'})).status).toBe(400)
    expect((await request('/api/listing-inquiries',{...visit(),status:'completed'})).status).toBe(400)
    expect((await request('/api/listing-inquiries',{...visit(),listingId:'missing'})).status).toBe(404)
  })
  it('rolls back the contact and inquiry when the appointment write fails',async()=>{
    store.sqlite.exec("CREATE TRIGGER fail_visit BEFORE INSERT ON showings BEGIN SELECT RAISE(ABORT,'test failure'); END")
    await expect(request('/api/listing-inquiries',{...visit(),contactId:undefined,firstName:'New',email:'new@example.com'})).rejects.toThrow('test failure')
    expect(store.sqlite.prepare("SELECT COUNT(*) n FROM contacts WHERE email='new@example.com'").get()).toMatchObject({n:0})
    expect(store.sqlite.prepare('SELECT COUNT(*) n FROM listing_inquiries').get()).toMatchObject({n:0})
  })
})
