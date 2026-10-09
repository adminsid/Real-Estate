import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { sqliteD1 } from '../../../workers/transactions/__tests__/helpers/sqlite'
import { handleNext, handleContactRelationships, type NextActor } from '../next'
import { newSellerJourney, nextProgress, importNextJourneys, validateNextDocument, type NextJourney, type NextOffer } from '../../../src/domain/next'

const owner:NextActor={userId:'owner',tenantId:'tenant',role:'salesperson',canWrite:true,canTransactions:true}
const collaborator:NextActor={...owner,userId:'other'}
const assistant:NextActor={...owner,userId:'assistant',role:'assistant',principalId:'owner'}
const offer={date:'2026-09-14',buyer:'Example buyer',agent:'Buyer agent',price:'$500,000',terms:'Financing',notes:'Presented',status:'Accepted'}
let store:ReturnType<typeof sqliteD1>
beforeEach(()=>{
  store=sqliteD1()
  store.sqlite.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY);INSERT INTO tenants VALUES('tenant'),('foreign');
    CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,role TEXT,is_active INTEGER);
    INSERT INTO users VALUES('owner','tenant','Owner','salesperson',1),('other','tenant','Other Agent','salesperson',1),('assistant','tenant','Assistant','assistant',1),('foreign','foreign','Outsider','salesperson',1);
    CREATE TABLE assistant_assignments(id TEXT,tenant_id TEXT,assistant_id TEXT,principal_id TEXT,status TEXT,can_access_contacts INTEGER,expires_at TEXT);
    INSERT INTO assistant_assignments VALUES('a','tenant','assistant','owner','active',1,NULL);
    CREATE TABLE contacts(id TEXT PRIMARY KEY,tenant_id TEXT,assigned_to TEXT,first_name TEXT,last_name TEXT,email TEXT,phone TEXT,is_active INTEGER);
    INSERT INTO contacts VALUES('c1','tenant','owner','One','Seller','one@example.test','',1),('c2','tenant','owner','Two','Seller','two@example.test','',1),('c3','tenant','other','Other','Contact','','',1);
    CREATE TABLE transactions(id TEXT PRIMARY KEY,tenant_id TEXT,assigned_to TEXT,name TEXT,inventory_listing_id TEXT,is_locked INTEGER,is_active INTEGER,updated_at TEXT);
    INSERT INTO transactions VALUES('tx','tenant','owner','Sale','listing',0,1,'2026-09-14');`)
  store.sqlite.exec(readFileSync('worker/db/migrations/036_transaction_offers.sql','utf8'))
  store.sqlite.exec(`CREATE TABLE showings(id TEXT PRIMARY KEY,tenant_id TEXT,listing_id TEXT,agent_id TEXT,buyer_name TEXT,shown_at TEXT,feedback TEXT,status TEXT);`)
  store.sqlite.exec(readFileSync('worker/db/migrations/057_next_seller_journeys.sql','utf8'))
})
afterEach(()=>store.sqlite.close())
const call=(path:string,method='GET',body?:unknown,actor=owner)=>handleNext(new Request(`https://workspace.test/api/next/${path}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),store.db,actor,async id=>id==='listing')
const result=async<T>(response:Response):Promise<T>=>{const body=await response.json();expect(response.status,JSON.stringify(body)).toBeLessThan(300);return body.data}
const create=()=>call('journeys','POST',{document:newSellerJourney('Home sale')}).then(result<NextJourney>)
const relation=(method:string,body?:unknown,contact='c1',actor=owner)=>handleContactRelationships(new Request(`https://workspace.test/api/contact-relationships?contactId=${contact}`,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),store.db,actor)

describe('Next seller journey',()=>{
  it('preserves all template phases, descriptions, check-ins and outcomes with independent copies',()=>{
    const a=newSellerJourney('A'),b=newSellerJourney('B')
    expect(a.phases.map(p=>p.name)).toEqual(['Pre-Listing','Listing & Marketing','Contract','Closing'])
    expect(a.phases.flatMap(p=>p.milestones)).toHaveLength(23)
    expect(nextProgress(a.phases)).toEqual({done:0,total:182,percent:0})
    for(const day of [30,60,90,120])expect(a.phases[1].milestones.find(m=>m.name===`${day} Day Check-in`)?.outcomes).toHaveLength(4)
    a.phases[0].milestones[0].outcomes[0].done=true
    expect(b.phases[0].milestones[0].outcomes[0].done).toBe(false)
  })
  it('does not improve progress when hiding work; explicit N/A does exclude it',()=>{
    const d=newSellerJourney('A');const o=d.phases[0].milestones[0].outcomes[0]
    o.hidden=true;d.phases[0].milestones[0].hidden=true
    expect(nextProgress(d.phases).total).toBe(182)
    o.notApplicable='No association';expect(nextProgress(d.phases).total).toBe(181)
  })
  it('imports prototype exports while stripping assignments and business record IDs',()=>{
    const d=newSellerJourney('A');d.contactIds=['c1'];d.phases[0].id='old-phase-id';d.phases[0].milestones[0].outcomes[0].assigneeId='foreign'
    const imported=importNextJourneys({journeys:[{...d,offers:[],showings:[]}],currentId:'legacy'})[0].document
    expect(imported.contactIds).toEqual([]);expect(imported.phases[0].id).toBe('prelisting');expect(imported.phases[0].milestones[0].outcomes[0].assigneeId).toBe('')
    expect(nextProgress(imported.phases).total).toBe(182)
  })
  it('rejects unsafe URLs, duplicate IDs, impossible dates and malformed imports',()=>{
    const d=newSellerJourney('A');d.inventoryUrl='javascript:alert(1)';expect(()=>validateNextDocument(d)).toThrow()
    d.inventoryUrl='/inventory';d.phases[0].milestones[0].outcomes[0].dueDate='2026-99-99';expect(()=>validateNextDocument(d)).toThrow()
    delete d.phases[0].milestones[0].outcomes[0].dueDate;d.phases[0].milestones[0].outcomes[1].id=d.phases[0].milestones[0].outcomes[0].id;expect(()=>validateNextDocument(d)).toThrow()
    expect(()=>importNextJourneys({journeys:[{phases:[]}]})).toThrow()
  })
  it('starts before a transaction and persists edits with history',async()=>{
    const j=await create();expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM transactions').get()?.n).toBe(1)
    j.document.phases[0].milestones.push({id:'custom',name:'Custom milestone',description:'Discuss roof',hidden:false,outcomes:[{id:'custom-outcome',name:'Book roofer',description:'Call vendor',done:false,hidden:false}]})
    const saved=await result<NextJourney>(await call(`journeys/${j.id}`,'PUT',{revision:j.revision,document:j.document}))
    expect(saved.revision).toBe(2);expect(saved.document.phases[0].milestones.at(-1)?.name).toBe('Custom milestone')
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM next_journey_history').get()?.n).toBe(1)
  })
  it('rejects tenant and agent access until explicitly added, and prevents team privilege escalation',async()=>{
    const j=await create()
    expect((await call(`journeys/${j.id}`,'GET',undefined,collaborator)).status).toBe(404)
    expect((await call(`journeys/${j.id}`,'GET',undefined,{...owner,tenantId:'foreign'})).status).toBe(404)
    const shared=await result<NextJourney>(await call(`journeys/${j.id}/members`,'PUT',{revision:1,userIds:['other']}))
    expect((await call(`journeys/${j.id}`,'GET',undefined,collaborator)).status).toBe(200)
    expect((await call(`journeys/${j.id}/members`,'PUT',{revision:shared.revision,userIds:['assistant']},collaborator)).status).toBe(403)
    expect((await call(`journeys/${j.id}/offers`,'GET',undefined,collaborator)).status).toBe(403)
  })
  it('only permits assistants with matching active assignments on the team',async()=>{
    const j=await create();store.sqlite.exec("UPDATE assistant_assignments SET status='revoked'")
    expect((await call(`journeys/${j.id}/members`,'PUT',{revision:1,userIds:['assistant']})).status).toBe(403)
  })
  it('shares assigned outcomes with the assistant dashboard and removes completed work',async()=>{
    const j=await create();let saved=await result<NextJourney>(await call(`journeys/${j.id}/members`,'PUT',{revision:1,userIds:['assistant']}))
    const outcome=saved.document.phases[0].milestones[0].outcomes[0];outcome.assigneeId='assistant';outcome.dueDate='2026-09-14'
    saved=await result<NextJourney>(await call(`journeys/${j.id}`,'PUT',{revision:saved.revision,document:saved.document}))
    expect(await result<unknown[]>(await call('assignments','GET',undefined,assistant))).toHaveLength(1)
    saved.document.phases[0].milestones[0].outcomes[0].done=true
    await result(await call(`journeys/${j.id}`,'PUT',{revision:saved.revision,document:saved.document},assistant))
    expect(await result<unknown[]>(await call('assignments','GET',undefined,assistant))).toHaveLength(0)
  })
  it('rejects stale writes from another user or tab without changing records',async()=>{
    const j=await create();const body={revision:1,record:offer}
    expect((await call(`journeys/${j.id}/offers`,'POST',body)).status).toBe(200)
    expect((await call(`journeys/${j.id}/offers`,'POST',body)).status).toBe(409)
    expect(await result<unknown[]>(await call(`journeys/${j.id}/offers`))).toHaveLength(1)
  })
  it('enforces stage gates on the server and derives acceptance from the offer record',async()=>{
    const j=await create();j.document.phases[2].milestones[0].outcomes[0].done=true
    expect((await call(`journeys/${j.id}`,'PUT',{revision:1,document:j.document})).status).toBe(400)
    const accepted=await result<NextJourney>(await call(`journeys/${j.id}/offers`,'POST',{revision:1,record:offer}))
    expect(accepted.document.phases.flatMap(p=>p.milestones.flatMap(m=>m.outcomes)).find(o=>o.gateway)?.done).toBe(true)
    const logs=await result<NextOffer[]>(await call(`journeys/${j.id}/offers`))
    const withdrawn=await result<NextJourney>(await call(`journeys/${j.id}/offers`,'PUT',{revision:accepted.revision,id:logs[0].id,record:{...offer,status:'Withdrawn'}}))
    expect(withdrawn.document.phases.flatMap(p=>p.milestones.flatMap(m=>m.outcomes)).find(o=>o.gateway)?.done).toBe(false)
  })
  it('promotes draft offers and showings to existing records when linked, without copies',async()=>{
    const j=await create();let saved=await result<NextJourney>(await call(`journeys/${j.id}/offers`,'POST',{revision:1,record:offer}))
    saved=await result<NextJourney>(await call(`journeys/${j.id}/showings`,'POST',{revision:saved.revision,record:{time:'2026-09-10T14:00:00Z',type:'Private showing',agent:'Buyer agent',contact:'Buyer',feedback:'Good',followUp:'Contacted'}}))
    saved.document.listingId='listing';saved.document.transactionId='tx'
    saved=await result<NextJourney>(await call(`journeys/${j.id}`,'PUT',{revision:saved.revision,document:saved.document}))
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM next_offer_drafts').get()?.n).toBe(0)
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM next_showing_drafts').get()?.n).toBe(0)
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM transaction_offers').get()?.n).toBe(1)
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM showings').get()?.n).toBe(1)
    const logs=await result<NextOffer[]>(await call(`journeys/${j.id}/offers`));expect(logs[0].price).toBe('500000')
    store.sqlite.exec("UPDATE transaction_offers SET status='withdrawn'")
    const external=await result<NextJourney>(await call(`journeys/${j.id}`));expect(external.document.phases.flatMap(p=>p.milestones.flatMap(m=>m.outcomes)).find(o=>o.gateway)?.done).toBe(false)
  })
  it('cannot link another agent’s contacts, a foreign listing, or a locked transaction',async()=>{
    const j=await create();j.document.contactIds=['c3']
    expect((await call(`journeys/${j.id}`,'PUT',{revision:1,document:j.document})).status).toBe(403)
    j.document.contactIds=[];j.document.listingId='foreign'
    expect((await call(`journeys/${j.id}`,'PUT',{revision:1,document:j.document})).status).toBe(403)
    j.document.listingId='listing';j.document.transactionId='tx';store.sqlite.exec('UPDATE transactions SET is_locked=1')
    expect((await call(`journeys/${j.id}`,'PUT',{revision:1,document:j.document})).status).toBe(403)
  })
  it('records comments as the actual actor and rejects unknown outcomes',async()=>{
    const j=await create();const outcomeId=j.document.phases[0].milestones[0].outcomes[0].id
    await result(await call(`journeys/${j.id}/members`,'PUT',{revision:1,userIds:['assistant']}))
    await result(await call(`journeys/${j.id}/comments`,'POST',{outcomeId,body:'Scheduled',userId:'other'},assistant))
    expect(store.sqlite.prepare('SELECT user_id FROM next_comments').get()?.user_id).toBe('assistant')
    expect((await call(`journeys/${j.id}/comments`,'POST',{outcomeId:'missing',body:'No'})).status).toBe(400)
  })
  it('requires explicit journey membership for assistants and allows scoped exports for collaborators',async()=>{
    const j=await create()
    for(const suffix of ['', '/comments'])expect((await call(`journeys/${j.id}${suffix}`,'GET',undefined,assistant)).status).toBe(404)
    expect((await call(`journeys/${j.id}`,'PUT',{revision:1,document:j.document},assistant)).status).toBe(404)
    expect(await result<unknown[]>(await call('journeys','GET',undefined,assistant))).toHaveLength(0)
    let saved=await result<NextJourney>(await call(`journeys/${j.id}/members`,'PUT',{revision:1,userIds:['assistant','other']}))
    expect((await call(`journeys/${j.id}`,'GET',undefined,assistant)).status).toBe(200)
    const exported=await result<{omitted:string[];journeys:{document:unknown;offers:unknown[]}[]}>(await call(`journeys/${j.id}/export`,'GET',undefined,collaborator))
    expect(exported.journeys[0].document).toBeTruthy();expect(exported.journeys[0].offers).toEqual([]);expect(exported.omitted).toHaveLength(1)
    saved=await result<NextJourney>(await call(`journeys/${j.id}/members`,'PUT',{revision:saved.revision,userIds:[]}))
    expect((await call(`journeys/${j.id}`,'GET',undefined,assistant)).status).toBe(404)
  })
  it('resets only the selected checklist and preserves logs, links, and prior revisions',async()=>{
    const j=await create(),other=await create()
    let saved=await result<NextJourney>(await call(`journeys/${j.id}/offers`,'POST',{revision:1,record:offer}))
    saved.document.phases[0].milestones=[]
    saved=await result<NextJourney>(await call(`journeys/${j.id}`,'PUT',{revision:saved.revision,document:saved.document}))
    expect((await call(`journeys/${j.id}/reset`,'POST',{revision:saved.revision,confirmName:'wrong'})).status).toBe(400)
    const reset=await result<NextJourney>(await call(`journeys/${j.id}/reset`,'POST',{revision:saved.revision,confirmName:'Home sale'}))
    expect(nextProgress(reset.document.phases).total).toBe(182)
    expect(await result<unknown[]>(await call(`journeys/${j.id}/offers`))).toHaveLength(1)
    expect((await result<NextJourney>(await call(`journeys/${other.id}`))).revision).toBe(1)
  })
})
describe('Related contacts',()=>{
  it('creates a reciprocal relationship without duplicating either person',async()=>{
    await result(await relation('POST',{relatedContactId:'c2',relationship:'Parent',note:'Primary contact'}))
    expect((await result<{relationship:string}[]>(await relation('GET')))[0].relationship).toBe('Parent')
    expect((await result<{relationship:string}[]>(await relation('GET',undefined,'c2')))[0].relationship).toBe('Child')
    await result(await relation('POST',{relatedContactId:'c1',relationship:'Child',note:'Updated'},'c2'))
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM contact_relationships').get()?.n).toBe(1)
    expect(store.sqlite.prepare('SELECT COUNT(*) AS n FROM contacts').get()?.n).toBe(3)
  })
  it('does not expose another agent’s contact through relationships',async()=>{
    expect((await relation('POST',{relatedContactId:'c3',relationship:'Friend'})).status).toBe(400)
    expect((await relation('GET',undefined,'c1',collaborator)).status).toBe(404)
    expect((await relation('POST',{relatedContactId:'c1',relationship:'Spouse'})).status).toBe(400)
  })
})
