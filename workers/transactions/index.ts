import { financialRoutes, reopenFinancials } from './financials'
import { outlinePosting } from './outline-posting'
import { workflowPhases } from '../../src/domain/workflow-template'
import { transactionResults, resultsCsv } from './results'
import { isDateOnly } from '../../src/domain/reporting-period'
import { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { validateStageTransition } from '../../worker/lib/stageGate'
import { commissionPosting } from './commission-posting'
import {
  canTransitionTransaction,
  normalizeTransactionStatus,
  transactionStageIndex,
} from '../../src/domain/transaction-status'


export interface Env {
  DB: D1Database
  INVENTORY_WORKER_URL: string
  CW_WRITE_PAUSED?: string
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

function inventoryRequestHeaders(
  env: Env,
  context: { userId: string; tenantId: string; role: string },
): Record<string, string> {
  return {
    Accept: 'application/json',
    ...(env.INTERNAL_API_SECRET && { Authorization: `Bearer ${env.INTERNAL_API_SECRET}` }),
    'X-User-Id': context.userId,
    'X-Tenant-Id': context.tenantId,
    'X-User-Role': context.role,
  }
}

function inventoryListingData(listing: any): Record<string, any> {
  return listing?.data && typeof listing.data === 'object' ? listing.data : {}
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
      if (env.CW_WRITE_PAUSED === 'true' && !['GET','HEAD'].includes(method)) return err('Transaction updates are briefly paused for maintenance. Your changes have not been saved; retry shortly.',503)
      const { userId, tenantId, role, isAssistant, principalId, assignmentId, canAccessTransactions, canAccessContacts } = getCtx(request)

      // Assistant scope checks
      if (isAssistant) {
        if (path.startsWith('/api/transactions') && !canAccessTransactions) {
          return err('Forbidden: assistant has no transactions scope', 403)
        }
      }

      // For assistant, use principalId for data ownership; for others, use userId
      const effectiveUserId = isAssistant ? principalId : userId

      const financialResponse = await financialRoutes(request, env.DB, { tenantId, userId, role, effectiveUserId, isAssistant })
      if (financialResponse) return financialResponse

      // Proxy listings from Inventory app
      if (path === '/api/transactions/listings' && method === 'GET') {
        const fetchUrl = new URL(`${env.INVENTORY_WORKER_URL}/api/projects`)
        fetchUrl.search = url.search
      const res = await fetch(fetchUrl.toString(), {
        headers: inventoryRequestHeaders(env, { userId, tenantId, role }),
      })
        const data = await res.json()
        return ok(data)
      }

      // Explicit Inventory -> Transactions import. This is intentionally a
      // command endpoint so refreshing a transactions dashboard never writes.
      if (path === '/api/transactions/sync-listings' && method === 'POST') {
        const ownerId = effectiveUserId
        const fetchUrl = new URL(`${env.INVENTORY_WORKER_URL}/api/projects`)
        const res = await fetch(fetchUrl.toString(), {
          headers: inventoryRequestHeaders(env, { userId, tenantId, role }),
        })
        if (!res.ok) return err(`Inventory sync failed with status ${res.status}`, 502)

        const eventsResponse = await fetch(`${env.INVENTORY_WORKER_URL}/api/business-events`, {
          headers: inventoryRequestHeaders(env, { userId, tenantId, role }), signal: AbortSignal.timeout(10000),
        })
        if (!eventsResponse.ok) return err('Inventory business-event evidence unavailable', 502)
        const eventBody: any = await eventsResponse.json()
        const events: any[] = Array.isArray(eventBody.events) ? eventBody.events : []
        const eligibleEvents = new Map(events.filter(event => event.tenant_id === tenantId
          && ['agreement_executed', 'offer_accepted'].includes(event.event_type)
          && event.id && event.evidence_document_id && event.source_version && event.occurred_at)
          .map(event => [event.listing_id, event]))
        const data: any = await res.json()
        const listings = data.listings || data.projects || data.entries || []
        const eligibleListings = Array.isArray(listings)
          ? listings.filter((listing: any) => {
              const listingData = inventoryListingData(listing)
              return listing?.id && eligibleEvents.get(listing.id)?.source_version === listing.updatedAt && (listing.createdBy === ownerId || listingData.listAgentUserId === ownerId)
            })
          : []

        const existingListings = await env.DB
          .prepare('SELECT inventory_listing_id FROM transactions WHERE tenant_id = ? AND inventory_listing_id IS NOT NULL')
          .bind(tenantId)
          .all()
        const existingIds = new Set(existingListings.results.map((row: any) => row.inventory_listing_id))
        const newListings = eligibleListings.filter((listing: any) => !existingIds.has(listing.id))

        const stmt = env.DB.prepare(`
          INSERT INTO transactions (
            id, tenant_id, assigned_to, inventory_listing_id, name, type, status, price,
            commission_amount, target_close_date, inventory_source, inventory_source_version,
            inventory_snapshot_synced_at, inventory_snapshot_json, source_event_id
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM transactions
            WHERE tenant_id = ? AND inventory_listing_id = ?
          )
        `)

        let imported = 0
        for (let index = 0; index < newListings.length; index += 50) {
          const batch = newListings.slice(index, index + 50).map((listing: any) => {
            const listingData = inventoryListingData(listing)
            const propertyType = String(listingData.propertyType ?? listing.propertyType ?? '').toLowerCase()
            const price = listingData.listPrice ?? listing.price ?? null
            const snapshot = {
              listingId: listing.id,
              propertyId: listing.propertyId ?? null,
              name: listing.name || 'Untitled Listing',
              propertyType: listingData.propertyType ?? listing.propertyType ?? null,
              listingStatus: listing.listingStatus ?? listing.status ?? null,
              price,
            }
            return stmt.bind(
              newId(), tenantId, ownerId, listing.id,
              listing.name || 'Untitled Listing',
              propertyType.includes('lease') ? 'lease' : 'sale',
              'lead',
              price, null, null,
              'listing-input', listing.updatedAt ?? null, new Date().toISOString(), JSON.stringify(snapshot), eligibleEvents.get(listing.id).id,
              tenantId, listing.id,
            )
          })
          if (batch.length > 0) {
            const results = await env.DB.batch(batch)
            imported += results.reduce((sum, result) => sum + (result.meta.changes || 0), 0)
          }
        }

        return ok({
          imported,
          eligible: eligibleListings.length,
          skippedExisting: eligibleListings.length - newListings.length,
        })
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
      if ((path === '/api/transactions' || path === '/api/transactions/results') && method === 'GET') {
        const assignedToFilter = url.searchParams.get('assigned_to') || ''
        const listingIdFilter = url.searchParams.get('inventory_listing_id') || ''
        const agentListingIds = new Set<string>()

        // Read Inventory ownership only for result visibility; never mutate on GET.
        try {
          const fetchUrl = new URL(`${env.INVENTORY_WORKER_URL}/api/projects`)
        const res = await fetch(fetchUrl.toString(), {
          headers: inventoryRequestHeaders(env, { userId, tenantId, role }), signal: AbortSignal.timeout(10000),
        })
          if (!res.ok) throw new Error('Inventory ownership unavailable')
          if (res.ok) {
            const data: any = await res.json()
            const listings = data.listings || data.projects || data.entries || []

            // Build the set of listings where current user is listing or co-listing agent
            listings.forEach((l: any) => {
              const listingData = inventoryListingData(l)
              if (l.createdBy === effectiveUserId || listingData.listAgentUserId === effectiveUserId) {
                if (l.id) agentListingIds.add(l.id)
              }
            })

          }
        } catch (e) {
          console.error('Inventory ownership lookup failed', e)
          if (!['admin','broker'].includes(role)) return err('Inventory ownership is unavailable; results cannot be completed. Retry when the source recovers.',503)
        }

        let query = `
            SELECT t.*,
              (SELECT calculation_json FROM deal_financial_versions f WHERE f.tenant_id=t.tenant_id AND f.transaction_id=t.id AND f.version=t.financials_version) AS financial_calculation_json,
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

        for (const t of filteredResults) {
          const row = t as Record<string, any>
          if (row.financial_calculation_json) {
            const c = JSON.parse(row.financial_calculation_json)
            row.my_compensation = c.agents?.find((a: { agentId: string }) => a.agentId === userId)?.agentCents ?? null
            if (row.my_compensation !== null) row.my_compensation /= 100
            if (['admin','broker'].includes(role)) {
              row.agent_compensation = c.agents?.every((a: { agentCents: number | null }) => a.agentCents !== null) ? c.agents.reduce((sum: number, a: { agentCents: number }) => sum + a.agentCents, 0) / 100 : null
              row.company_retention = c.companyCents === null ? null : c.companyCents / 100
            }
          }
          delete row.financial_calculation_json
        }

        if (path === '/api/transactions/results') {
          try {
            const report = transactionResults(filteredResults as any[], url.searchParams)
            if (url.searchParams.get('format') === 'csv') return new Response(resultsCsv(report), {
              headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="closed-results.csv"', 'Cache-Control': 'no-store' },
            })
            return ok(report)
          } catch { return err('Invalid reporting period', 400) }
        }
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
            normalizeTransactionStatus(t.status || 'lead') || 'lead',
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
        const initialStatus = normalizeTransactionStatus(body.status || 'lead')
        if (!initialStatus) return err('Unknown transaction status.', 400)
        const id = newId()
        const createdByAssistant = isAssistant ? 1 : 0
        await env.DB
          .prepare(`
            INSERT INTO transactions (
              id, tenant_id, assigned_to, inventory_listing_id, name, type, status,
              price, commission_amount, commission_rate, target_close_date,
              commission_split_buyer_percent, commission_split_co_broker_percent, commission_split_referral_percent,
              listed_date, expire_date, offer_date, offer_accepted_date, pending_date,
              home_inspection_date, possession_date, escrow_date, inspection_deadline, appraisal_date, closing_date,
              created_by_assistant, assistant_assignment_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            id, tenantId, effectiveUserId || userId, body.inventory_listing_id || null,
            body.name || 'Untitled Deal', body.type || 'sale', initialStatus,
            body.price || null, body.commission_amount || null, body.commission_rate || null, body.target_close_date || null,
            body.commission_split_buyer_percent || null, body.commission_split_co_broker_percent || null, body.commission_split_referral_percent || null,
            body.listed_date || null, body.expire_date || null, body.offer_date || null, body.offer_accepted_date || null, body.pending_date || null,
            body.home_inspection_date || null, body.possession_date || null, body.escrow_date || null, body.inspection_deadline || null, body.appraisal_date || null, body.closing_date || null,
            createdByAssistant, isAssistant ? (assignmentId || null) : null
          )
          .run()

        // If parties are provided
        if (body.parties && Array.isArray(body.parties) && body.parties.length > 0) {
          const stmt = env.DB.prepare(`
            INSERT INTO transaction_parties (id, transaction_id, tenant_id, contact_id, role, is_primary)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
          const batch = body.parties.map((p: any) =>
            stmt.bind(newId(), id, tenantId, p.contact_id || p.contactId || null, p.role || 'other', p.is_primary ? 1 : 0)
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
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN status = 'offer_received' THEN 1 ELSE 0 END) as offer_received,
              SUM(CASE WHEN status = 'under_contract' THEN 1 ELSE 0 END) as under_contract,
              SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
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

      // ── Party Attachment: POST /api/transactions/:id/parties ─────────────────
      const txPartiesMatch = path.match(/^\/api\/transactions\/([^/]+)\/parties$/)
      if (txPartiesMatch && method === 'POST') {
        const txId = txPartiesMatch[1]
        const body: any = await request.json()
        const { contact_id, role, is_primary } = body

        if (!contact_id || !role) return err('contact_id and role are required', 400)

        const validRoles = ['buyer', 'seller', 'tenant', 'landlord', 'co_buyer', 'co_seller', 'attorney', 'other']
        if (!validRoles.includes(role)) return err(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400)

        // Check the transaction exists and belongs to this tenant
        const tx = await env.DB
          .prepare('SELECT id, assigned_to FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1')
          .bind(txId, tenantId)
          .first<any>()
        if (!tx) return err('Transaction not found', 404)

        // Permission: admin/broker/deal owner or team member may add parties
        if (!['admin', 'broker'].includes(role) && tx.assigned_to !== userId) {
          const isTeamMember = await env.DB
            .prepare('SELECT 1 FROM transaction_team WHERE transaction_id = ? AND user_id = ?')
            .bind(txId, userId)
            .first()
          if (!isTeamMember) return err('Forbidden', 403)
        }

        // Remove existing party for this contact+transaction if they are already linked (idempotent)
        await env.DB
          .prepare('DELETE FROM transaction_parties WHERE transaction_id = ? AND contact_id = ? AND tenant_id = ?')
          .bind(txId, contact_id, tenantId)
          .run()

        const partyId = newId()
        await env.DB
          .prepare('INSERT INTO transaction_parties (id, transaction_id, tenant_id, contact_id, role, is_primary) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(partyId, txId, tenantId, contact_id, role, is_primary ? 1 : 0)
          .run()

        // Update contact lifecycle stage to active_client + mark as represented
        await env.DB
          .prepare(`UPDATE contacts SET lifecycle_stage = 'active_client', status = 'active', representation_status = 'represented_by_us', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`)
          .bind(contact_id, tenantId)
          .run()

        return ok({ success: true, id: partyId, message: 'Contact linked to deal successfully' })
      }

      // ── Party Unlink: DELETE /api/transactions/:id/parties/:partyId ──────────
      const txPartyDeleteMatch = path.match(/^\/api\/transactions\/([^/]+)\/parties\/([^/]+)$/)
      if (txPartyDeleteMatch && method === 'DELETE') {
        const txId = txPartyDeleteMatch[1]
        const partyId = txPartyDeleteMatch[2]

        // Check the transaction exists
        const tx = await env.DB
          .prepare('SELECT id, assigned_to FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1')
          .bind(txId, tenantId)
          .first<any>()
        if (!tx) return err('Transaction not found', 404)

        const result = await env.DB
          .prepare('DELETE FROM transaction_parties WHERE id = ? AND transaction_id = ? AND tenant_id = ?')
          .bind(partyId, txId, tenantId)
          .run()

        if ((result as any).changes === 0) return err('Party not found', 404)
        return ok({ success: true, message: 'Contact unlinked from deal' })
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
          headers: inventoryRequestHeaders(env, { userId, tenantId, role }),
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
      <div class="field"><div class="label">${tx.financial_price_label || "Target"} Price</div><div class="value">${fmtPrice(tx.price)}</div></div>
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
        <div class="field"><div class="label">Selling Price</div><div class="value">${fmtPrice(tx.financials_version ? tx.price : outline.sellingPrice || tx.price)}</div></div>
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
          body.title || 'Untitled Task',
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

        if (existing.financials_version > 0) {
          for (const field of ['price', 'commission_amount', 'commission_rate', 'commission_split_buyer_percent', 'commission_split_co_broker_percent', 'commission_split_referral_percent']) {
            if (body[field] !== undefined && body[field] !== existing[field]) return err('Edit prices and compensation in Financials.', 409)
          }
          if (existing.financials_state === 'approved' && ((body.status !== undefined && body.status !== existing.status) || (body.actual_close_date !== undefined && body.actual_close_date !== existing.actual_close_date))) return err('Save a financial revision for review before changing an approved closing.', 409)
        }
        const writes: D1PreparedStatement[] = []
        if (body.expected_revision !== undefined && body.expected_revision !== existing.revision) return err('Transaction changed; reload before saving', 409)
        if (existing.is_locked === 1 && role !== 'admin' && role !== 'broker') {
          return err('This transaction is locked by an administrator and cannot be modified.', 403)
        }

        const nextName = body.name ?? existing.name
        const nextType = body.type ?? existing.type
        const nextStatus = body.status !== undefined
          ? normalizeTransactionStatus(body.status)
          : normalizeTransactionStatus(existing.status)
        if (!nextStatus) return err('Unknown transaction status.', 400)
        if (!workflowPhases(existing.workflow_key).includes(nextStatus)) return err('Stage is not part of this deal workflow', 400)
        let nextPrice = body.price !== undefined ? body.price : existing.price
        if (existing.financials_version > 0 && nextStatus !== existing.status) {
          const saved = await env.DB.prepare('SELECT data_json FROM deal_financial_versions WHERE tenant_id=? AND transaction_id=? AND version=?').bind(tenantId,txId,existing.financials_version).first<{ data_json: string }>()
          if (saved) {
            const f = JSON.parse(saved.data_json)
            const key = nextStatus === 'closed' ? 'sold' : ['under_contract','board_package','closing_prep'].includes(nextStatus) ? 'contract' : 'listing'
            nextPrice = f.prices[key] === null ? null : f.prices[key] / 100
            writes.push(env.DB.prepare('UPDATE transactions SET financial_price_label=? WHERE id=? AND tenant_id=?').bind(key === 'listing' ? 'Asking' : key === 'contract' ? 'Contract' : 'Sold',txId,tenantId))
          }
        }
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
        const nextOfferAcceptedDate = body.offer_accepted_date !== undefined ? body.offer_accepted_date : existing.offer_accepted_date
        const nextPendingDate = body.pending_date !== undefined ? body.pending_date : existing.pending_date
        const nextHomeInspectionDate = body.home_inspection_date !== undefined ? body.home_inspection_date : existing.home_inspection_date
        const nextPossessionDate = body.possession_date !== undefined ? body.possession_date : existing.possession_date
        const nextEscrowDate = body.escrow_date !== undefined ? body.escrow_date : existing.escrow_date
        const nextInspectionDeadline = body.inspection_deadline !== undefined ? body.inspection_deadline : existing.inspection_deadline
        const nextAppraisalDate = body.appraisal_date !== undefined ? body.appraisal_date : existing.appraisal_date
        const nextClosingDate = body.closing_date !== undefined ? body.closing_date : existing.closing_date

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
        if (nextStatus === 'closed' && !isDateOnly(nextActualCloseDate)) {
          // Auto-default to today's date if not specified
          nextActualCloseDate = new Date().toISOString().slice(0, 10)
        }
        if (nextStatus !== 'closed') {
          nextActualCloseDate = null
        }

        // Reopen guard & stage regression checker
        if (body.status !== undefined && body.status !== existing.status) {
          if (!canTransitionTransaction(existing.status, nextStatus, role)) {
            return err(`The transaction cannot move from ${existing.status} to ${nextStatus}.`, 400)
          }
          const existingIndex = transactionStageIndex(existing.status)
          const nextIndex = transactionStageIndex(nextStatus)
          if (nextIndex < existingIndex) {
            // Stage regression or reopening occurs
            if (existing.status === 'closed' && role !== 'admin' && role !== 'broker' && existing.assigned_to !== effectiveUserId) {
              return err('Stage-Gate Compliance: Closed transactions can only be reopened by the deal owner, a broker, or administrator.', 403)
            }
            // Log audit log event into transaction_outcomes
            const u = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(userId).first<any>()
            const userName = u?.name || 'Authorized User'
            const outcomeId = crypto.randomUUID()
            writes.push(env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, acted_as_assistant_for, assistant_assignment_id, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?, ?, datetime("now"))
          `).bind(
            outcomeId,
            txId,
            tenantId,
            userId,
            existing.status === 'closed'
              ? `[Audit Log] Closed transaction reopened to ${nextStatus.toUpperCase()} by ${userName}.`
              : `[Audit Log] Stage moved from ${existing.status.toUpperCase()} to ${nextStatus.toUpperCase()} by ${userName}.`,
            isAssistant ? effectiveUserId : null,
            isAssistant ? (assignmentId || null) : null
          ))
          }
        }

        // Stage-gate compliance audit: notify broker if closing with pending items without blocking the agent
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
          }, complianceTasks, existing.workflow_key)

          if (!gate.allowed && body.status === 'closed') {
            await createNotification(env.DB, tenantId, `Compliance notice: Deal "${nextName ?? existing.name ?? 'Deal'}" marked closed with pending items: ${gate.missing.join('; ')}`)
          }
        }

        if (body.notes !== undefined && body.notes !== existing.notes && body.notes) {
          const outcomeId = crypto.randomUUID()
          writes.push(env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime("now"))
          `).bind(outcomeId, txId, tenantId, userId, `[Notes Update] ${body.notes}`))
        }
        if (body.earnest_money_notes !== undefined && body.earnest_money_notes !== existing.earnest_money_notes && body.earnest_money_notes) {
          const outcomeId = crypto.randomUUID()
          writes.push(env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime("now"))
          `).bind(outcomeId, txId, tenantId, userId, `[Earnest Money Note] ${body.earnest_money_notes}`))
        }
        if (body.deal_failure_notes !== undefined && body.deal_failure_notes !== existing.deal_failure_notes && body.deal_failure_notes) {
          const outcomeId = crypto.randomUUID()
          writes.push(env.DB.prepare(`
            INSERT INTO transaction_outcomes (id, transaction_id, tenant_id, user_id, message, is_broker_advice, created_at)
            VALUES (?, ?, ?, ?, ?, 0, datetime("now"))
          `).bind(outcomeId, txId, tenantId, userId, `[Deal Failure Note] ${body.deal_failure_notes}`))
        }

        writes.push(env.DB.prepare(`
          UPDATE transactions
          SET name = ?, type = ?, status = ?, price = ?, commission_amount = ?, commission_rate = ?,
              target_close_date = ?, actual_close_date = ?, agreement_type = ?, agreement_expiration_date = ?, parties_involved = ?,
              is_locked = ?, listed_date = ?, expire_date = ?, offer_date = ?, pending_date = ?, home_inspection_date = ?, possession_date = ?,
              escrow_date = ?, inspection_deadline = ?, appraisal_date = ?, offer_accepted_date = ?, closing_date = ?,
              earnest_money_amount = ?, earnest_money_status = ?, earnest_money_notes = ?,
              commission_split_buyer_percent = ?, commission_split_co_broker_percent = ?, commission_split_referral_percent = ?,
              repair_credit = ?, attorney_review_start_date = ?, attorney_review_status = ?,
              deal_failure_reason = ?, deal_failure_notes = ?,
              post_occupancy_deadline = ?, post_occupancy_daily_rate = ?, post_occupancy_escrow_held = ?,
              updated_by_assistant = ?, assistant_assignment_id = ?,
              revision = CASE WHEN revision = ? THEN revision + 1 ELSE -1 END,
              updated_at = datetime("now")
          WHERE id = ? AND tenant_id = ?
        `).bind(
          nextName ?? existing.name ?? 'Untitled Deal',
          nextType ?? existing.type ?? 'sale',
          nextStatus ?? 'lead',
          nextPrice ?? null, nextCommissionAmount ?? null, nextCommissionRate ?? null,
          nextTargetCloseDate ?? null, nextActualCloseDate ?? null, nextAgreementType ?? null, nextAgreementExpirationDate ?? null, nextPartiesInvolved ?? null,
          nextIsLocked, nextListedDate ?? null, nextExpireDate ?? null, nextOfferDate ?? null, nextPendingDate ?? null, nextHomeInspectionDate ?? null, nextPossessionDate ?? null,
          nextEscrowDate ?? null, nextInspectionDeadline ?? null, nextAppraisalDate ?? null, nextOfferAcceptedDate ?? null, nextClosingDate ?? null,
          nextEarnestMoneyAmount ?? null, nextEarnestMoneyStatus ?? null, nextEarnestMoneyNotes ?? null,
          nextCommissionSplitBuyerPercent ?? null, nextCommissionSplitCoBrokerPercent ?? null, nextCommissionSplitReferralPercent ?? null,
          nextRepairCredit ?? null, nextAttorneyReviewStartDate ?? null, nextAttorneyReviewStatus ?? null,
          nextDealFailureReason ?? null, nextDealFailureNotes ?? null,
          nextPostOccupancyDeadline ?? null, nextPostOccupancyDailyRate ?? null, nextPostOccupancyEscrowHeld ?? null,
          isAssistant ? 1 : 0, isAssistant ? (assignmentId || null) : null,
          existing.revision ?? 0, txId, tenantId
        ))

        // Outline links and delegated audit commit with the business update.
        if (body.parties_involved !== undefined && typeof nextPartiesInvolved === 'string') {
          let outline: unknown
          try { outline = JSON.parse(nextPartiesInvolved) } catch { /* legacy free-text outline */ }
          if (outline && typeof outline === 'object' && !Array.isArray(outline)) {
            if (isAssistant && !canAccessContacts) return err('Contact access required to synchronize outline parties',403)
            writes.push(...await outlinePosting(env.DB,tenantId,existing.assigned_to || effectiveUserId || userId,txId,outline as Record<string,unknown>))
          }
        }
        if (isAssistant) writes.push(env.DB.prepare(`INSERT INTO transaction_outcomes
          (id,transaction_id,tenant_id,user_id,message,is_broker_advice,acted_as_assistant_for,assistant_assignment_id,created_at)
          VALUES(?,?,?,?,?,0,?,?,datetime('now'))`).bind(newId(),txId,tenantId,userId,'[Delegated Update] Deal updated by assistant',effectiveUserId,assignmentId || null))

        // Deal, earned compensation, and CRM lifecycle share one D1 database.
        // The batch also rolls back the deal if any consequence fails.
        if (!existing.financials_version && existing.assigned_to && (nextStatus !== existing.status || nextCommissionAmount !== existing.commission_amount || nextActualCloseDate !== existing.actual_close_date)) {
          writes.push(...await commissionPosting(env.DB, {
            tenantId, transactionId: txId, agentId: existing.assigned_to, actorId: userId,
            revision: existing.revision + 1, closed: nextStatus === 'closed', closeDate: nextActualCloseDate,
            gross: nextCommissionAmount,
          }))
        }
        if (existing.financials_version > 0 && existing.status === 'closed' && nextStatus !== 'closed') writes.push(...await reopenFinancials(env.DB, tenantId, txId, userId))
        if (nextStatus === 'closed') {
          writes.push(env.DB.prepare(`UPDATE contacts SET lifecycle_stage = 'past_client', updated_at = datetime('now')
            WHERE tenant_id = ? AND lifecycle_stage = 'active_client' AND id IN (
              SELECT contact_id FROM transaction_parties WHERE transaction_id = ? AND tenant_id = ?
                AND (is_primary = 1 OR role IN ('buyer', 'seller', 'landlord', 'tenant'))
            ) AND NOT EXISTS (
              SELECT 1 FROM transaction_parties p JOIN transactions t ON t.id = p.transaction_id AND t.tenant_id = p.tenant_id
              WHERE p.contact_id = contacts.id AND p.tenant_id = contacts.tenant_id AND t.id <> ?
                AND t.is_active = 1 AND t.status NOT IN ('closed', 'fallen_through', 'cancelled', 'archived')
            )`).bind(tenantId, txId, tenantId, txId))
        }
        await env.DB.batch(writes)

        return ok({ success: true })
      }

      // Delete transaction (DELETE /api/transactions/:id)
      if (txSingleMatch && method === 'DELETE') {
        const txId = txSingleMatch[1]
        // Allow admin, broker, or the deal's original creator/owner
        if (!['admin', 'broker'].includes(role)) {
          const existingTx = await env.DB
            .prepare('SELECT assigned_to FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1')
            .bind(txId, tenantId)
            .first<any>()
          if (!existingTx) return err('Deal not found', 404)
          if (existingTx.assigned_to !== userId) {
            return err('You can only delete deals you created. Ask a broker or admin to delete other deals.', 403)
          }
        }
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
        const tx = await env.DB.prepare('SELECT is_locked,assigned_to FROM transactions WHERE id = ? AND tenant_id = ? AND is_active = 1').bind(txId, tenantId).first<any>()
        if (!tx) return err('Deal not found', 404)
        if (!['admin','broker'].includes(role) && tx.assigned_to !== effectiveUserId) {
          const member = await env.DB.prepare('SELECT 1 FROM transaction_team WHERE transaction_id=? AND user_id=?').bind(txId,effectiveUserId).first()
          if (!member) return err('Deal not found',404)
        }
        if (tx && tx.is_locked === 1 && role !== 'admin' && role !== 'broker') {
          return err('This transaction is locked by an administrator and offers cannot be modified.', 403)
        }

        const id = offer.id && !offer.id.startsWith('offer_') ? offer.id : newId()
        const existingOffer = await env.DB.prepare('SELECT tenant_id,transaction_id FROM transaction_offers WHERE id=?').bind(id).first<any>()
        if (existingOffer && (existingOffer.tenant_id !== tenantId || existingOffer.transaction_id !== txId)) return err('Offer not found',404)
        const purchaserName = (offer.purchaserName || 'Unnamed Purchaser').trim()

        let purchasePrice = 0
        if (typeof offer.purchasePrice === 'number') {
          purchasePrice = offer.purchasePrice
        } else if (typeof offer.purchasePrice === 'string') {
          purchasePrice = Number(offer.purchasePrice.replace(/[^0-9.]/g, '')) || 0
        }

        const offerDate = offer.offerDate || new Date().toISOString().substring(0, 10)
        const offerType = offer.offerType || 'sales_agreement'
        const status = offer.status || 'pending'

        const detailObj = { ...offer, id, status }
        const detailsJson = JSON.stringify(detailObj)

        const offerWrites: D1PreparedStatement[] = []
        if (status === 'accepted') offerWrites.push(env.DB.prepare("UPDATE transaction_offers SET status='pending',details_json=json_set(details_json,'$.status','pending'),updated_at=datetime('now') WHERE tenant_id=? AND transaction_id=? AND id!=? AND status='accepted'").bind(tenantId,txId,id))
        offerWrites.push(env.DB.prepare(`
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
          .bind(id, txId, tenantId, purchaserName, purchasePrice, offerDate, offerType, status, detailsJson))
        await env.DB.batch(offerWrites)

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
