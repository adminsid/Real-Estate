import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'

type Actor = { tenantId: string; userId: string; role: string }
type Contact = { id: string; first_name: string; last_name: string; assigned_to: string | null }
type Listing = { id: string; name?: string; address?: string }
const reply = (data: unknown, status = 200) => Response.json(status < 400 ? { success: true, data } : { success: false, ...data as object }, { status })
const problem = (error: string, status = 400) => reply({ error }, status)
const manager = (actor: Actor) => ['admin', 'broker'].includes(actor.role)
const statuses = ['scheduled', 'completed', 'canceled', 'no_show']
const roles = ['buyer', 'renter', 'outside_agent']
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const phoneKey = (value: string) => { const digits = value.replace(/\D/g, ''); return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits }

export async function handleListingInquiries(request: Request, db: D1Database, actor: Actor,
  getListing: (id: string) => Promise<Listing | null>): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const scope = manager(actor) ? '' : ' AND c.assigned_to = ?'
  const scopeArgs = manager(actor) ? [] : [actor.userId]
  if (path === '/api/listing-inquiries' && request.method === 'GET') {
    const conditions = ['i.tenant_id = ?', 'c.is_active = 1', 'i.is_archived = ?']
    const args: (string | number)[] = [actor.tenantId, url.searchParams.get('archived') === '1' ? 1 : 0]
    for (const [param, column] of [['listingId', 'i.listing_id'], ['contactId', 'i.contact_id']] as const) {
      const value = url.searchParams.get(param)
      if (value) { conditions.push(`${column} = ?`); args.push(value) }
    }
    const q = clean(url.searchParams.get('q'))
    if (q) { conditions.push("(c.first_name || ' ' || c.last_name LIKE ? OR c.email LIKE ? OR i.listing_address LIKE ? OR i.listing_id LIKE ?)"); args.push(...Array(4).fill(`%${q}%`)) }
    const page = Math.max(1, Math.min(100000, parseInt(url.searchParams.get('page') || '1', 10) || 1))
    const from = `FROM listing_inquiries i JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id WHERE ${conditions.join(' AND ')}${scope}`
    const [rows, count] = await Promise.all([
      db.prepare(`SELECT i.*, c.first_name,c.last_name,c.email,c.phone,c.lifecycle_stage,c.assigned_to,
        (SELECT MIN(s.shown_at) FROM showings s WHERE s.inquiry_id=i.id AND s.tenant_id=i.tenant_id AND s.status='scheduled' AND julianday(s.shown_at)>=julianday('now')) AS next_showing,
        (SELECT COUNT(*) FROM showings s WHERE s.inquiry_id=i.id AND s.tenant_id=i.tenant_id) AS showing_count
        ${from} ORDER BY i.updated_at DESC,i.id LIMIT 25 OFFSET ?`).bind(...args,...scopeArgs,(page-1)*25).all(),
      db.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...args,...scopeArgs).first<{ total: number }>(),
    ])
    return reply({ inquiries: rows.results, total: count?.total || 0 })
  }
  const inquiryMatch = path.match(/^\/api\/listing-inquiries\/([^/]+)(\/showings)?$/)
  if (inquiryMatch) {
    const inquiry = await db.prepare(`SELECT i.*,c.first_name,c.last_name FROM listing_inquiries i
      JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id
      WHERE i.id=? AND i.tenant_id=? AND c.is_active=1${scope}`)
      .bind(inquiryMatch[1], actor.tenantId, ...scopeArgs).first<{ id: string; contact_id: string; listing_id: string; listing_address: string | null; first_name: string; last_name: string }>()
    if (!inquiry) return problem('Inquiry not found', 404)
    if (inquiryMatch[2] && request.method === 'GET') {
      const rows = await db.prepare('SELECT * FROM showings WHERE tenant_id=? AND inquiry_id=? ORDER BY shown_at DESC').bind(actor.tenantId,inquiry.id).all()
      return reply({ showings: rows.results })
    }
    if (!inquiryMatch[2] && request.method === 'PATCH') {
      const body = await request.json<{ archived: boolean }>()
      if (typeof body.archived !== 'boolean') return problem('archived must be true or false')
      await db.prepare("UPDATE listing_inquiries SET is_archived=?,updated_at=datetime('now') WHERE tenant_id=? AND id=?")
        .bind(body.archived ? 1 : 0,actor.tenantId,inquiry.id).run()
      return reply({ success: true })
    }
  }
  const showingMatch = path.match(/^\/api\/inquiry-showings\/([^/]+)$/)
  if (showingMatch && request.method === 'PATCH') {
    const existing = await db.prepare(`SELECT s.id,s.status,s.shown_at FROM showings s JOIN listing_inquiries i ON i.id=s.inquiry_id AND i.tenant_id=s.tenant_id
      JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id WHERE s.id=? AND s.tenant_id=? AND c.is_active=1${scope}`)
      .bind(showingMatch[1],actor.tenantId,...scopeArgs).first<{ id:string; status:string; shown_at:string }>()
    if (!existing) return problem('Showing not found',404)
    const body = await request.json<{ status?: string; shownAt?: string; feedback?: string }>()
    if (body.status !== undefined && !statuses.includes(body.status)) return problem('Invalid showing status')
    if (body.shownAt !== undefined && !validDate(body.shownAt)) return problem('A valid showing date is required')
    if (body.feedback !== undefined && typeof body.feedback !== 'string') return problem('Invalid feedback')
    if ((body.status || existing.status) === 'completed' && Date.parse(body.shownAt || existing.shown_at) > Date.now()) return problem('A completed showing cannot be in the future')
    const updates: string[] = []; const args: (string | null)[] = []
    if (body.status) { updates.push('status=?'); args.push(body.status) }
    if (body.shownAt) { updates.push('shown_at=?'); args.push(new Date(body.shownAt).toISOString()) }
    if (body.feedback !== undefined) { updates.push('feedback=?'); args.push(body.feedback.trim().slice(0,10000)) }
    if (updates.length) await db.prepare(`UPDATE showings SET ${updates.join(',')} WHERE tenant_id=? AND id=?`).bind(...args,actor.tenantId,showingMatch[1]).run()
    return reply({ success:true })
  }
  if (path !== '/api/listing-inquiries' || request.method !== 'POST') return problem('Not found',404)
  const body = await request.json<Record<string, unknown>>()
  const listingId = clean(body.listingId); const contactId = clean(body.contactId)
  const attendeeRole = clean(body.attendeeRole) || 'buyer'
  const shownAt = clean(body.shownAt); const status = clean(body.status) || 'scheduled'
  const requestId = clean(body.requestId)
  if (!listingId || !roles.includes(attendeeRole)) return problem('Select a listing and attendee role')
  if (shownAt && (!validDate(shownAt) || !statuses.includes(status))) return problem('Invalid showing date or status')
  if (shownAt && status === 'completed' && Date.parse(shownAt) > Date.now()) return problem('A completed showing cannot be in the future')
  if (!requestId || !/^[\w-]{16,80}$/.test(requestId)) return problem('A request ID is required')
  const listing = await getListing(listingId)
  if (!listing || listing.id !== listingId) return problem('Listing not found',404)
  let contact: Contact | null = null
  const statements: D1PreparedStatement[] = []
  if (contactId) {
    contact = await db.prepare('SELECT id,first_name,last_name,assigned_to FROM contacts WHERE tenant_id=? AND id=? AND is_active=1').bind(actor.tenantId,contactId).first<Contact>()
    if (!contact) return problem('Contact not found',404)
  } else {
    const firstName = clean(body.firstName); const lastName = clean(body.lastName)
    const email = clean(body.email).toLowerCase(); const phone = clean(body.phone)
    if (!firstName || (!email && !phone)) return problem('Enter a name and an email or phone, or select an existing contact')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return problem('Enter a valid email')
    if (phone && phoneKey(phone).length < 10) return problem('Enter a valid phone number')
    const matches = await db.prepare(`SELECT id,first_name,last_name,assigned_to FROM contacts WHERE tenant_id=? AND is_active=1
      AND ((?<>'' AND lower(trim(email))=?) OR (?<>'' AND normalized_phone IN (?,?))) LIMIT 3`)
      .bind(actor.tenantId,email,email,phoneKey(phone),phoneKey(phone),phoneKey(phone).length === 10 ? `1${phoneKey(phone)}` : phoneKey(phone)).all<Contact>()
    if (matches.results.length > 1) return problem('Multiple contacts match. Select the correct existing contact.',409)
    contact = matches.results[0] || null
    if (!contact) {
      contact = { id:`con_${actor.tenantId}_${await identityKey(email || phoneKey(phone))}`,first_name:firstName,last_name:lastName,assigned_to:actor.userId }
      statements.push(db.prepare(`INSERT INTO contacts(id,tenant_id,assigned_to,first_name,last_name,email,phone,normalized_phone,type,status,source,lifecycle_stage,qualification_status)
        VALUES(?,?,?,?,?,?,?,?,?,'prospect','listing_inquiry','inquiry','unqualified') ON CONFLICT(id) DO NOTHING`)
        .bind(contact.id,actor.tenantId,actor.userId,firstName,lastName,email || null,phone || null,phoneKey(phone) || null,attendeeRole === 'outside_agent' ? 'other' : 'buyer'))
    }
  }
  if (!manager(actor) && contact.assigned_to !== actor.userId) return problem('This contact belongs to another agent. Ask your broker to connect the inquiry.',403)
  const address = clean(listing.name) || clean(listing.address) || listingId
  // IDs are scoped to the tenant; the unique contact/property key protects repeat visits.
  const inquiryId = `inq_${actor.tenantId}_${contact.id}_${listingId}`
  statements.push(db.prepare(`INSERT INTO listing_inquiries(id,tenant_id,contact_id,listing_id,listing_address,attendee_role)
    SELECT ?,?,?,?,?,? FROM contacts c WHERE c.id=? AND c.tenant_id=? AND c.is_active=1${scope} ON CONFLICT(tenant_id,contact_id,listing_id) DO UPDATE SET
    listing_address=excluded.listing_address,attendee_role=excluded.attendee_role,is_archived=0,updated_at=datetime('now')`)
    .bind(inquiryId,actor.tenantId,contact.id,listingId,address,attendeeRole,contact.id,actor.tenantId,...scopeArgs))
  if (shownAt) statements.push(db.prepare(`INSERT INTO showings(id,tenant_id,listing_id,agent_id,buyer_name,shown_at,feedback,listing_address,inquiry_id,status)
    SELECT ?,?,?,?,?,?,?,?,i.id,? FROM listing_inquiries i JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.contact_id=? AND i.listing_id=? AND c.is_active=1${scope}
    ON CONFLICT(id) DO NOTHING`).bind(`sh_${actor.tenantId}_${requestId}`,actor.tenantId,listingId,actor.userId,
      `${contact.first_name} ${contact.last_name}`.trim(),new Date(shownAt).toISOString(),clean(body.feedback).slice(0,10000) || null,address,status,actor.tenantId,contact.id,listingId,...scopeArgs))
  await db.batch(statements)
  const saved = await db.prepare(`SELECT i.id FROM listing_inquiries i JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.contact_id=? AND i.listing_id=? AND c.is_active=1${scope}`).bind(actor.tenantId,contact.id,listingId,...scopeArgs).first<{id:string}>()
  if (!saved) return problem('Contact changed or belongs to another agent. Select an existing contact.',409)
  return reply({ id:saved?.id, contactId:contact.id,success:true })
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
}

async function identityKey(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('')
}
