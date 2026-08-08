import { D1Database } from '@cloudflare/workers-types'
import { validateStageTransition } from '../../worker/lib/stageGate'


export interface Env {
  DB: D1Database
  INVENTORY_WORKER_URL: string
  INTERNAL_API_SECRET?: string
  OUTCOMES_ROOM: DurableObjectNamespace
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-User-Id, X-Tenant-Id, X-User-Role',
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function err(message: string, status = 400) {
  return json({ success: false, error: message }, status)
}

function ok(data: any) {
  return json({ success: true, data })
}

function newId(): string {
  return crypto.randomUUID()
}

function toRequiredFlag(value: unknown): number {
  if (value === true || value === 1) return 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'required') return 1
  }
  return 0
}

async function createNotification(db: D1Database, tenantId: string, message: string) {
  const id = crypto.randomUUID()
  await db
    .prepare('INSERT INTO notifications (id, tenant_id, message) VALUES (?, ?, ?)')
    .bind(id, tenantId, message)
    .run()
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function splitName(fullName: unknown): { first: string; last: string } | null {
  const normalized = normalizeText(fullName)
  if (!normalized) return null
  const parts = normalized.split(/\s+/)
  const first = parts.shift() || ''
  const last = parts.join(' ') || '-'
  if (!first) return null
  return { first, last }
}

async function upsertContactFromOutline(
  db: D1Database,
  tenantId: string,
  userId: string,
  payload: {
    name: unknown
    email?: unknown
    phone?: unknown
    address?: unknown
    type: string
    note: string
  }
): Promise<string | undefined> {
  const person = splitName(payload.name)
  if (!person) return undefined

  const email = normalizeText(payload.email)
  const phone = normalizeText(payload.phone)
  const address = normalizeText(payload.address)

  let existing: { id: string } | null = null
  if (email) {
    existing = await db
      .prepare('SELECT id FROM contacts WHERE tenant_id = ? AND lower(email) = lower(?) LIMIT 1')
      .bind(tenantId, email)
      .first<{ id: string }>()
  }

  if (!existing) {
    existing = await db
      .prepare('SELECT id FROM contacts WHERE tenant_id = ? AND lower(first_name) = lower(?) AND lower(last_name) = lower(?) LIMIT 1')
      .bind(tenantId, person.first, person.last)
      .first<{ id: string }>()
  }

  if (existing?.id) {
    await db
      .prepare(`
        UPDATE contacts
        SET assigned_to = ?,
            first_name = ?,
            last_name = ?,
            email = COALESCE(?, email),
            phone = COALESCE(?, phone),
            address = COALESCE(?, address),
            type = ?,
            status = 'active',
            source = 'deal_outline',
            notes = ?,
            updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `)
      .bind(userId, person.first, person.last, email, phone, address, payload.type, payload.note, existing.id, tenantId)
      .run()
    return existing.id
  }

  const generatedId = newId()
  await db
    .prepare(`
      INSERT INTO contacts (id, tenant_id, assigned_to, first_name, last_name, email, phone, type, status, source, notes, address, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 'deal_outline', ?, ?, ?)
    `)
    .bind(generatedId, tenantId, userId, person.first, person.last, email, phone, payload.type, payload.note, address, JSON.stringify(['deal_outline']))
    .run()
  return generatedId
}

async function upsertNetworkConnectionFromOutline(
  db: D1Database,
  tenantId: string,
  userId: string,
  payload: {
    name: unknown
    title?: unknown
    company?: unknown
    email?: unknown
    phone?: unknown
    type: string
    note: string
  }
) {
  const name = normalizeText(payload.name)
  if (!name) return

  const email = normalizeText(payload.email)
  const phone = normalizeText(payload.phone)
  const title = normalizeText(payload.title)
  const company = normalizeText(payload.company)

  let existing: { id: string } | null = null
  if (email) {
    existing = await db
      .prepare('SELECT id FROM network_connections WHERE tenant_id = ? AND lower(email) = lower(?) LIMIT 1')
      .bind(tenantId, email)
      .first<{ id: string }>()
  }

  if (!existing) {
    existing = await db
      .prepare('SELECT id FROM network_connections WHERE tenant_id = ? AND lower(name) = lower(?) LIMIT 1')
      .bind(tenantId, name)
      .first<{ id: string }>()
  }

  if (existing?.id) {
    await db
      .prepare(`
        UPDATE network_connections
        SET title = COALESCE(?, title),
            company = COALESCE(?, company),
            email = COALESCE(?, email),
            phone = COALESCE(?, phone),
            type = ?,
            notes = ?
        WHERE id = ? AND tenant_id = ?
      `)
      .bind(title, company, email, phone, payload.type, payload.note, existing.id, tenantId)
      .run()
    return
  }

  await db
    .prepare(`
      INSERT INTO network_connections (id, tenant_id, created_by, name, title, company, email, phone, type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(newId(), tenantId, userId, name, title, company, email, phone, payload.type, payload.note)
    .run()
}

async function syncOutlineToCrmAndNetwork(
  db: D1Database,
  tenantId: string,
  userId: string,
  transactionId: string,
  transactionName: string,
  outline: Record<string, unknown>
) {
  const note = `Synced from deal outline: ${transactionName}`

  const buyerId = await upsertContactFromOutline(db, tenantId, userId, {
    name: outline.buyerName,
    email: outline.buyerEmail,
    phone: outline.buyerPhone,
    address: outline.buyerAddress,
    type: 'buyer',
    note,
  })

  const sellerId = await upsertContactFromOutline(db, tenantId, userId, {
    name: outline.sellerName,
    email: outline.sellerEmail,
    phone: outline.sellerPhone,
    address: outline.sellerAddress,
    type: 'seller',
    note,
  })

  if (buyerId) {
    await db.prepare('DELETE FROM transaction_parties WHERE transaction_id = ? AND role = ?').bind(transactionId, 'buyer').run()
    await db.prepare('INSERT INTO transaction_parties (id, transaction_id, tenant_id, contact_id, role, is_primary) VALUES (?, ?, ?, ?, ?, 1)')
      .bind(crypto.randomUUID(), transactionId, tenantId, buyerId, 'buyer')
      .run()
  }

  if (sellerId) {
    await db.prepare('DELETE FROM transaction_parties WHERE transaction_id = ? AND role = ?').bind(transactionId, 'seller').run()
    await db.prepare('INSERT INTO transaction_parties (id, transaction_id, tenant_id, contact_id, role, is_primary) VALUES (?, ?, ?, ?, ?, 1)')
      .bind(crypto.randomUUID(), transactionId, tenantId, sellerId, 'seller')
      .run()
  }

  await upsertNetworkConnectionFromOutline(db, tenantId, userId, {
    name: outline.buyerAttorneyName,
    title: 'Attorney',
    company: null,
    email: outline.buyerAttorneyEmail,
    phone: outline.buyerAttorneyPhone,
    type: 'attorney',
    note,
  })

  await upsertNetworkConnectionFromOutline(db, tenantId, userId, {
    name: outline.sellerAttorneyName,
    title: 'Attorney',
    company: null,
    email: outline.sellerAttorneyEmail,
    phone: outline.sellerAttorneyPhone,
    type: 'attorney',
    note,
  })
}

// Ensure context headers exist
interface Ctx {
  userId: string
  tenantId: string
  role: string
  // Assistant delegation context (only present when X-User-Role = 'assistant' and gateway resolved assignment)
  isAssistant: boolean
  principalId: string | null
  assignmentId: string | null
  canAccessTransactions: boolean
  canAccessContacts: boolean
}

function getCtx(req: Request): Ctx {
  const userId = req.headers.get('X-User-Id')
  const tenantId = req.headers.get('X-Tenant-Id')
  const role = req.headers.get('X-User-Role')
  if (!userId || !tenantId || !role) throw new Error('Missing auth context')

  const isAssistant = role === 'assistant'
  const principalId = isAssistant ? req.headers.get('X-Internal-Principal-Id') : null
  const assignmentId = isAssistant ? req.headers.get('X-Internal-Assignment-Id') : null
  const canAccessTransactions = isAssistant ? req.headers.get('X-Internal-Can-Transactions') === '1' : true
  const canAccessContacts = isAssistant ? req.headers.get('X-Internal-Can-Contacts') === '1' : true

  if (isAssistant) {
    if (!principalId || !assignmentId) throw new Error('Assistant missing assignment context')
  }

  return { userId, tenantId, role, isAssistant, principalId, assignmentId, canAccessTransactions, canAccessContacts }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS })
    }

    try {
      const url = new URL(request.url)
      const path = url.pathname
      const method = request.method
      const { userId, tenantId, role, isAssistant, principalId, assignmentId, canAccessTransactions, canAccessContacts } = getCtx(request)

      // Assistant scope checks
      if (isAssistant) {
        if (path.startsWith('/api/transactions') && !canAccessTransactions) {
          return err('Forbidden: assistant has no transactions scope', 403)
        }
      }

      // For assistant, use principalId for data ownership; for others, use userId
      const effectiveUserId = isAssistant ? principalId : userId

      // Proxy listings from Inventory app
      if (path === '/api/transactions/listings' && method === 'GET') {
        const fetchUrl = new URL(`${env.INVENTORY_WORKER_URL}/api/projects`)
        fetchUrl.search = url.search
        const res = await fetch(fetchUrl.toString(), {
          headers: {
            'Accept': 'application/json',
            ...(env.INTERNAL_API_SECRET && { 'Authorization': `Bearer ${env.INTERNAL_API_SECRET}` })
          }
        })
        const data = await res.json()
        return ok(data)
      }

      // Journey templates CRUD
      if (path === '/api/transactions/templates' && method === 'GET') {
        const templates = await env.DB
          .prepare('SELECT * FROM transaction_templates WHERE tenant_id = ? ORDER BY name ASC')
          .bind(tenantId)
          .all()
        return ok(templates.results || [])
      }

      if (path === '/api/transactions/templates' && method === 'POST') {
        const body: any = await request.json()
        if (!body.name || !body.type || !body.tasks_json) {
          return err('Missing required fields: name, type, tasks_json', 400)
        }
        const id = newId()
        await env.DB
          .prepare(`
            INSERT INTO transaction_templates (id, tenant_id, name, type, tasks_json)
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(id, tenantId, body.name, body.type, body.tasks_json)
          .run()
        return ok({ id })
      }

      const templateIdMatch = path.match(/^\/api\/transactions\/templates\/([^/]+)$/)
      if (templateIdMatch && method === 'PUT') {
        const templateId = templateIdMatch[1]
        const body: any = await request.json()
        if (!body.name || !body.type || !body.tasks_json) {
          return err('Missing required fields: name, type, tasks_json', 400)
        }
        await env.DB
          .prepare(`
            UPDATE transaction_templates
            SET name = ?, type = ?, tasks_json = ?, updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `)
          .bind(body.name, body.type, body.tasks_json, templateId, tenantId)
          .run()
        return ok({ updated: true })
      }

      if (templateIdMatch && method === 'DELETE') {
        const templateId = templateIdMatch[1]
        await env.DB
          .prepare('DELETE FROM transaction_templates WHERE id = ? AND tenant_id = ?')
          .bind(templateId, tenantId)
          .run()
        return ok({ deleted: true })
      }

      // List transactions
      if (path === '/api/transactions' && method === 'GET') {
        const assignedToFilter = url.searchParams.get('assigned_to') || ''
        const listingIdFilter = url.searchParams.get('inventory_listing_id') || ''
        const user = await env.DB
          .prepare('SELECT email FROM users WHERE id = ?')
          .bind(userId)
          .first<{ email: string }>()
        const userEmail = user?.email?.toLowerCase() || ''

        const agentListingIds = new Set<string>()

        // Auto-sync listings from inventory
        try {
          const fetchUrl = new URL(`${env.INVENTORY_WORKER_URL}/api/projects`)
          const res = await fetch(fetchUrl.toString(), {
            headers: {
              'Accept': 'application/json',
              ...(env.INTERNAL_API_SECRET && { 'Authorization': `Bearer ${env.INTERNAL_API_SECRET}` })
            }
          })
          if (res.ok) {
            const data: any = await res.json()
            const listings = data.listings || data.projects || data.entries || []

            // Build the set of listings where current user is listing or co-listing agent
            listings.forEach((l: any) => {
              const listEmail = (l.listAgentEmail || '').toLowerCase()
              const coListEmail = (l.coListAgentEmail || '').toLowerCase()
              if (userEmail && (listEmail === userEmail || coListEmail === userEmail)) {
                if (l.id) agentListingIds.add(l.id)
              }
            })

            if (listings.length > 0) {
              const existingListings = await env.DB.prepare('SELECT inventory_listing_id FROM transactions WHERE tenant_id = ? AND is_active = 1 AND inventory_listing_id IS NOT NULL').bind(tenantId).all()
              const existingIds = new Set(existingListings.results.map((r: any) => r.inventory_listing_id))

              // Only auto-sync new listings that belong to this agent
              const newTransactions = listings.filter((l: any) => l.id && agentListingIds.has(l.id) && !existingIds.has(l.id))
              if (newTransactions.length > 0) {
                const stmt = env.DB.prepare(`
                  INSERT INTO transactions (id, tenant_id, assigned_to, inventory_listing_id, name, type, status, price, commission_amount, target_close_date)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `)

                // Batch insert in chunks of 50 to avoid D1 limits
                for (let i = 0; i < newTransactions.length; i += 50) {
                  const chunk = newTransactions.slice(i, i + 50)
                  const batch = chunk.map((l: any) => {
                    let dealStatus = 'active'
                    if (l.status === 'draft') dealStatus = 'lead'
                    if (l.status === 'pending' || l.status === 'under_contract') dealStatus = 'under_contract'
                    if (l.status === 'closed' || l.status === 'sold') dealStatus = 'closed'

                    return stmt.bind(
                      newId(), tenantId, userId, l.id,
                      l.name || 'Untitled Listing',
                      l.propertyType?.toLowerCase().includes('lease') ? 'lease' : 'sale',
                      dealStatus,
                      l.price || null, null, null
                    )
                  })
                  await env.DB.batch(batch)
                }
              }
            }
          }
        } catch (e) {
          console.error('Auto-sync failed', e)
        }

        let query = `
            SELECT t.*,
              (SELECT COUNT(*) FROM transaction_parties tp WHERE tp.transaction_id = t.id) as party_count
            FROM transactions t
            WHERE t.tenant_id = ? AND t.is_active = 1
          `
        const queryParams: Array<string> = [tenantId]
        if (assignedToFilter) {
          if (!['admin', 'broker'].includes(role) && assignedToFilter !== effectiveUserId) {
            return err('Forbidden assigned_to filter', 403)
          }
          query += ' AND t.assigned_to = ?'
          queryParams.push(assignedToFilter)
        }
        if (listingIdFilter) {
          query += ' AND t.inventory_listing_id = ?'
          queryParams.push(listingIdFilter)
        }
        // Assistant: filter to principal's transactions only
        if (isAssistant) {
          query += ' AND t.assigned_to = ?'
          queryParams.push(effectiveUserId)
        }
        query += ' ORDER BY t.created_at DESC'

        const { results } = await env.DB
          .prepare(query)
          .bind(...queryParams)
          .all()

        const teamsRes = await env.DB.prepare('SELECT transaction_id, user_id FROM transaction_team WHERE tenant_id = ?').bind(tenantId).all()
        const userTeams = new Set(teamsRes.results.filter((r: any) => r.user_id === effectiveUserId).map((r: any) => r.transaction_id))

        // Filter the output: keep deals assigned to user, deals where user is in team, inventory listings where current user is agent, or admin/broker
        const filteredResults = results.filter((t: any) => {
          if (role === 'admin' || role === 'broker') return true
          if (effectiveUserId && t.assigned_to === effectiveUserId) return true
          if (userTeams.has(t.id)) return true
          if (t.inventory_listing_id && agentListingIds.has(t.inventory_listing_id)) return true
          return false
        })

        return ok(filteredResults)
      }

      // Bulk import transactions
      if (path === '/api/transactions/import' && method === 'POST') {
        const { transactions } = await request.json<{ transactions: any[] }>()
        if (!transactions || !Array.isArray(transactions)) {
          return err('Missing or invalid transactions array', 400)
        }

        const stmt = env.DB.prepare(`
          INSERT INTO transactions (id, tenant_id, assigned_to, inventory_listing_id, name, type, status, price, commission_amount, target_close_date)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)

        const batch = transactions.map((t: any) => {
          return stmt.bind(
            newId(),
            tenantId,
            userId,
            t.inventory_listing_id || null,
            t.name || 'Imported Deal',
            t.type || 'sale',
            t.status || 'lead',
            t.price ? parseFloat(t.price) : null,
            t.commission_amount ? parseFloat(t.commission_amount) : null,
            t.target_close_date || null
          )
        })

        if (batch.length > 0) {
          await env.DB.batch(batch)
        }

        await createNotification(
          env.DB,
          tenantId,
          `Successfully imported ${batch.length} deals into the workspace`
        )

        return ok({ success: true, count: batch.length })
      }

      // Create transaction
      if (path === '/api/transactions' && method === 'POST') {
        const body: any = await request.json()
        const id = newId()
        const createdByAssistant = isAssistant ? 1 : 0
        await env.DB
          .prepare(`
            INSERT INTO transactions (id, tenant_id, assigned_to, inventory_listing_id, name, type, status, price, commission_amount, target_close_date, created_by_assistant, assistant_assignment_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            id, tenantId, effectiveUserId, body.inventory_listing_id || null,
            body.name, body.type || 'sale', body.status || 'lead',
            body.price || null, body.commission_amount || null, body.target_close_date || null,
            createdByAssistant, isAssistant ? assignmentId : null
          )
          .run()

        // If parties are provided
        if (body.parties && Array.isArray(body.parties) && body.parties.length > 0) {
          const stmt = env.DB.prepare(`
            INSERT INTO transaction_parties (id, transaction_id, tenant_id, contact_id, role, is_primary)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          const batch = body.parties.map((p: any) =>
            stmt.bind(newId(), id, tenantId, p.contact_id, p.role, p.is_primary ? 1 : 0)
          )
          await env.DB.batch(batch)
        }

        // Audit log for delegated creation
        if (isAssistant) {
          const outcomeId = newId()
          await env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, acted_as_assistant_for, assistant_assignment_id, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'))
          `).bind(outcomeId, id, tenantId, userId, `[Delegated Create] Deal created by assistant`, effectiveUserId, assignmentId).run()
        }

        // Trigger notification
        await createNotification(
          env.DB,
          tenantId,
          `New deal "${body.name}" (${body.status || 'lead'}) has been created`
        )

        return ok({ id })
      }

      // Stats
      if (path === '/api/transactions/stats' && method === 'GET') {
        const assignedToFilter = url.searchParams.get('assigned_to') || ''
        let statsQuery = `
            SELECT
              COUNT(*) as total,
              SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) as lead,
              SUM(CASE WHEN status = 'under_contract' THEN 1 ELSE 0 END) as under_contract,
              SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
            FROM transactions
            WHERE tenant_id = ? AND is_active = 1
          `
        const statsParams: Array<string> = [tenantId]

        if (assignedToFilter) {
          if (!['admin', 'broker'].includes(role) && assignedToFilter !== effectiveUserId) {
            return err('Forbidden assigned_to filter', 403)
          }
          statsQuery += ' AND (assigned_to = ? OR id IN (SELECT transaction_id FROM transaction_team WHERE user_id = ?))'
          statsParams.push(assignedToFilter, assignedToFilter)
        } else if (!['admin', 'broker'].includes(role)) {
          statsQuery += ' AND (assigned_to = ? OR id IN (SELECT transaction_id FROM transaction_team WHERE user_id = ?))'
          statsParams.push(effectiveUserId, effectiveUserId)
        }
        // Assistant: always filter to principal's transactions
        if (isAssistant) {
          statsQuery += ' AND assigned_to = ?'
          statsParams.push(effectiveUserId)
        }

        const stats = await env.DB
          .prepare(statsQuery)
          .bind(...statsParams)
          .first()
        return ok(stats || { total: 0, lead: 0, under_contract: 0, closed: 0, active: 0 })
      }

      // Get transaction details (with parties, tasks, and external listing info)
      const txMatch = path.match(/^\/api\/transactions\/([^/]+)$/)
      if (txMatch && method === 'GET') {
        const txId = txMatch[1]

        const tx = await env.DB.prepare('SELECT * FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(txId, tenantId).first()
        if (!tx) return err('Not found', 404)

        // Assistant ownership check
        if (isAssistant && tx.assigned_to !== effectiveUserId) {
          return err('Not found', 404)
        }

        const parties = await env.DB.prepare(`
          SELECT tp.*, c.first_name, c.last_name, c.email, c.phone
          FROM transaction_parties tp
          JOIN contacts c ON c.id = tp.contact_id
          WHERE tp.transaction_id = ?
        `).bind(txId).all()

        const tasks = await env.DB.prepare('SELECT * FROM transaction_tasks WHERE transaction_id = ? ORDER BY sort_order ASC').bind(txId).all()

        const team = await env.DB.prepare(`
          SELECT tt.*, u.name, u.email, u.license_number
          FROM transaction_team tt
          JOIN users u ON u.id = tt.user_id
          WHERE tt.transaction_id = ?
        `).bind(txId).all()

        const mappedTeam = (team.results || []).map((t: any) => {
          const parts = (t.name || '').trim().split(/\s+/)
          const first_name = parts[0] || ''
          const last_name = parts.slice(1).join(' ')
          return { ...t, first_name, last_name }
        })

        let listing = null
        if (tx.inventory_listing_id) {
          try {
            const res = await fetch(`${env.INVENTORY_WORKER_URL}/api/projects/${tx.inventory_listing_id}`, {
              headers: {
                'Accept': 'application/json',
                ...(env.INTERNAL_API_SECRET && { 'Authorization': `Bearer ${env.INTERNAL_API_SECRET}` })
              }
            })
            if (res.ok) {
              const listingData: any = await res.json()
              listing = listingData.project || listingData
            }
          } catch (e) {
            console.error('Failed to fetch listing', e)
          }
        }

        const documents = await env.DB.prepare("SELECT * FROM documents WHERE entity_type IN ('transaction', 'transaction_task') AND tenant_id = ? ORDER BY created_at DESC").bind(tenantId).all()
        const filteredDocs = documents.results.filter((d: any) =>
          (d.entity_type === 'transaction' && d.entity_id === txId) ||
          (d.entity_type === 'transaction_task' && tasks.results.some((t: any) => t.id === d.entity_id))
        )

        const outcomes = await env.DB.prepare(`
          SELECT o.*, u.name, u.avatar_url, u.role
          FROM transaction_outcomes o
          LEFT JOIN users u ON u.id = o.user_id
          WHERE o.transaction_id = ?
          ORDER BY o.created_at ASC
        `).bind(txId).all()

        const mappedOutcomes = (outcomes.results || []).map((o: any) => {
          const parts = (o.name || '').trim().split(/\s+/)
          const first_name = parts[0] || ''
          const last_name = parts.slice(1).join(' ')
          return { ...o, first_name, last_name }
        })

        return ok({
          transaction: tx,
          parties: parties.results,
          tasks: tasks.results,
          team: mappedTeam,
          listing,
          documents: filteredDocs,
          outcomes: mappedOutcomes
        })
      }

      // Export transaction outline as printable PDF / HTML
      const exportPdfMatch = path.match(/^\/api\/transactions\/([^/]+)\/export-pdf$/)
      if (exportPdfMatch && method === 'GET') {
        const txId = exportPdfMatch[1]
        const tx: any = await env.DB.prepare('SELECT * FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(txId, tenantId).first()
        if (!tx) return err('Transaction not found', 404)

        let outline: any = {}
        if (tx.parties_involved) {
          try { outline = JSON.parse(tx.parties_involved) } catch { outline = {} }
        }

        const fmt = (val: any) => (val !== undefined && val !== null && String(val).trim() !== '' ? String(val) : '—')
        const fmtPrice = (val: any) => {
          const n = Number(val)
          return !isNaN(n) && n > 0 ? `$${n.toLocaleString()}` : '—'
        }

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Deal Outline - ${tx.name || 'Summary'}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 24px; font-size: 12px; line-height: 1.4; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
    .title { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
    .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 9999px; font-weight: 700; text-transform: uppercase; font-size: 10px; background: #f1f5f9; color: #334155; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #fafafa; }
    .card-title { font-size: 12px; font-weight: 700; color: #0f172a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .field { margin-bottom: 6px; }
    .label { font-size: 10px; font-weight: 600; color: #64748b; text-transform: uppercase; }
    .value { font-size: 12px; font-weight: 600; color: #0f172a; word-break: break-word; }
    .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; pt-8px; font-size: 10px; color: #94a3b8; text-align: center; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">PRINTABLE DEAL OUTLINE</h1>
      <p class="subtitle">Prime America Real Estate Workspace • Prepared on ${new Date().toLocaleDateString()}</p>
    </div>
    <div style="text-align: right;">
      <span class="badge">${tx.status || 'Active'}</span>
      <span class="badge" style="background:#e0f2fe; color:#0369a1; margin-left:4px;">${tx.type || 'Sale'}</span>
    </div>
  </div>

  <div class="card" style="margin-bottom: 16px;">
    <div class="card-title">Property & Transaction Overview</div>
    <div class="grid-3">
      <div class="field"><div class="label">Property Name / Address</div><div class="value">${fmt(tx.name)}</div></div>
      <div class="field"><div class="label">Target Price</div><div class="value">${fmtPrice(tx.price)}</div></div>
      <div class="field"><div class="label">Commission Amount / Rate</div><div class="value">${tx.commission_amount ? fmtPrice(tx.commission_amount) : tx.commission_rate ? `${tx.commission_rate}%` : '—'}</div></div>
    </div>
    <div class="grid-3">
      <div class="field"><div class="label">Tax Block / Lot</div><div class="value">${fmt(outline.taxBlock)} / ${fmt(outline.taxLot)}</div></div>
      <div class="field"><div class="label">County</div><div class="value">${fmt(outline.county)}</div></div>
      <div class="field"><div class="label">Possession Terms</div><div class="value">${fmt(outline.possessionTerms)}</div></div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Buyers & Sellers</div>
      <div class="field"><div class="label">Buyer(s)</div><div class="value">${fmt(outline.buyerName || (Array.isArray(outline.buyers) ? outline.buyers.map((b:any)=>b.name).join(', ') : ''))}</div></div>
      <div class="field"><div class="label">Buyer Email / Phone</div><div class="value">${fmt(outline.buyerEmail)} ${outline.buyerPhone ? `• ${outline.buyerPhone}` : ''}</div></div>
      <div style="margin-top: 10px;" className="field"><div class="label">Seller(s)</div><div class="value">${fmt(outline.sellerName || (Array.isArray(outline.sellers) ? outline.sellers.map((s:any)=>s.name).join(', ') : ''))}</div></div>
      <div class="field"><div class="label">Seller Email / Phone</div><div class="value">${fmt(outline.sellerEmail)} ${outline.sellerPhone ? `• ${outline.sellerPhone}` : ''}</div></div>
    </div>

    <div class="card">
      <div class="card-title">Representation & Agencies</div>
      <div class="field"><div class="label">Selling Agent / Agency</div><div class="value">${fmt(outline.sellingAgentName)} (${fmt(outline.sellingAgencyName)})</div></div>
      <div class="field"><div class="label">Selling Agent Contact</div><div class="value">${fmt(outline.sellingAgentEmail)} ${outline.sellingAgentCell ? `• ${outline.sellingAgentCell}` : ''}</div></div>
      <div style="margin-top: 10px;" className="field"><div class="label">Listing Agent / Agency</div><div class="value">${fmt(outline.listingAgentName)} (${fmt(outline.listingAgencyName)})</div></div>
      <div class="field"><div class="label">Listing Agent Contact</div><div class="value">${fmt(outline.listingAgentEmail)} ${outline.listingAgentCell ? `• ${outline.listingAgentCell}` : ''}</div></div>
    </div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Attorneys</div>
      <div class="field"><div class="label">Buyer's Attorney</div><div class="value">${fmt(outline.buyerAttorneyName)}</div></div>
      <div class="field"><div class="label">Contact</div><div class="value">${fmt(outline.buyerAttorneyEmail)} ${outline.buyerAttorneyPhone ? `• ${outline.buyerAttorneyPhone}` : ''}</div></div>
      <div style="margin-top: 10px;" className="field"><div class="label">Seller's Attorney</div><div class="value">${fmt(outline.sellerAttorneyName)}</div></div>
      <div class="field"><div class="label">Contact</div><div class="value">${fmt(outline.sellerAttorneyEmail)} ${outline.sellerAttorneyPhone ? `• ${outline.sellerAttorneyPhone}` : ''}</div></div>
    </div>

    <div class="card">
      <div class="card-title">Financials & Loan</div>
      <div class="grid-2">
        <div class="field"><div class="label">Selling Price</div><div class="value">${fmtPrice(outline.sellingPrice || tx.price)}</div></div>
        <div class="field"><div class="label">Contract Deposit</div><div class="value">${fmtPrice(outline.depositAmount)}</div></div>
        <div class="field"><div class="label">Mortgage Amount</div><div class="value">${fmtPrice(outline.mortgageAmount)}</div></div>
        <div class="field"><div class="label">Cash at Closing</div><div class="value">${fmtPrice(outline.cashAtClosing)}</div></div>
      </div>
      <div class="field"><div class="label">Loan Officer</div><div class="value">${fmt(outline.loanOfficerName)} ${outline.loanOfficerPhone ? `(${outline.loanOfficerPhone})` : ''}</div></div>
    </div>
  </div>

  <div class="card">
    <div class="card-title">Key Dates & Additional Notes</div>
    <div class="grid-3">
      <div class="field"><div class="label">Target Close Date</div><div class="value">${fmt(tx.target_close_date || outline.date)}</div></div>
      <div class="field"><div class="label">Inspection Contingency</div><div class="value">${fmt(outline.inspectionDate || tx.home_inspection_date)}</div></div>
      <div class="field"><div class="label">Mortgage Commitment Date</div><div class="value">${fmt(outline.mortgageCommitmentDate || tx.pending_date)}</div></div>
    </div>
    ${outline.notes ? `<div class="field" style="margin-top:8px;"><div class="label">Notes</div><div class="value">${outline.notes}</div></div>` : ''}
  </div>

  <div class="footer">
    Confidential Deal Document • Prime America Real Estate • Generated automatically by Workspace
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`

        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `inline; filename="Deal_Outline_${tx.name.replace(/[^a-zA-Z0-9]/g, '_')}.html"`
          }
        })
      }


      // Add team member
      const txTeamMatch = path.match(/^\/api\/transactions\/([^/]+)\/team$/)
      if (txTeamMatch && method === 'POST') {
        const txId = txTeamMatch[1]
        const body: any = await request.json()

        // Ensure user belongs to the tenant
        const userExists = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ?').bind(body.user_id, tenantId).first()
        if (!userExists) return err('User not found in this workspace', 404)

        const existing = await env.DB.prepare('SELECT id FROM transaction_team WHERE transaction_id = ? AND user_id = ?').bind(txId, body.user_id).first()
        if (existing) return err('User is already on the team', 400)

        // Check if there are already 4 team members
        const countRes = await env.DB.prepare('SELECT COUNT(*) as count FROM transaction_team WHERE transaction_id = ?').bind(txId).first<{ count: number }>()
        if (countRes && countRes.count >= 4) {
          return err('Maximum 4 team members allowed per deal', 400)
        }
        await env.DB.prepare(`
          INSERT INTO transaction_team (id, transaction_id, tenant_id, user_id, role)
          VALUES (?, ?, ?, ?, ?)
        `).bind(newId(), txId, tenantId, body.user_id, body.role || 'co-agent').run()

        return ok({ success: true })
      }

      // Remove team member
      const txTeamDeleteMatch = path.match(/^\/api\/transactions\/([^/]+)\/team\/([^/]+)$/)
      if (txTeamDeleteMatch && method === 'DELETE') {
        const txId = txTeamDeleteMatch[1]
        const targetUserId = txTeamDeleteMatch[2]

        await env.DB.prepare('DELETE FROM transaction_team WHERE transaction_id = ? AND user_id = ? AND tenant_id = ?')
          .bind(txId, targetUserId, tenantId).run()

        return ok({ success: true })
      }

      // Add a single task
      const txTasksMatch = path.match(/^\/api\/transactions\/([^/]+)\/tasks$/)
      if (txTasksMatch && method === 'POST') {
        const txId = txTasksMatch[1]
        const tx = await env.DB.prepare('SELECT is_locked FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(txId, tenantId).first<any>()
        if (tx && tx.is_locked === 1 && role !== 'admin' && role !== 'broker') {
          return err('This transaction is locked by an administrator and tasks cannot be modified.', 403)
        }
        const body: any = await request.json()
        const taskId = newId()

        await env.DB.prepare(`
          INSERT INTO transaction_tasks (
            id, transaction_id, tenant_id, title, description, due_date, sort_order,
            document_required, attachment_required, broker_approval_required, due_anchor_event, due_offset_days,
            group_name, template_id
          )
          VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM transaction_tasks WHERE transaction_id = ?), ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          taskId,
          txId,
          tenantId,
          body.title,
          body.description || null,
          body.due_date || null,
          txId,
          toRequiredFlag(body.document_required),
          toRequiredFlag(body.attachment_required),
          toRequiredFlag(body.broker_approval_required),
          body.due_anchor_event || null,
          body.due_offset_days || null,
          body.group_name || null,
          body.template_id || null
        ).run()

        return ok({ id: taskId })
      }

      // Update or Delete a task
      const txTaskUpdateMatch = path.match(/^\/api\/transactions\/([^/]+)\/tasks\/([^/]+)$/)
      if (txTaskUpdateMatch) {
        const txId = txTaskUpdateMatch[1]
        const taskId = txTaskUpdateMatch[2]
        const tx = await env.DB.prepare('SELECT is_locked FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(txId, tenantId).first<any>()
        if (tx && tx.is_locked === 1 && role !== 'admin' && role !== 'broker') {
          return err('This transaction is locked by an administrator and tasks cannot be modified.', 403)
        }

        if (method === 'DELETE') {
          await env.DB
            .prepare('DELETE FROM transaction_tasks WHERE id = ? AND transaction_id = ? AND tenant_id = ?')
            .bind(taskId, txId, tenantId)
            .run()

          return ok({ deleted: true })
        }

        if (method === 'PUT') {
          const body: any = await request.json()

          const existingTask = await env.DB
            .prepare('SELECT document_required, document_key FROM transaction_tasks WHERE id = ? AND transaction_id = ? AND tenant_id = ?')
            .bind(taskId, txId, tenantId)
            .first<{ document_required: number | null; document_key: string | null }>()
          if (!existingTask) {
            return err('Task not found', 404)
          }

          const updates = []
          const binds = []

          if (body.title !== undefined) {
            updates.push('title = ?')
            binds.push(body.title)
          }

          if (body.description !== undefined) {
            updates.push('description = ?')
            binds.push(body.description || null)
          }

          if (body.due_date !== undefined) {
            updates.push('due_date = ?')
            binds.push(body.due_date || null)
          }

          if (body.group_name !== undefined) {
            updates.push('group_name = ?')
            binds.push(body.group_name || null)
          }

          if (body.status !== undefined) {
            if (body.status === 'completed' && (existingTask.document_required || 0) === 1 && !existingTask.document_key) {
              return err('A document attachment is required before completing this task', 400)
            }
            updates.push('status = ?')
            binds.push(body.status)
            if (body.status === 'completed') {
              updates.push('completed_at = datetime("now")')
              updates.push('completed_by = ?')
              binds.push(userId)
            } else {
              updates.push('completed_at = NULL')
              updates.push('completed_by = NULL')
            }
          }

          if (body.document_key !== undefined) {
            updates.push('document_key = ?')
            binds.push(body.document_key)
            updates.push('approval_status = "pending"')
          }

          if (body.approval_status !== undefined) {
            if (role !== 'admin' && role !== 'broker') {
              return err('Only brokers and admins can approve or reject compliance documents', 403)
            }
            updates.push('approval_status = ?')
            binds.push(body.approval_status)
            updates.push('approved_by = ?')
            binds.push(userId)
            updates.push('approved_at = datetime("now")')
            if (body.approval_notes !== undefined) {
              updates.push('approval_notes = ?')
              binds.push(body.approval_notes)
            }
          }

          if (updates.length > 0) {
            binds.push(taskId, txId, tenantId)
            await env.DB.prepare(`
              UPDATE transaction_tasks SET ${updates.join(', ')}
              WHERE id = ? AND transaction_id = ? AND tenant_id = ?
            `).bind(...binds).run()

            // Broadcast notification on compliance update
            if (body.document_key !== undefined) {
              await createNotification(env.DB, tenantId, `Compliance document uploaded for task on deal`)
            } else if (body.approval_status !== undefined) {
              await createNotification(env.DB, tenantId, `Compliance document was ${body.approval_status} on deal`)
            }
          }

          return ok({ success: true })
        }
      }

      // Update transaction details (PUT /api/transactions/:id)
      const txSingleMatch = path.match(/^\/api\/transactions\/([^/]+)$/)
      if (txSingleMatch && method === 'PUT') {
        const txId = txSingleMatch[1]
        const body: any = await request.json()

        const existing = await env.DB
          .prepare(`SELECT * FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1`)
          .bind(txId, tenantId)
          .first<any>()
        if (!existing) return err('Not found', 404)

        if (existing.is_locked === 1 && role !== 'admin' && role !== 'broker') {
          return err('This transaction is locked by an administrator and cannot be modified.', 403)
        }

        const nextName = body.name ?? existing.name
        const nextType = body.type ?? existing.type
        const nextStatus = body.status ?? existing.status
        const nextPrice = body.price !== undefined ? body.price : existing.price
        const nextCommissionAmount = body.commission_amount !== undefined ? body.commission_amount : existing.commission_amount
        const nextCommissionRate = body.commission_rate !== undefined ? body.commission_rate : existing.commission_rate
        const nextTargetCloseDate = body.target_close_date !== undefined ? body.target_close_date : existing.target_close_date
        const nextAgreementType = body.agreement_type !== undefined ? body.agreement_type : existing.agreement_type
        const nextAgreementExpirationDate = body.agreement_expiration_date !== undefined ? body.agreement_expiration_date : existing.agreement_expiration_date
        const nextPartiesInvolved = body.parties_involved !== undefined ? body.parties_involved : existing.parties_involved
        const nextIsLocked = body.is_locked !== undefined ? (body.is_locked ? 1 : 0) : (existing.is_locked ? 1 : 0)
        const nextListedDate = body.listed_date !== undefined ? body.listed_date : existing.listed_date
        const nextExpireDate = body.expire_date !== undefined ? body.expire_date : existing.expire_date
        const nextOfferDate = body.offer_date !== undefined ? body.offer_date : existing.offer_date
        const nextPendingDate = body.pending_date !== undefined ? body.pending_date : existing.pending_date
        const nextHomeInspectionDate = body.home_inspection_date !== undefined ? body.home_inspection_date : existing.home_inspection_date
        const nextPossessionDate = body.possession_date !== undefined ? body.possession_date : existing.possession_date
        const nextEscrowDate = body.escrow_date !== undefined ? body.escrow_date : existing.escrow_date
        const nextInspectionDeadline = body.inspection_deadline !== undefined ? body.inspection_deadline : existing.inspection_deadline
        const nextAppraisalDate = body.appraisal_date !== undefined ? body.appraisal_date : existing.appraisal_date

        // Overhauled business logic fields
        const nextEarnestMoneyAmount = body.earnest_money_amount !== undefined ? body.earnest_money_amount : existing.earnest_money_amount
        const nextEarnestMoneyStatus = body.earnest_money_status !== undefined ? body.earnest_money_status : existing.earnest_money_status
        const nextEarnestMoneyNotes = body.earnest_money_notes !== undefined ? body.earnest_money_notes : existing.earnest_money_notes
        const nextCommissionSplitBuyerPercent = body.commission_split_buyer_percent !== undefined ? body.commission_split_buyer_percent : existing.commission_split_buyer_percent
        const nextCommissionSplitCoBrokerPercent = body.commission_split_co_broker_percent !== undefined ? body.commission_split_co_broker_percent : existing.commission_split_co_broker_percent
        const nextCommissionSplitReferralPercent = body.commission_split_referral_percent !== undefined ? body.commission_split_referral_percent : existing.commission_split_referral_percent
        const nextRepairCredit = body.repair_credit !== undefined ? body.repair_credit : existing.repair_credit
        const nextAttorneyReviewStartDate = body.attorney_review_start_date !== undefined ? body.attorney_review_start_date : existing.attorney_review_start_date
        const nextAttorneyReviewStatus = body.attorney_review_status !== undefined ? body.attorney_review_status : existing.attorney_review_status
        const nextDealFailureReason = body.deal_failure_reason !== undefined ? body.deal_failure_reason : existing.deal_failure_reason
        const nextDealFailureNotes = body.deal_failure_notes !== undefined ? body.deal_failure_notes : existing.deal_failure_notes
        const nextPostOccupancyDeadline = body.post_occupancy_deadline !== undefined ? body.post_occupancy_deadline : existing.post_occupancy_deadline
        const nextPostOccupancyDailyRate = body.post_occupancy_daily_rate !== undefined ? body.post_occupancy_daily_rate : existing.post_occupancy_daily_rate
        const nextPostOccupancyEscrowHeld = body.post_occupancy_escrow_held !== undefined ? body.post_occupancy_escrow_held : existing.post_occupancy_escrow_held

        let nextActualCloseDate = body.actual_close_date !== undefined ? body.actual_close_date : existing.actual_close_date
        if (nextStatus === 'closed' && !nextActualCloseDate) {
          nextActualCloseDate = new Date().toISOString().split('T')[0]
        } else if (nextStatus !== 'closed') {
          nextActualCloseDate = null
        }

        // Reopen guard & stage regression checker
        if (body.status !== undefined && body.status !== existing.status) {
          const STAGE_ORDER = ['lead', 'active', 'offer_received', 'under_contract', 'closed']
          const existingIndex = STAGE_ORDER.indexOf(existing.status)
          const nextIndex = STAGE_ORDER.indexOf(nextStatus)
          if (nextIndex < existingIndex) {
            // Stage regression occurs
            if (existing.status === 'closed' && role !== 'admin' && role !== 'broker') {
              return err('Stage-Gate Compliance: Closed transactions can only be reopened by a broker or administrator.', 403)
            }
            // Log audit log event into transaction_outcomes
            const u = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first<any>()
            const userName = u?.name || 'Authorized User'
            const outcomeId = crypto.randomUUID()
            await env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, acted_as_assistant_for, assistant_assignment_id, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime("now"))
          `).bind(
            outcomeId,
            txId,
            tenantId,
            userId,
            `[Audit Log] Stage regressed from ${existing.status.toUpperCase()} to ${nextStatus.toUpperCase()} by ${userName}.`,
            isAssistant ? effectiveUserId : null,
            isAssistant ? assignmentId : null
          ).run()
          }
        }

        // Stage-gate enforcement: require milestone dates when advancing to gated stages
        if (body.status !== undefined && body.status !== existing.status) {
          let complianceTasks: any[] = []
          if (body.status === 'closed') {
            const res = await env.DB.prepare(`
              SELECT title, attachment_required, document_key, broker_approval_required, broker_approval_status
              FROM transaction_tasks
              WHERE transaction_id = ? AND tenant_id = ? AND (attachment_required = 1 OR broker_approval_required = 1)
            `).bind(txId, tenantId).all<any>()
            complianceTasks = res.results || []
          }

          const gate = validateStageTransition(body.status, {
            escrowDate: nextEscrowDate,
            inspectionDeadline: nextInspectionDeadline,
            appraisalDate: nextAppraisalDate,
          }, complianceTasks)

          if (!gate.allowed) {
            return err(`Stage-Gate Compliance: ${gate.missing.join('; ')} required before moving to ${body.status === 'closed' ? 'Closed' : 'Under Contract'}.`, 400)
          }
        }

        if (body.notes !== undefined && body.notes !== existing.notes && body.notes) {
          const outcomeId = crypto.randomUUID()
          await env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime("now"))
          `).bind(outcomeId, txId, tenantId, userId, `[Notes Update] ${body.notes}`).run()
        }
        if (body.earnest_money_notes !== undefined && body.earnest_money_notes !== existing.earnest_money_notes && body.earnest_money_notes) {
          const outcomeId = crypto.randomUUID()
          await env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime("now"))
          `).bind(outcomeId, txId, tenantId, userId, `[Earnest Money Note] ${body.earnest_money_notes}`).run()
        }
        if (body.deal_failure_notes !== undefined && body.deal_failure_notes !== existing.deal_failure_notes && body.deal_failure_notes) {
          const outcomeId = crypto.randomUUID()
          await env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime("now"))
          `).bind(outcomeId, txId, tenantId, userId, `[Deal Failure Note] ${body.deal_failure_notes}`).run()
        }

        await env.DB.prepare(`
          UPDATE transactions
          SET name = ?, type = ?, status = ?, price = ?, commission_amount = ?, commission_rate = ?,
              target_close_date = ?, actual_close_date = ?, agreement_type = ?, agreement_expiration_date = ?, parties_involved = ?,
              is_locked = ?, listed_date = ?, expire_date = ?, offer_date = ?, pending_date = ?, home_inspection_date = ?, possession_date = ?,
              escrow_date = ?, inspection_deadline = ?, appraisal_date = ?,
              earnest_money_amount = ?, earnest_money_status = ?, earnest_money_notes = ?,
              commission_split_buyer_percent = ?, commission_split_co_broker_percent = ?, commission_split_referral_percent = ?,
              repair_credit = ?, attorney_review_start_date = ?, attorney_review_status = ?,
              deal_failure_reason = ?, deal_failure_notes = ?,
              post_occupancy_deadline = ?, post_occupancy_daily_rate = ?, post_occupancy_escrow_held = ?,
              updated_by_assistant = ?, assistant_assignment_id = ?,
              updated_at = datetime("now")
          WHERE id = ? AND tenant_id = ?
        `).bind(
          nextName, nextType, nextStatus, nextPrice ?? null, nextCommissionAmount ?? null, nextCommissionRate ?? null,
          nextTargetCloseDate ?? null, nextActualCloseDate ?? null, nextAgreementType ?? null, nextAgreementExpirationDate ?? null, nextPartiesInvolved ?? null,
          nextIsLocked, nextListedDate ?? null, nextExpireDate ?? null, nextOfferDate ?? null, nextPendingDate ?? null, nextHomeInspectionDate ?? null, nextPossessionDate ?? null,
          nextEscrowDate ?? null, nextInspectionDeadline ?? null, nextAppraisalDate ?? null,
          nextEarnestMoneyAmount ?? null, nextEarnestMoneyStatus ?? null, nextEarnestMoneyNotes ?? null,
          nextCommissionSplitBuyerPercent ?? null, nextCommissionSplitCoBrokerPercent ?? null, nextCommissionSplitReferralPercent ?? null,
          nextRepairCredit ?? null, nextAttorneyReviewStartDate ?? null, nextAttorneyReviewStatus ?? null,
          nextDealFailureReason ?? null, nextDealFailureNotes ?? null,
          nextPostOccupancyDeadline ?? null, nextPostOccupancyDailyRate ?? null, nextPostOccupancyEscrowHeld ?? null,
          isAssistant ? 1 : 0, isAssistant ? assignmentId : null,
          txId, tenantId
        ).run()

        // Audit log for delegated update
        if (isAssistant) {
          const outcomeId = newId()
          await env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, acted_as_assistant_for, assistant_assignment_id, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?, ?, datetime('now'))
          `).bind(newId(), txId, tenantId, userId, `[Delegated Update] Deal updated by assistant`, effectiveUserId, assignmentId).run()
        }

        if (body.parties_involved !== undefined && typeof nextPartiesInvolved === 'string') {
          try {
            const outline = JSON.parse(nextPartiesInvolved)
            if (outline && typeof outline === 'object') {
              await syncOutlineToCrmAndNetwork(env.DB, tenantId, userId, txId, String(nextName || 'Deal'), outline)
            }
          } catch {
            // Ignore non-JSON notes format and keep backward compatibility
          }
        }

        return ok({ success: true })
      }

      // Delete transaction (DELETE /api/transactions/:id)
      if (txSingleMatch && method === 'DELETE') {
        if (role !== 'admin' && role !== 'broker') {
          return err('Only brokers and admins have authority to delete deals', 403)
        }
        const txId = txSingleMatch[1]
        await env.DB.prepare('UPDATE transactions SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').bind(txId, tenantId).run()
        return ok({ success: true, message: 'Deal deleted successfully' })
      }

      // Notify team members of milestone date update (POST /api/transactions/:id/timeline/notify)
      const notifyTimelineMatch = path.match(/^\/api\/transactions\/([^/]+)\/timeline\/notify$/)
      if (notifyTimelineMatch && method === 'POST') {
        const txId = notifyTimelineMatch[1]
        const body: any = await request.json()
        const { milestone, date } = body

        if (!milestone || !date) {
          return err('Missing milestone or date', 400)
        }

        const tx = await env.DB
          .prepare(`SELECT name, assigned_to FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1`)
          .bind(txId, tenantId)
          .first<any>()
        if (!tx) return err('Transaction not found', 404)

        // Fetch team members
        const teamMembers = await env.DB
          .prepare(`
            SELECT u.name, u.email
            FROM transaction_team tt
            JOIN users u ON u.id = tt.user_id
            WHERE tt.transaction_id = ?
          `).bind(txId).all<any>()

        // Fetch assigned agent
        const assignedAgent = await env.DB
          .prepare(`SELECT name, email FROM users WHERE id = ?`).bind(tx.assigned_to).first<any>()

        const recipients = new Map<string, string>()
        if (assignedAgent && assignedAgent.email) {
          recipients.set(assignedAgent.email, assignedAgent.name)
        }
        for (const m of (teamMembers.results || [])) {
          if (m.email) {
            recipients.set(m.email, m.name)
          }
        }

        const milestoneNames: Record<string, string> = {
          listed_date: 'Listed Date',
          expire_date: 'Expiration Date',
          offer_date: 'Offer Date',
          pending_date: 'Pending Date',
          home_inspection_date: 'Home Inspection Date',
          possession_date: 'Possession Date',
        }

        const friendlyName = milestoneNames[milestone] || milestone

        // Send email to each recipient
        if (env.EMAIL && recipients.size > 0) {
          for (const [emailAddress, recipientName] of recipients.entries()) {
            try {
              await env.EMAIL.send({
                to: [{ email: emailAddress, name: recipientName }],
                from: { email: 'noreply@primeamericarealestate.com', name: 'Prime America Real Estate' },
                subject: `[Milestone Update] ${friendlyName} set for ${tx.name}`,
                text: `Hi ${recipientName},\n\nThis is a milestone update notification for the transaction "${tx.name}".\n\nThe milestone "${friendlyName}" has been scheduled or updated to:\n${date}\n\nView details in your RE Workspace dashboard.\n\n— Prime America Real Estate`,
                html: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; background: #F7F6F2; padding: 20px; }
    .wrap { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; border: 1px solid #E8E6E1; overflow: hidden; }
    .header { background: #01696F; color: #fff; padding: 24px; text-align: center; }
    .body { padding: 24px; color: #4A4740; line-height: 1.6; }
    .footer { text-align: center; font-size: 11px; color: #7A7974; padding: 20px; border-top: 1px solid #E8E6E1; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h2>Milestone Scheduled Alert</h2>
    </div>
    <div class="body">
      <p>Hi <strong>${recipientName}</strong>,</p>
      <p>The transaction milestone <strong>${friendlyName}</strong> for deal <strong>${tx.name}</strong> has been updated:</p>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-size: 18px; font-weight: bold; text-align: center; padding: 15px; border-radius: 8px; margin: 20px 0;">
        ${date}
      </div>
      <p>Please check your checklist and take any necessary actions regarding this milestone.</p>
    </div>
    <div class="footer">Prime America Real Estate · RE Workspace</div>
  </div>
</body>
</html>`
              })
            } catch (mailErr) {
              console.error(`Failed to send email to ${emailAddress}:`, mailErr)
            }
          }
        }

        return ok({ success: true, notifiedCount: recipients.size })
      }

      // Apply a template (adds multiple tasks)
      const applyTemplateMatch = path.match(/^\/api\/transactions\/([^/]+)\/apply-template$/)
      if (applyTemplateMatch && method === 'POST') {
        const txId = applyTemplateMatch[1]
        const body: any = await request.json() // e.g. { template_id: "...", or template: "buyer" }
        const tx = await env.DB
          .prepare('SELECT target_close_date, created_at FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1')
          .bind(txId, tenantId)
          .first<{ target_close_date: string | null; created_at: string | null }>()

        let templateTitle = ''
        let templateTasks: any[] = []

        if (body.template === 'buyer') {
           templateTitle = 'Buyer Template'
           templateTasks = [
             { title: 'Sign Exclusive Right to Represent Buyer Agreement', desc: 'Ensure client signs representation agreement.', due_anchor: 'contract_date', due_offset_days: 0 },
             { title: 'Get Pre-Approval Letter', desc: 'Collect mortgage pre-approval from lender.', due_anchor: 'contract_date', due_offset_days: 2 },
             { title: 'Schedule Showings', desc: 'Set up tours for shortlisted properties.', due_anchor: 'contract_date', due_offset_days: 5 },
             { title: 'Writing Up Offer', desc: 'Prepare offer package terms, contingencies, and disclosures for client review.', due_anchor: 'contract_date', due_offset_days: 6 },
             { title: 'Submit Offer', desc: 'Draft and submit the official offer.', due_anchor: 'contract_date', due_offset_days: 7 },
             { title: 'Schedule Inspection', desc: 'Book a certified home inspector.', due_anchor: 'closing_date', due_offset_days: -14 }
           ]
        } else if (body.template === 'seller') {
           templateTitle = 'Seller Template'
           templateTasks = [
             { title: 'Sign Listing Agreement', desc: 'Ensure seller signs the exclusive listing agreement.', due_anchor: 'contract_date', due_offset_days: 0 },
             { title: 'Hire Photographer', desc: 'Schedule professional photos and virtual tour.', due_anchor: 'contract_date', due_offset_days: 2 },
             { title: 'Publish to MLS', desc: 'Enter listing into the local MLS.', due_anchor: 'contract_date', due_offset_days: 3 },
             { title: 'Writing Up Offer', desc: 'Draft counteroffer / acceptance paperwork and key legal terms for seller review.', due_anchor: 'contract_date', due_offset_days: 6 },
             { title: 'Host Open House', desc: 'Organize first public open house.', due_anchor: 'contract_date', due_offset_days: 7 },
             { title: 'Review Offers', desc: 'Present and review all received offers with the seller.', due_anchor: 'closing_date', due_offset_days: -7 }
           ]
        } else if (body.template_id) {
           const tmpl = await env.DB.prepare('SELECT name, tasks_json FROM transaction_templates WHERE id = ? AND tenant_id = ?').bind(body.template_id, tenantId).first()
           if (tmpl && tmpl.tasks_json) {
             templateTitle = tmpl.name as string
             templateTasks = JSON.parse(tmpl.tasks_json as string)
           }
        }

        const computeDueDate = (task: any): string => {
          if (task?.due_date) return String(task.due_date)

          const anchor = task?.due_anchor === 'closing_date' ? 'closing_date' : 'contract_date'
          const offsetDays = Number.parseInt(String(task?.due_offset_days ?? 0), 10) || 0
          const baseRaw = anchor === 'closing_date'
            ? tx?.target_close_date
            : tx?.created_at

          const base = baseRaw ? new Date(baseRaw) : new Date()
          if (Number.isNaN(base.getTime())) {
            const fallback = new Date()
            fallback.setDate(fallback.getDate() + 7)
            return fallback.toISOString().slice(0, 10)
          }

          base.setDate(base.getDate() + offsetDays)
          return base.toISOString().slice(0, 10)
        }

        if (templateTasks.length > 0) {
          const stmt = env.DB.prepare(`
            INSERT INTO transaction_tasks (
              id, transaction_id, tenant_id, title, description, due_date, sort_order,
              document_required, attachment_required, broker_approval_required, due_anchor_event, due_offset_days,
              template_id, group_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)

          const maxSortRes = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM transaction_tasks WHERE transaction_id = ?').bind(txId).first()
          let sortOrder = (maxSortRes?.max_sort as number) + 1

          const batch = templateTasks.map(t =>
            stmt.bind(
              newId(),
              txId,
              tenantId,
              t.title,
              t.desc || t.description || null,
              computeDueDate(t),
              sortOrder++,
              toRequiredFlag(t.document_required),
              toRequiredFlag(t.attachment_required),
              toRequiredFlag(t.broker_approval_required),
              t.due_anchor_event || t.due_anchor || null,
              t.due_offset_days || null,
              body.template_id || null,
              templateTitle || null
            )
          )

          await env.DB.batch(batch)
        }

        return ok({ success: true, added: templateTasks.length })
      }

      // WebSocket Outcomes DO Routing
      const txOutcomesWsMatch = path.match(/^\/api\/transactions\/([^/]+)\/outcomes\/ws$/)
      if (txOutcomesWsMatch && method === 'GET' && request.headers.get('Upgrade') === 'websocket') {
        const txId = txOutcomesWsMatch[1]
        const doId = env.OUTCOMES_ROOM.idFromName(txId)
        const stub = env.OUTCOMES_ROOM.get(doId)
        const doUrl = new URL(request.url)
        doUrl.pathname = '/websocket'
        return stub.fetch(new Request(doUrl.toString(), {
          headers: request.headers
        }))
      }

      // Outcomes Endpoints
      const txOutcomesMatch = path.match(/^\/api\/transactions\/([^/]+)\/outcomes$/)
      if (txOutcomesMatch && method === 'POST') {
        const txId = txOutcomesMatch[1]
        const body: any = await request.json()
        const outcomeId = newId()

        await env.DB.prepare(`
          INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          outcomeId,
          txId,
          tenantId,
          userId,
          body.message,
          body.is_broker_advice ? 1 : 0
        ).run()

        // Broadcast via Durable Object
        try {
          const u = await env.DB.prepare('SELECT name, avatar_url FROM users WHERE id = ?').bind(userId).first<any>()
          const doId = env.OUTCOMES_ROOM.idFromName(txId)
          const stub = env.OUTCOMES_ROOM.get(doId)
          const doUrl = new URL(request.url)
          doUrl.pathname = '/broadcast'
          await stub.fetch(new Request(doUrl.toString(), {
            method: 'POST',
            body: JSON.stringify({
              type: 'new_outcome',
              data: {
                id: outcomeId,
                transaction_id: txId,
                tenant_id: tenantId,
                user_id: userId,
                message: body.message,
                is_broker_advice: body.is_broker_advice ? 1 : 0,
                created_at: new Date().toISOString(),
                name: u?.name || 'User',
                avatar_url: u?.avatar_url || null,
                role: role,
                first_name: (u?.name || 'User').split(' ')[0] || '',
                last_name: (u?.name || 'User').split(' ').slice(1).join(' ') || ''
              }
            }),
            headers: { 'Content-Type': 'application/json' }
          }))
        } catch (e) {
          console.error('Failed to broadcast outcome to DO:', e)
        }

        return ok({ success: true, id: outcomeId })
      }

      if (txOutcomesMatch && method === 'DELETE') {
        const txId = txOutcomesMatch[1]
        if (role !== 'admin' && role !== 'broker') {
          return err('Unauthorized', 403)
        }
        await env.DB.prepare(`
          DELETE FROM transaction_outcomes WHERE transaction_id = ? AND tenant_id = ?
        `).bind(txId, tenantId).run()

        try {
          const doId = env.OUTCOMES_ROOM.idFromName(txId)
          const stub = env.OUTCOMES_ROOM.get(doId)
          const doUrl = new URL(request.url)
          doUrl.pathname = '/broadcast'
          await stub.fetch(new Request(doUrl.toString(), {
            method: 'POST',
            body: JSON.stringify({
              type: 'reset_outcomes',
              data: { transaction_id: txId }
            }),
            headers: { 'Content-Type': 'application/json' }
          }))
        } catch (e) {
          console.error('Failed to broadcast outcomes reset:', e)
        }

        return ok({ success: true })
      }

      if (path === '/api/transactions/outcomes/templates' && method === 'GET') {
        const templates = await env.DB.prepare('SELECT * FROM outcome_templates WHERE tenant_id = ?').bind(tenantId).all()
        return ok(templates.results)
      }

      if (path === '/api/transactions/outcomes/templates' && method === 'POST') {
        const body: any = await request.json()
        const tmplId = newId()
        await env.DB.prepare(`
          INSERT INTO outcome_templates (id, tenant_id, transaction_type, title, message, created_by)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(
          tmplId,
          tenantId,
          body.transaction_type || null,
          body.title,
          body.message,
          userId
        ).run()
        return ok({ success: true, id: tmplId })
      }

      // Get Offers list
      const txOffersMatch = path.match(/^\/api\/transactions\/([^/]+)\/offers$/)
      if (txOffersMatch && method === 'GET') {
        const txId = txOffersMatch[1]
        const offers = await env.DB
          .prepare('SELECT * FROM transaction_offers WHERE transaction_id = ? AND tenant_id = ? ORDER BY created_at DESC')
          .bind(txId, tenantId)
          .all<any>()

        const results = (offers.results || []).map((o: any) => {
          try {
            return {
              ...JSON.parse(o.details_json),
              id: o.id,
              status: o.status,
              createdAt: o.created_at,
              updatedAt: o.updated_at,
            }
          } catch {
            return {
              id: o.id,
              purchaserName: o.purchaser_name,
              purchasePrice: o.purchase_price,
              offerDate: o.offer_date,
              offerType: o.offer_type,
              status: o.status,
              createdAt: o.created_at,
              updatedAt: o.updated_at,
            }
          }
        })
        return ok(results)
      }

function validateOfferDetails(offer: any): { valid: boolean; error?: string } {
  if (!offer || typeof offer !== 'object') {
    return { valid: false, error: 'Offer payload must be an object' }
  }
  if (typeof offer.purchaserName !== 'string' || !offer.purchaserName.trim()) {
    return { valid: false, error: 'Purchaser Name is required and must be a string' }
  }
  const price = Number(offer.purchasePrice)
  if (isNaN(price) || price <= 0) {
    return { valid: false, error: 'Purchase Price must be a positive number' }
  }
  if (typeof offer.offerDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(offer.offerDate)) {
    return { valid: false, error: 'Offer Date is required and must be in YYYY-MM-DD format' }
  }
  if (offer.offerType !== 'sales_agreement' && offer.offerType !== 'loi') {
    return { valid: false, error: 'Offer Type must be either sales_agreement or loi' }
  }
  if (offer.status && !['pending', 'accepted', 'rejected'].includes(offer.status)) {
    return { valid: false, error: 'Invalid offer status' }
  }

  const numericFields = [
    'downPaymentAmount',
    'downPaymentPercent',
    'mortgageAmount',
    'buyerBrokerCommission'
  ]
  for (const f of numericFields) {
    if (offer[f] !== undefined && offer[f] !== null && offer[f] !== '') {
      if (isNaN(Number(offer[f]))) {
        return { valid: false, error: `${f} must be a number` }
      }
    }
  }

  const dateFields = ['closingDate', 'possessionDate', 'inspectionDate', 'inspectionDeadline', 'appraisalDeadline', 'escrowDate']
  for (const f of dateFields) {
    if (offer[f] && typeof offer[f] === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(offer[f])) {
        return { valid: false, error: `${f} must be in YYYY-MM-DD format` }
      }
    }
  }

  return { valid: true }
}

      // Upsert (Create/Update) Offer
      if (txOffersMatch && method === 'POST') {
        const txId = txOffersMatch[1]
        const body: any = await request.json()
        const offer = body.offer
        if (!offer) return err('Missing offer payload', 400)

        const validation = validateOfferDetails(offer)
        if (!validation.valid) {
          return err(`Validation failed: ${validation.error}`, 400)
        }

        // Enforce transaction lock status
        const tx = await env.DB.prepare('SELECT is_locked FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(txId, tenantId).first<any>()
        if (tx && tx.is_locked === 1 && role !== 'admin' && role !== 'broker') {
          return err('This transaction is locked by an administrator and offers cannot be modified.', 403)
        }

        const id = offer.id && !offer.id.startsWith('offer_') ? offer.id : newId()
        const purchaserName = offer.purchaserName || 'Unnamed Purchaser'
        const purchasePrice = Number(offer.purchasePrice || 0)
        const offerDate = offer.offerDate || new Date().toISOString().substring(0, 10)
        const offerType = offer.offerType || 'sales_agreement'
        const status = offer.status || 'pending'

        const detailObj = { ...offer, id, status }
        const detailsJson = JSON.stringify(detailObj)

        await env.DB
          .prepare(`
            INSERT INTO transaction_offers (id, transaction_id, tenant_id, purchaser_name, purchase_price, offer_date, offer_type, status, details_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              purchaser_name = excluded.purchaser_name,
              purchase_price = excluded.purchase_price,
              offer_date = excluded.offer_date,
              offer_type = excluded.offer_type,
              status = excluded.status,
              details_json = excluded.details_json,
              updated_at = datetime('now')
          `)
          .bind(id, txId, tenantId, purchaserName, purchasePrice, offerDate, offerType, status, detailsJson)
          .run()

        return ok({
          ...detailObj,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }

      // Delete single Offer
      const txSingleOfferMatch = path.match(/^\/api\/transactions\/([^/]+)\/offers\/([^/]+)$/)
      if (txSingleOfferMatch && method === 'DELETE') {
        const txId = txSingleOfferMatch[1]
        const offerId = txSingleOfferMatch[2]

        // Enforce transaction lock status
        const tx = await env.DB.prepare('SELECT is_locked FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(txId, tenantId).first<any>()
        if (tx && tx.is_locked === 1 && role !== 'admin' && role !== 'broker') {
          return err('This transaction is locked by an administrator and offers cannot be modified.', 403)
        }

        await env.DB
          .prepare('DELETE FROM transaction_offers WHERE id = ? AND transaction_id = ? AND tenant_id = ?')
          .bind(offerId, txId, tenantId)
          .run()

        return ok({ success: true })
      }

      return err('Transactions endpoint not found', 404)
    } catch (e: any) {
      return err(e.message, 500)
    }
  }
}

export class OutcomesRoom {
  state: any;
  sessions: Set<any>;

  constructor(state: any) {
    this.state = state;
    this.sessions = new Set();
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/websocket") {
      // @ts-ignore
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server);

      // @ts-ignore
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const body: any = await request.json();
      this.broadcast(body);
      return new Response("OK");
    }

    return new Response("Not found", { status: 404 });
  }

  async handleSession(ws: any) {
    ws.accept();
    this.sessions.add(ws);

    ws.addEventListener("close", () => {
      this.sessions.delete(ws);
    });

    ws.addEventListener("error", () => {
      this.sessions.delete(ws);
    });
  }

  broadcast(message: any) {
    const payload = JSON.stringify(message);
    for (const ws of this.sessions) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }
}
