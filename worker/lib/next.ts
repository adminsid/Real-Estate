import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { nextProgress, newSellerJourney, validateNextDocument, validateNextOffers, validateNextShowings, validNextId,
  type NextDocument, type NextMember, type NextOffer, type NextShowing } from '../../src/domain/next'

export interface NextActor { userId: string; tenantId: string; role: string; principalId?: string; canWrite: boolean; canTransactions: boolean }
interface Row { id: string; owner_id: string; document: string; revision: number; created_at: string; updated_at: string; commandId?: string }
const manager = (a: NextActor) => ['admin','broker'].includes(a.role)
const principal = (a: NextActor) => a.principalId || a.userId
const ok = (data: unknown, status = 200) => Response.json({ success: true, data }, { status })
const fail = (error: string, status = 400) => Response.json({ success: false, error }, { status })
const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const clean = (x: unknown, max = 500) => typeof x === 'string' ? x.trim().slice(0,max) : ''
const management = (a: NextActor, row: Row) => manager(a) || (row.owner_id === a.userId && a.role !== 'assistant')
function scope(a: NextActor) {
  if (manager(a)) return { sql: '', args: [] as string[] }
  // Delegation remains bounded by the assistant's active principal and contacts scope.
  if (a.role === 'assistant') return { sql: ' AND j.owner_id=? AND EXISTS(SELECT 1 FROM next_journey_members m WHERE m.journey_id=j.id AND m.user_id=?)', args: [principal(a),a.userId] }
  return { sql: ' AND (j.owner_id=? OR EXISTS(SELECT 1 FROM next_journey_members m WHERE m.journey_id=j.id AND m.user_id=?))', args: [a.userId,a.userId] }
}
async function find(db: D1Database, a: NextActor, id: string) {
  const s = scope(a)
  return db.prepare(`SELECT j.* FROM next_journeys j WHERE j.tenant_id=? AND j.id=?${s.sql}`).bind(a.tenantId,id,...s.args).first<Row>()
}
async function members(db: D1Database, a: NextActor, row: Row): Promise<NextMember[]> {
  const result = await db.prepare(`SELECT u.id,u.name,u.role FROM users u WHERE u.tenant_id=? AND u.is_active=1
    AND (u.id=? OR EXISTS(SELECT 1 FROM next_journey_members m WHERE m.journey_id=? AND m.user_id=u.id))
    AND (u.role!='assistant' OR EXISTS(SELECT 1 FROM assistant_assignments aa WHERE aa.tenant_id=u.tenant_id
      AND aa.assistant_id=u.id AND aa.principal_id=? AND aa.status='active' AND aa.can_access_contacts=1
      AND (aa.expires_at IS NULL OR datetime(aa.expires_at)>datetime('now')))) ORDER BY u.name`)
    .bind(a.tenantId,row.owner_id,row.id,row.owner_id).all<NextMember>()
  return result.results
}
async function syncGateway(db:D1Database,a:NextActor,row:Row,doc:NextDocument) {
  const accepted=doc.transactionId
    ? await db.prepare("SELECT id FROM transaction_offers WHERE tenant_id=? AND transaction_id=? AND lower(status)='accepted' LIMIT 1").bind(a.tenantId,doc.transactionId).first()
    : await db.prepare("SELECT id FROM next_offer_drafts WHERE journey_id=? AND json_extract(payload,'$.status')='Accepted' LIMIT 1").bind(row.id).first()
  for(const p of doc.phases)for(const m of p.milestones)for(const o of m.outcomes)if(o.gateway)o.done=!!accepted
}
async function journey(db: D1Database, a: NextActor, row: Row) {
  const document:NextDocument=JSON.parse(row.document);await syncGateway(db,a,row,document)
  return { id: row.id, ownerId: row.owner_id, document, revision: row.revision,
    createdAt: row.created_at, updatedAt: row.updated_at, members: await members(db,a,row), canManage: management(a,row), canWrite: a.canWrite }
}
async function contactAllowed(db: D1Database, a: NextActor, id: string) {
  return db.prepare(`SELECT id FROM contacts WHERE id=? AND tenant_id=? AND is_active=1${manager(a) ? '' : ' AND assigned_to=?'}`)
    .bind(id,a.tenantId,...(manager(a) ? [] : [principal(a)])).first()
}
async function transactionAllowed(db: D1Database, a: NextActor, id: string, write = false) {
  if (!a.canTransactions) return null
  const row = await db.prepare(`SELECT id,inventory_listing_id,is_locked FROM transactions WHERE id=? AND tenant_id=? AND is_active=1${manager(a) ? '' : ' AND assigned_to=?'}`)
    .bind(id,a.tenantId,...(manager(a) ? [] : [principal(a)])).first<{ id: string; inventory_listing_id: string | null; is_locked: number }>()
  return row && (!write || !row.is_locked || manager(a)) ? row : null
}
async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new Error('Expected JSON')
  // Bound streamed input even when Content-Length is absent or false.
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing request body')
  const chunks: Uint8Array[] = []; let length = 0
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength
    if (length > 1000000) { await reader.cancel(); throw new Error('Request is too large') }; chunks.push(value) }
  const data = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { data.set(chunk,offset); offset += chunk.length }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(data))
  if (!obj(parsed)) throw new Error('Expected a JSON object')
  return parsed
}
function revisionWrite(db: D1Database, a: NextActor, row: Row, doc: NextDocument) {
  return db.prepare(`UPDATE next_journeys SET document=?,revision=revision+1,updated_by=?,last_command_id=?,updated_at=datetime('now')
    WHERE id=? AND tenant_id=? AND revision=?`).bind(JSON.stringify(doc),a.userId,row.commandId, row.id,a.tenantId,row.revision)
}
// Guard dependent writes with the winning revision and actor. D1 batches run atomically.
const guard = 'EXISTS(SELECT 1 FROM next_journeys WHERE id=? AND revision=? AND last_command_id=?)'
const guardArgs = (_a: NextActor, row: Row) => [row.id,row.revision+1,row.commandId!]
async function commit(db: D1Database, a: NextActor, row: Row, doc: NextDocument, extra: D1PreparedStatement[] = []) {
  const results = await db.batch([revisionWrite(db,a,row,doc),...extra])
  return results[0].meta.changes === 1
}
async function offers(db: D1Database, a: NextActor, row: Row, doc: NextDocument): Promise<NextOffer[]> {
  if (!doc.transactionId) return (await db.prepare('SELECT payload FROM next_offer_drafts WHERE journey_id=?').bind(row.id).all<{ payload:string }>()).results.map(r => JSON.parse(r.payload))
  if (!await transactionAllowed(db,a,doc.transactionId)) throw new Error('Transaction access is required to view offers')
  const rows = await db.prepare('SELECT * FROM transaction_offers WHERE tenant_id=? AND transaction_id=? ORDER BY created_at').bind(a.tenantId,doc.transactionId)
    .all<{ id:string; offer_date:string; purchaser_name:string; purchase_price:number; status:string; details_json:string }>()
  return rows.results.map(r => { const d = JSON.parse(r.details_json)
    const status = ({pending:'Received',accepted:'Accepted',rejected:'Rejected',countered:'Countered',withdrawn:'Withdrawn',presented:'Presented to Seller'} as Record<string,string>)[r.status.toLowerCase()] || 'Received'
    return { id:r.id,date:r.offer_date,buyer:r.purchaser_name,price:String(r.purchase_price),agent:d.nextAgent || '',terms:d.nextTerms || '',notes:d.nextNotes || '',status }
  })
}
function offerInsert(db: D1Database, a: NextActor, row: Row, doc: NextDocument, o: NextOffer): D1PreparedStatement {
  if (!doc.transactionId) return db.prepare(`INSERT INTO next_offer_drafts(id,journey_id,payload) SELECT ?,?,? WHERE ${guard}`)
    .bind(o.id,row.id,JSON.stringify(o),...guardArgs(a,row))
  return db.prepare(`INSERT INTO transaction_offers(id,transaction_id,tenant_id,purchaser_name,purchase_price,offer_date,status,details_json)
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(o.id,doc.transactionId,a.tenantId,o.buyer,Number(o.price.replace(/[$,\s]/g,'')),o.date,
      o.status === 'Presented to Seller' ? 'presented' : o.status.toLowerCase(),JSON.stringify({id:o.id,purchaserName:o.buyer,purchasePrice:o.price,offerDate:o.date,nextAgent:o.agent,nextTerms:o.terms,nextNotes:o.notes}),...guardArgs(a,row))
}
function showingInsert(db: D1Database, a: NextActor, row: Row, doc: NextDocument, s: NextShowing): D1PreparedStatement {
  if (!doc.listingId) return db.prepare(`INSERT INTO next_showing_drafts(id,journey_id,payload) SELECT ?,?,? WHERE ${guard}`)
    .bind(s.id,row.id,JSON.stringify(s),...guardArgs(a,row))
  return db.prepare(`INSERT INTO showings(id,tenant_id,listing_id,agent_id,buyer_name,shown_at,feedback,status,next_details,next_journey_id)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(s.id,a.tenantId,doc.listingId,row.owner_id,s.contact || 'Not provided',new Date(s.time).toISOString(),s.feedback,
    Date.parse(s.time)>Date.now() ? 'scheduled' : 'completed',JSON.stringify(s),row.id,...guardArgs(a,row))
}
async function showings(db: D1Database, a: NextActor, row: Row, doc: NextDocument): Promise<NextShowing[]> {
  if (!doc.listingId) return (await db.prepare('SELECT payload FROM next_showing_drafts WHERE journey_id=?').bind(row.id).all<{payload:string}>()).results.map(r => JSON.parse(r.payload))
  const rows = await db.prepare(`SELECT s.*,u.name AS agent_name FROM showings s LEFT JOIN users u ON u.id=s.agent_id AND u.tenant_id=s.tenant_id
    WHERE s.tenant_id=? AND s.listing_id=? AND (s.next_journey_id=? OR s.agent_id=?) ORDER BY s.shown_at`)
    .bind(a.tenantId,doc.listingId,row.id,row.owner_id).all<{id:string;shown_at:string;feedback:string;buyer_name:string;agent_name:string;next_details:string|null}>()
  return rows.results.map(s => { const detail = s.next_details ? JSON.parse(s.next_details) : {}
    return {id:s.id,time:s.shown_at,type:detail.type || 'Private showing',agent:detail.agent || s.agent_name || '',contact:detail.contact || s.buyer_name || '',feedback:s.feedback || '',followUp:detail.followUp || 'New'}
  })
}

export async function handleNext(request: Request, db: D1Database, a: NextActor, getListing: (id: string) => Promise<boolean>): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method
  if (!['GET','HEAD'].includes(method)) {
    if (!a.canWrite) return fail('No write access',403)
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return fail('Invalid origin',403)
  }
  try {
    if (path === '/api/next/options' && method === 'GET') {
      const q = `%${(url.searchParams.get('q') || '').slice(0,100)}%`
      const [contacts, transactions, users] = await Promise.all([
        db.prepare(`SELECT id,first_name||' '||last_name AS name FROM contacts WHERE tenant_id=? AND is_active=1
          AND (first_name||' '||last_name LIKE ? OR email LIKE ?)${manager(a) ? '' : ' AND assigned_to=?'} ORDER BY first_name LIMIT 50`)
          .bind(a.tenantId,q,q,...(manager(a) ? [] : [principal(a)])).all(),
        a.canTransactions ? db.prepare(`SELECT id,name,inventory_listing_id AS listingId FROM transactions WHERE tenant_id=? AND is_active=1
          AND name LIKE ?${manager(a) ? '' : ' AND assigned_to=?'} ORDER BY updated_at DESC LIMIT 50`).bind(a.tenantId,q,...(manager(a) ? [] : [principal(a)])).all() : Promise.resolve({results:[]}),
        db.prepare(`SELECT id,name,role FROM users WHERE tenant_id=? AND is_active=1 AND role IN ('admin','broker','agent','salesperson','assistant','tc') ORDER BY name LIMIT 500`).bind(a.tenantId).all(),
      ])
      return ok({contacts:contacts.results,transactions:transactions.results,users:users.results})
    }
    if (path === '/api/next/journeys' && method === 'GET') {
      const s = scope(a), args: string[] = [a.tenantId,...s.args]; let filter = ''
      for (const key of ['listingId','transactionId'] as const) if (url.searchParams.get(key)) { filter += ` AND json_extract(j.document,'$.${key}')=?`; args.push(url.searchParams.get(key)!) }
      if (url.searchParams.get('contactId')) { filter += " AND EXISTS(SELECT 1 FROM json_each(j.document,'$.contactIds') c WHERE c.value=?)"; args.push(url.searchParams.get('contactId')!) }
      const rows = await db.prepare(`SELECT j.* FROM next_journeys j WHERE j.tenant_id=?${s.sql}${filter} ORDER BY j.updated_at DESC LIMIT 200`).bind(...args).all<Row>()
      return ok(rows.results.map(r => { const d:NextDocument=JSON.parse(r.document); return {id:r.id,name:d.name,...nextProgress(d.phases),updatedAt:r.updated_at} }))
    }
    if (path === '/api/next/assignments' && method === 'GET') {
      const s = scope(a)
      const rows = await db.prepare(`SELECT j.id,json_extract(j.document,'$.name') AS name,j.revision,p.value AS phase,m.value AS milestone,o.value AS outcome
        FROM next_journeys j,json_each(j.document,'$.phases') p,json_each(p.value,'$.milestones') m,json_each(m.value,'$.outcomes') o
        WHERE j.tenant_id=?${s.sql} AND json_extract(o.value,'$.assigneeId')=? AND json_extract(o.value,'$.done')=0
        AND COALESCE(json_extract(o.value,'$.notApplicable'),'')='' ORDER BY COALESCE(NULLIF(json_extract(o.value,'$.dueDate'),''),'9999') LIMIT 100`)
        .bind(a.tenantId,...s.args,a.userId).all<{id:string;name:string;revision:number;phase:string;milestone:string;outcome:string}>()
      return ok(rows.results.map(r => ({journeyId:r.id,journeyName:r.name,revision:r.revision,phaseId:JSON.parse(r.phase).id,milestoneId:JSON.parse(r.milestone).id,outcome:JSON.parse(r.outcome)})))
    }
    if (path === '/api/next/journeys' && method === 'POST') {
      const body = await readBody(request); const doc = body.document ?? newSellerJourney(clean(body.name,200),body.seeded !== false)
      validateNextDocument(doc)
      for (const id of doc.contactIds) if (!await contactAllowed(db,a,id)) return fail('Contact is not accessible',403)
      if (doc.listingId && !await getListing(doc.listingId)) return fail('Listing is not accessible',403)
      if (doc.transactionId) {
        const tx=await transactionAllowed(db,a,doc.transactionId,true)
        if(!tx)return fail('Transaction is not accessible or is locked',403)
        if(tx.inventory_listing_id&&doc.listingId!==tx.inventory_listing_id)return fail('Choose the transaction’s linked listing')
      }
      if (doc.phases.some(p => p.milestones.some(m => m.outcomes.some(o => o.assigneeId && o.assigneeId !== principal(a))))) return fail('Add team members before assigning outcomes')
      const id = crypto.randomUUID()
      for(const p of doc.phases)for(const m of p.milestones)for(const o of m.outcomes)if(o.gateway)o.done=false
      const inserts=[db.prepare('INSERT INTO next_journeys(id,tenant_id,owner_id,document,updated_by) VALUES(?,?,?,?,?)')
        .bind(id,a.tenantId,principal(a),JSON.stringify(doc),a.userId)]
      if(a.role==='assistant')inserts.push(db.prepare('INSERT INTO next_journey_members(journey_id,user_id) VALUES(?,?)').bind(id,a.userId))
      await db.batch(inserts)
      const row = await find(db,a,id); return ok(await journey(db,a,row!),201)
    }
    const match = path.match(/^\/api\/next\/journeys\/([\w-]+)(?:\/(members|comments|offers|showings|reset|export))?$/)
    if (!match) return fail('Not found',404)
    const row = await find(db,a,match[1]); if (!row) return fail('Journey not found',404)
    row.commandId=crypto.randomUUID()
    const doc:NextDocument = JSON.parse(row.document), action = match[2]
    await syncGateway(db,a,row,doc)
    if (!action && method === 'GET') return ok(await journey(db,a,row))
    if(action==='export'&&method==='GET'){
      const canReadLogs=(management(a,row)||principal(a)===row.owner_id)
      const canReadOffers=canReadLogs&&(!doc.transactionId||!!await transactionAllowed(db,a,doc.transactionId))
      return ok({version:1,journeys:[{document:doc,offers:canReadOffers?await offers(db,a,row,doc):[],showings:canReadLogs?await showings(db,a,row,doc):[]}],
        omitted:canReadOffers&&canReadLogs?[]:['Restricted business records']})
    }
    if (action === 'comments' && method === 'GET') return ok((await db.prepare(`SELECT c.id,c.outcome_id,c.body,c.created_at,u.name AS user_name
      FROM next_comments c JOIN users u ON u.id=c.user_id WHERE c.journey_id=? ORDER BY c.created_at,c.id LIMIT 1000`).bind(row.id).all()).results)
    if (action === 'comments' && method === 'POST') {
      const body = await readBody(request), text = clean(body.body,5000), outcomeId = clean(body.outcomeId,100)
      if (!text || !doc.phases.some(p => p.milestones.some(m => m.outcomes.some(o => o.id === outcomeId)))) return fail('Choose an outcome and write a comment')
      await db.prepare('INSERT INTO next_comments(id,journey_id,outcome_id,user_id,body) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),row.id,outcomeId,a.userId,text).run()
      return ok({saved:true})
    }
    if ((action==='offers'||action==='showings') && !management(a,row) && principal(a)!==row.owner_id) return fail('Business logs require the journey owner’s record access',403)
    if (action === 'offers' && method === 'GET') return ok(await offers(db,a,row,doc))
    if (action === 'showings' && method === 'GET') return ok(await showings(db,a,row,doc))
    const body = await readBody(request)
    if (body.revision !== row.revision) return fail('Someone changed this journey. Reload the latest version before saving your edits.',409)
    if (action === 'members' && method === 'PUT') {
      if (!management(a,row)) return fail('Only the journey owner or broker can manage the team',403)
      if (!Array.isArray(body.userIds) || body.userIds.length>30 || !body.userIds.every(validNextId)) return fail('Invalid team')
      const ids = [...new Set(body.userIds.filter(id => id !== row.owner_id))]
      for (const id of ids) {
        const user = await db.prepare(`SELECT id,role FROM users WHERE id=? AND tenant_id=? AND is_active=1 AND role IN ('admin','broker','agent','salesperson','assistant','tc')`).bind(id,a.tenantId).first<{id:string;role:string}>()
        if (!user) return fail('Team member is not available',403)
        if (user.role === 'assistant') {
          const assignment = await db.prepare(`SELECT id FROM assistant_assignments WHERE tenant_id=? AND assistant_id=? AND principal_id=? AND status='active'
            AND can_access_contacts=1 AND (expires_at IS NULL OR datetime(expires_at)>datetime('now'))`).bind(a.tenantId,id,row.owner_id).first()
          if (!assignment) return fail('Assistant must have an active contacts assignment to the journey owner',403)
        }
      }
      for (const p of doc.phases) for (const m of p.milestones) for (const o of m.outcomes) if (o.assigneeId && o.assigneeId!==row.owner_id && !ids.includes(o.assigneeId)) o.assigneeId=''
      const extra = [db.prepare(`DELETE FROM next_journey_members WHERE journey_id=? AND ${guard}`).bind(row.id,...guardArgs(a,row)),
        ...ids.map(id => db.prepare(`INSERT INTO next_journey_members(journey_id,user_id) SELECT ?,? WHERE ${guard}`).bind(row.id,id,...guardArgs(a,row)))]
      if (!await commit(db,a,row,doc,extra)) return fail('Journey changed; reload before saving',409)
    } else if (!action && method === 'PUT') {
      const next = body.document; validateNextDocument(next)
      const linksChanged = JSON.stringify(next.contactIds)!==JSON.stringify(doc.contactIds) || next.listingId!==doc.listingId || next.transactionId!==doc.transactionId
      if (linksChanged && !management(a,row)) return fail('Only the journey owner or broker can change linked records',403)
      // Established business links cannot be silently moved to another record.
      if ((doc.listingId && next.listingId!==doc.listingId) || (doc.transactionId && next.transactionId!==doc.transactionId)) return fail('Existing listing and transaction links cannot be replaced')
      if (linksChanged) {
        for (const id of next.contactIds) if (!await contactAllowed(db,a,id)) return fail('Contact is not accessible',403)
        if (next.listingId && !await getListing(next.listingId)) return fail('Listing is not accessible',403)
        if (next.transactionId) {
          const tx = await transactionAllowed(db,a,next.transactionId,true)
          if (!tx) return fail('Transaction is not accessible or is locked',403)
          if (tx.inventory_listing_id && next.listingId !== tx.inventory_listing_id) return fail('Choose the transaction’s linked listing')
        }
      }
      const allowed = (await members(db,a,row)).map(m => m.id)
      for (const p of next.phases) for (const m of p.milestones) for (const o of m.outcomes) if (o.assigneeId && !allowed.includes(o.assigneeId)) return fail('Assign outcomes to a current journey team member')
      const oldGate = doc.phases.flatMap(p=>p.milestones.flatMap(m=>m.outcomes)).find(o=>o.gateway)
      const gates = next.phases.flatMap(p=>p.milestones.flatMap(m=>m.outcomes)).filter(o=>o.gateway)
      if (oldGate && (gates.length!==1 || gates[0].id!==oldGate.id)) return fail('The offer acceptance milestone must be preserved')
      if (gates.some(o=>o.done) && !oldGate?.done && !(await offers(db,a,row,doc)).some(o=>o.status==='Accepted')) return fail('Record an accepted offer in Offers before completing this outcome')
      if(oldGate)for(const o of gates)o.done=oldGate.done
      if(oldGate&&!oldGate.done){
        const before=new Map(doc.phases.slice(2).flatMap(p=>p.milestones.flatMap(m=>m.outcomes)).map(o=>[o.id,o.done]))
        if(next.phases.slice(2).some(p=>p.milestones.some(m=>m.outcomes.some(o=>o.done&&!before.get(o.id)))))return fail('Record an accepted offer before completing Contract or Closing outcomes')
      }
      const extra:D1PreparedStatement[]=[]
      if (next.transactionId && !doc.transactionId) {
        for (const o of await offers(db,a,row,doc)) extra.push(offerInsert(db,a,row,next,o))
        extra.push(db.prepare(`DELETE FROM next_offer_drafts WHERE journey_id=? AND ${guard}`).bind(row.id,...guardArgs(a,row)))
      }
      if (next.listingId && !doc.listingId) {
        for (const s of await showings(db,a,row,doc)) extra.push(showingInsert(db,a,row,next,s))
        extra.push(db.prepare(`DELETE FROM next_showing_drafts WHERE journey_id=? AND ${guard}`).bind(row.id,...guardArgs(a,row)))
      }
      if (!await commit(db,a,row,next,extra)) return fail('Journey changed; reload before saving',409)
    } else if (action === 'reset' && method === 'POST') {
      if (!management(a,row)) return fail('Only the journey owner or broker can reset a journey',403)
      if (body.confirmName !== doc.name) return fail('Type the journey name to confirm reset')
      const fresh = {...doc, phases:newSellerJourney(doc.name).phases,templateVersion:'seller-v1'}
      if (!await commit(db,a,row,fresh)) return fail('Journey changed; reload before resetting',409)
    } else if ((action === 'offers' || action === 'showings') && ['POST','PUT','DELETE'].includes(method)) {
      // Financial and showing records retain the owning record's access, independent of team membership.
      if (!management(a,row) && principal(a)!==row.owner_id) return fail('Only the owner or their delegated assistant can edit business records',403)
      const id = clean(body.id,100), extra:D1PreparedStatement[]=[]
      if (action === 'offers') {
        if (doc.transactionId && !await transactionAllowed(db,a,doc.transactionId,true)) return fail('Transaction is not accessible or is locked',403)
        const list = await offers(db,a,row,doc)
        const existing=list.find(o=>o.id===id)
        if (method!=='POST' && !existing) return fail('Offer not found',404)
        const record = method==='DELETE' ? null : validateNextOffers([{...(obj(body.record)?body.record:{}),id:method==='POST'?crypto.randomUUID():id}])[0]
        if (existing) {
          if (doc.transactionId) {
            if (record) {
              extra.push(db.prepare(`UPDATE transaction_offers SET purchaser_name=?,purchase_price=?,offer_date=?,status=?,
                details_json=json_set(details_json,'$.purchaserName',?,'$.purchasePrice',?,'$.offerDate',?,'$.nextAgent',?,'$.nextTerms',?,'$.nextNotes',?),updated_at=datetime('now')
                WHERE id=? AND tenant_id=? AND transaction_id=? AND ${guard}`).bind(record.buyer,Number(record.price.replace(/[$,\s]/g,'')),record.date,record.status==='Presented to Seller'?'presented':record.status.toLowerCase(),
                record.buyer,record.price,record.date,record.agent,record.terms,record.notes,id,a.tenantId,doc.transactionId,...guardArgs(a,row)))
            } else extra.push(db.prepare(`DELETE FROM transaction_offers WHERE id=? AND tenant_id=? AND transaction_id=? AND ${guard}`).bind(id,a.tenantId,doc.transactionId,...guardArgs(a,row)))
          } else {
            extra.push(db.prepare(`DELETE FROM next_offer_drafts WHERE id=? AND journey_id=? AND ${guard}`).bind(id,row.id,...guardArgs(a,row)))
            if(record) extra.push(offerInsert(db,a,row,doc,record))
          }
        } else if(record) extra.push(offerInsert(db,a,row,doc,record))
        const accepted = [...list.filter(o=>o.id!==id),...(record?[record]:[])].some(o=>o.status==='Accepted')
        for (const p of doc.phases) for (const m of p.milestones) for (const o of m.outcomes) if(o.gateway) o.done=accepted
      } else {
        const list=await showings(db,a,row,doc), existing=list.find(s=>s.id===id)
        if(method!=='POST'&&!existing) return fail('Showing not found',404)
        const record=method==='DELETE'?null:validateNextShowings([{...(obj(body.record)?body.record:{}),id:method==='POST'?crypto.randomUUID():id}])[0]
        if(existing) {
          if(doc.listingId) {
            if(record) extra.push(db.prepare(`UPDATE showings SET shown_at=?,feedback=?,next_details=?,buyer_name=?,status=CASE WHEN status IN ('scheduled','completed') THEN ? ELSE status END WHERE id=? AND tenant_id=? AND listing_id=? AND (agent_id=? OR next_journey_id=?) AND ${guard}`)
              .bind(new Date(record.time).toISOString(),record.feedback,JSON.stringify(record),record.contact,Date.parse(record.time)>Date.now()?'scheduled':'completed',id,a.tenantId,doc.listingId,row.owner_id,row.id,...guardArgs(a,row)))
            else extra.push(db.prepare(`DELETE FROM showings WHERE id=? AND tenant_id=? AND listing_id=? AND (agent_id=? OR next_journey_id=?) AND ${guard}`).bind(id,a.tenantId,doc.listingId,row.owner_id,row.id,...guardArgs(a,row)))
          } else {
            extra.push(db.prepare(`DELETE FROM next_showing_drafts WHERE id=? AND journey_id=? AND ${guard}`).bind(id,row.id,...guardArgs(a,row)))
            if(record) extra.push(showingInsert(db,a,row,doc,record))
          }
        } else if(record) extra.push(showingInsert(db,a,row,doc,record))
      }
      if(!await commit(db,a,row,doc,extra)) return fail('Journey changed; reload before saving',409)
    } else return fail('Method not allowed',405)
    return ok(await journey(db,a,(await find(db,a,row.id))!))
  } catch(error) {
    if(error instanceof SyntaxError) return fail('Invalid JSON')
    // Validation errors carry no database details. Infrastructure errors reach the gateway logger.
    if(error instanceof Error && !/D1|SQL|constraint|database/i.test(error.message)) return fail(error.message)
    throw error
  }
}

const relations = ['Spouse','Parent','Child','Sibling','Relative','Friend','Co-buyer','Co-seller','Referral source','Referred contact','Other']
const inverse = (type:string) => type==='Parent'?'Child':type==='Child'?'Parent':type==='Referral source'?'Referred contact':type==='Referred contact'?'Referral source':type
export async function handleContactRelationships(request:Request,db:D1Database,a:NextActor):Promise<Response> {
  const url=new URL(request.url),contactId=url.searchParams.get('contactId') || ''
  if(!validNextId(contactId)||!await contactAllowed(db,a,contactId)) return fail('Contact not found',404)
  if(request.method==='GET') {
    const rows=await db.prepare(`SELECT r.*,c.id AS other_id,c.first_name||' '||c.last_name AS name,c.email,c.phone
      FROM contact_relationships r JOIN contacts c ON c.id=CASE WHEN r.contact_id=? THEN r.related_contact_id ELSE r.contact_id END AND c.tenant_id=r.tenant_id
      WHERE r.tenant_id=? AND (r.contact_id=? OR r.related_contact_id=?) AND c.is_active=1${manager(a)?'':' AND c.assigned_to=?'} ORDER BY name`)
      .bind(contactId,a.tenantId,contactId,contactId,...(manager(a)?[]:[principal(a)])).all<{id:string;contact_id:string;other_id:string;name:string;email:string;phone:string;relationship:string;note:string}>()
    return ok(rows.results.map(r=>({id:r.id,contactId:r.other_id,name:r.name,email:r.email,phone:r.phone,relationship:r.contact_id===contactId?r.relationship:inverse(r.relationship),note:r.note})))
  }
  if(!a.canWrite) return fail('No write access',403)
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin) return fail('Invalid origin',403)
  try {
    const body=await readBody(request)
    if(request.method==='DELETE') {
      await db.prepare('DELETE FROM contact_relationships WHERE id=? AND tenant_id=? AND (contact_id=? OR related_contact_id=?)').bind(clean(body.id),a.tenantId,contactId,contactId).run()
      return ok({removed:true})
    }
    if(request.method!=='POST') return fail('Method not allowed',405)
    const other=clean(body.relatedContactId,100),type=clean(body.relationship,40),note=clean(body.note,500)
    if(contactId===other||!relations.includes(type)||!await contactAllowed(db,a,other)) return fail('Choose a different accessible contact and a relationship')
    const [first,second]=[contactId,other].sort()
    await db.prepare(`INSERT INTO contact_relationships(id,tenant_id,contact_id,related_contact_id,relationship,note,created_by) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(tenant_id,contact_id,related_contact_id) DO UPDATE SET relationship=excluded.relationship,note=excluded.note,updated_at=datetime('now')`)
      .bind(crypto.randomUUID(),a.tenantId,first,second,first===contactId?type:inverse(type),note,a.userId).run()
    return ok({saved:true})
  } catch(error) { if(error instanceof SyntaxError) return fail('Invalid JSON'); throw error }
}
