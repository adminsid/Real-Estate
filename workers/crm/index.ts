/**
 * RE CRM Worker (re-crm)
 *
 * This worker is a private service — it is ONLY accessible via a Service Binding
 * from the re-workspace gateway. It is never publicly exposed.
 *
 * Auth context is injected by the gateway via trusted headers:
 *   X-User-Id      — verified user ID
 *   X-Tenant-Id    — verified tenant ID
 *   X-User-Role    — verified user role
 *
 * All queries are automatically scoped to tenant_id.
 */

import type { D1Database } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function ok<T>(data: T): Response { return json({ success: true, data }, 200) }
function err(message: string, status = 400): Response { return json({ success: false, error: message }, status) }

function newId(): string { return crypto.randomUUID() }

// ── Auth context from gateway headers ────────────────────────────────────────

interface Ctx {
  userId: string
  tenantId: string
  role: string
  // Assistant delegation context
  isAssistant: boolean
  principalId: string | null
  assignmentId: string | null
  canAccessTransactions: boolean
  canAccessContacts: boolean
}

function getCtx(request: Request): Ctx | null {
  const userId   = request.headers.get('X-User-Id')
  const tenantId = request.headers.get('X-Tenant-Id')
  const role     = request.headers.get('X-User-Role')
  if (!userId || !tenantId || !role) return null

  const isAssistant = role === 'assistant'
  const principalId = isAssistant ? request.headers.get('X-Internal-Principal-Id') : null
  const assignmentId = isAssistant ? request.headers.get('X-Internal-Assignment-Id') : null
  const canAccessTransactions = isAssistant ? request.headers.get('X-Internal-Can-Transactions') === '1' : true
  const canAccessContacts = isAssistant ? request.headers.get('X-Internal-Can-Contacts') === '1' : true

  if (isAssistant) {
    if (!principalId || !assignmentId) return null
  }

  return { userId, tenantId, role, isAssistant, principalId, assignmentId, canAccessTransactions, canAccessContacts }
}

// ── Contact row type ──────────────────────────────────────────────────────────

interface ContactRow {
  id: string; tenant_id: string; assigned_to: string | null
  first_name: string; last_name: string; email: string | null; phone: string | null
  type: string; status: string; source: string | null; notes: string | null
  tags: string | null; address: string | null; is_active: number
  created_at: string; updated_at: string
}

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  is_active: number
}

interface MailingListRow {
  id: string
  tenant_id: string
  name: string
  description: string | null
  channel: string
  is_active: number
  created_by: string
  created_at: string
  updated_at: string
}

function formatContact(row: ContactRow) {
  return {
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const head = headers.join(',')
  const body = rows.map((r) => headers.map((h) => csvCell(r[h])).join(',')).join('\n')
  return `${head}\n${body}`
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ════════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const ctx = getCtx(request)
    if (!ctx) {
      return err('Missing auth context — this worker must be called via Service Binding', 401)
    }

    const url  = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // Assistant scope check
    if (ctx.isAssistant && !ctx.canAccessContacts) {
      return err('Forbidden: assistant has no contacts scope', 403)
    }

    // For assistant, use principalId for data ownership
    const effectiveUserId = ctx.isAssistant ? ctx.principalId : ctx.userId

    const url  = new URL(request.url)
    const path = url.pathname
    const method = request.method

    // ── List contacts ─────────────────────────────────────────────────────
    // GET /api/contacts
    if (path === '/api/contacts' && method === 'GET') {
      const page   = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1'))
      const limit  = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50'))
      const offset = (page - 1) * limit
      const search = url.searchParams.get('q') ?? ''
      const type   = url.searchParams.get('type') ?? ''
      const status = url.searchParams.get('status') ?? ''
      const leadStage = url.searchParams.get('lead_stage') ?? ''
      const assignedTo = url.searchParams.get('assigned_to') ?? ''

      let query = 'SELECT * FROM contacts WHERE tenant_id = ? AND is_active = 1'
      const params: (string | number)[] = [ctx.tenantId]

      if (search) { query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR address LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
      if (type)   { query += ' AND type = ?'; params.push(type) }
      if (status) { query += ' AND status = ?'; params.push(status) }
      if (leadStage) {
        if (leadStage === 'overdue') {
          query += " AND (next_follow_up_date IS NOT NULL AND date(next_follow_up_date) < date('now'))"
        } else if (leadStage === 'needs_follow_up') {
          query += " AND (next_follow_up_date IS NOT NULL AND date(next_follow_up_date) = date('now'))"
        } else {
          query += ' AND lead_stage = ?'
          params.push(leadStage)
        }
      }
      // Assistant: filter to principal's contacts only
      if (ctx.isAssistant) {
        query += ' AND assigned_to = ?'
        params.push(ctx.principalId!)
      } else if (!['admin','broker'].includes(ctx.role) || assignedTo) {
        query += ' AND assigned_to = ?'
        params.push(assignedTo || ctx.userId)
      }

      query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const rows  = await env.DB.prepare(query).bind(...params).all<ContactRow>()

      // Count total (without pagination)
      let countQuery = 'SELECT COUNT(*) as cnt FROM contacts WHERE tenant_id = ? AND is_active = 1'
      const countParams: (string | number)[] = [ctx.tenantId]
      if (search) { countQuery += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ? OR address LIKE ?)'; countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) }
      if (type)   { countQuery += ' AND type = ?'; countParams.push(type) }
      if (status) { countQuery += ' AND status = ?'; countParams.push(status) }
      if (leadStage) {
        if (leadStage === 'overdue') {
          countQuery += " AND (next_follow_up_date IS NOT NULL AND date(next_follow_up_date) < date('now'))"
        } else if (leadStage === 'needs_follow_up') {
          countQuery += " AND (next_follow_up_date IS NOT NULL AND date(next_follow_up_date) = date('now'))"
        } else {
          countQuery += ' AND lead_stage = ?'
          countParams.push(leadStage)
        }
      }
      if (ctx.isAssistant) {
        countQuery += ' AND assigned_to = ?'
        countParams.push(ctx.principalId!)
      } else if (!['admin','broker'].includes(ctx.role) || assignedTo) {
        countQuery += ' AND assigned_to = ?'
        countParams.push(assignedTo || ctx.userId)
      }
      const total = await env.DB.prepare(countQuery).bind(...countParams).first<{ cnt: number }>()

      return ok({ contacts: rows.results.map(formatContact), total: total?.cnt ?? 0, page, limit })
    }

    // ── Create contact / lead ───────────────────────────────────────────────
    // POST /api/contacts
    if (path === '/api/contacts' && method === 'POST') {
      const body = await request.json<{
        firstName: string; lastName: string; email?: string; phone?: string
        type?: string; status?: string; source?: string; notes?: string
        tags?: string[]; address?: string; assignedTo?: string
        timeline?: string; budgetMin?: number; budgetMax?: number
        financingReadiness?: string; moveDate?: string; sellerMotivation?: string
        representationStatus?: string; urgency?: string; preferredContactMethod?: string
        language?: string; nextFollowUpDate?: string; nextAction?: string; leadStage?: string
      }>()

      if (!body.firstName || !body.lastName) return err('First name and last name are required')

      // Assistant: force assigned_to to principal_id
      const effectiveUserId = ctx.isAssistant ? ctx.principalId! : ctx.userId
      const assignedTo = ctx.isAssistant ? ctx.principalId! : (body.assignedTo ?? ctx.userId)
      const leadStage = body.leadStage ?? (body.nextFollowUpDate ? 'needs_follow_up' : 'new')
      const createdByAssistant = ctx.isAssistant ? 1 : 0

      const id = `con_${newId().replace(/-/g, '').slice(0, 12)}`
      await env.DB
        .prepare(`INSERT INTO contacts
          (id, tenant_id, assigned_to, first_name, last_name, email, phone, type, status, source, notes, tags, address,
           timeline, budget_min, budget_max, financing_readiness, move_date, seller_motivation, representation_status,
           urgency, preferred_contact_method, language, next_follow_up_date, next_action, lead_stage,
           created_by_assistant, assistant_assignment_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id, ctx.tenantId, assignedTo,
          body.firstName.trim(), body.lastName.trim(),
          body.email ?? null, body.phone ?? null,
          body.type ?? 'buyer', body.status ?? 'prospect',
          body.source ?? null, body.notes ?? null,
          body.tags ? JSON.stringify(body.tags) : null,
          body.address ?? null,
          body.timeline ?? null, body.budgetMin ?? null, body.budgetMax ?? null,
          body.financingReadiness ?? null, body.moveDate ?? null, body.sellerMotivation ?? null,
          body.representationStatus ?? null, body.urgency ?? null, body.preferredContactMethod ?? null,
          body.language ?? null, body.nextFollowUpDate ?? null, body.nextAction ?? null, leadStage,
          createdByAssistant, ctx.isAssistant ? ctx.assignmentId : null
        )
        .run()

      // Audit log for delegated creation
      if (ctx.isAssistant) {
        const auditId = `aud_${newId().replace(/-/g, '').slice(0, 12)}`
        await env.DB.prepare(`
          INSERT INTO contact_audit_log (id, contact_id, tenant_id, user_id, acted_as_assistant_for, assistant_assignment_id, action, field_changes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'create', ?, datetime('now'))
        `).bind(newId(), id, ctx.tenantId, ctx.userId, ctx.principalId!, ctx.assignmentId!, JSON.stringify({ created: { new: { firstName: body.firstName, lastName: body.lastName, email: body.email } } })).run()
      }

      if (body.notes) {
        const activityId = `act_${newId().replace(/-/g, '').slice(0, 12)}`
        await env.DB.prepare(`
          INSERT INTO contact_activities (id, contact_id, tenant_id, user_id, type, title, body, occurred_at)
          VALUES (?, ?, ?, ?, 'note', 'Initial Note', ?, datetime('now'))
        `).bind(activityId, id, ctx.tenantId, ctx.isAssistant ? ctx.principalId! : ctx.userId, body.notes).run()
      }

      const contact = await env.DB
        .prepare('SELECT * FROM contacts WHERE id = ?')
        .bind(id)
        .first<ContactRow>()

      return json({ success: true, data: { contact: formatContact(contact!) } }, 201)
    }

    // ── Stats ─────────────────────────────────────────────────────────────
    // GET /api/contacts/stats
    if (path === '/api/contacts/stats' && method === 'GET') {
      const assignedTo = url.searchParams.get('assigned_to') ?? ''
      let base = 'FROM contacts WHERE tenant_id = ? AND is_active = 1'
      const params: string[] = [ctx.tenantId]
      if (assignedTo) {
        if (!['admin', 'broker'].includes(ctx.role) && assignedTo !== ctx.userId) {
          return err('Forbidden assigned_to filter', 403)
        }
        base += ' AND assigned_to = ?'
        params.push(assignedTo)
      } else if (!['admin','broker'].includes(ctx.role)) {
        base += ' AND assigned_to = ?'
        params.push(ctx.userId)
      }

      const [total, active, prospects, closed, overdue, needsFollowUp, qualified, newLeads] = await Promise.all([
        env.DB.prepare(`SELECT COUNT(*) as n ${base}`).bind(...params).first<{ n: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as n ${base} AND status = 'active'`).bind(...params).first<{ n: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as n ${base} AND status = 'prospect'`).bind(...params).first<{ n: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as n ${base} AND status = 'closed'`).bind(...params).first<{ n: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as n ${base} AND (next_follow_up_date IS NOT NULL AND date(next_follow_up_date) < date('now'))`).bind(...params).first<{ n: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as n ${base} AND (next_follow_up_date IS NOT NULL AND date(next_follow_up_date) = date('now'))`).bind(...params).first<{ n: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as n ${base} AND lead_stage = 'qualified'`).bind(...params).first<{ n: number }>(),
        env.DB.prepare(`SELECT COUNT(*) as n ${base} AND lead_stage = 'new'`).bind(...params).first<{ n: number }>(),
      ])

      return ok({
        total: total?.n ?? 0,
        active: active?.n ?? 0,
        prospects: prospects?.n ?? 0,
        closed: closed?.n ?? 0,
        overdue: overdue?.n ?? 0,
        needsFollowUp: needsFollowUp?.n ?? 0,
        qualified: qualified?.n ?? 0,
        newLeads: newLeads?.n ?? 0,
      })
    }

    // GET /api/contacts/tools/users
    if (path === '/api/contacts/tools/users' && method === 'GET') {
      if (!['admin', 'broker'].includes(ctx.role)) {
        return err('Only brokers/admins can view assignment targets', 403)
      }

      const users = await env.DB
        .prepare('SELECT id, name, email, role, is_active FROM users WHERE tenant_id = ? AND is_active = 1 ORDER BY name ASC')
        .bind(ctx.tenantId)
        .all<UserRow>()

      return ok((users.results || []).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })))
    }

    // POST /api/contacts/bulk/assign
    if (path === '/api/contacts/bulk/assign' && method === 'POST') {
      if (!['admin', 'broker'].includes(ctx.role)) {
        return err('Only brokers/admins can assign contacts', 403)
      }

      const body = await request.json<{ contactIds?: string[]; assignedTo?: string }>()
      const contactIds = Array.isArray(body.contactIds) ? body.contactIds.filter(Boolean) : []
      if (contactIds.length === 0) return err('No contacts selected', 400)
      if (!body.assignedTo) return err('assignedTo is required', 400)

      const assignee = await env.DB
        .prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(body.assignedTo, ctx.tenantId)
        .first<{ id: string }>()
      if (!assignee) return err('Target user not found', 404)

      const stmt = env.DB.prepare('UPDATE contacts SET assigned_to = ?, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ? AND is_active = 1')
      await env.DB.batch(contactIds.map((id) => stmt.bind(body.assignedTo, id, ctx.tenantId)))

      return ok({ updated: contactIds.length })
    }

    // POST /api/contacts/bulk/export
    if (path === '/api/contacts/bulk/export' && method === 'POST') {
      const body = await request.json<{ contactIds?: string[]; q?: string; type?: string; status?: string }>()

      const contactIds = Array.isArray(body.contactIds) ? body.contactIds.filter(Boolean) : []
      let query = 'SELECT * FROM contacts WHERE tenant_id = ? AND is_active = 1'
      const params: (string | number)[] = [ctx.tenantId]

      if (!['admin', 'broker'].includes(ctx.role)) {
        query += ' AND assigned_to = ?'
        params.push(ctx.userId)
      }

      if (contactIds.length > 0) {
        query += ` AND id IN (${contactIds.map(() => '?').join(',')})`
        params.push(...contactIds)
      } else {
        if (body.q) {
          query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)'
          params.push(`%${body.q}%`, `%${body.q}%`, `%${body.q}%`, `%${body.q}%`)
        }
        if (body.type) {
          query += ' AND type = ?'
          params.push(body.type)
        }
        if (body.status) {
          query += ' AND status = ?'
          params.push(body.status)
        }
      }

      query += ' ORDER BY updated_at DESC'

      const rows = await env.DB.prepare(query).bind(...params).all<ContactRow>()
      const contacts = (rows.results || []).map((r) => formatContact(r))

      const csv = toCsv(
        contacts.map((c) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email || '',
          phone: c.phone || '',
          type: c.type,
          status: c.status,
          source: c.source || '',
          assigned_to: c.assigned_to || '',
          address: c.address || '',
          tags: Array.isArray(c.tags) ? c.tags.join('|') : '',
          notes: c.notes || '',
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),
        ['id', 'first_name', 'last_name', 'email', 'phone', 'type', 'status', 'source', 'assigned_to', 'address', 'tags', 'notes', 'created_at', 'updated_at']
      )

      return ok({
        filename: `contacts-export-${new Date().toISOString().slice(0, 10)}.csv`,
        csv,
        count: contacts.length,
      })
    }

    // POST /api/contacts/bulk/delete
    if (path === '/api/contacts/bulk/delete' && method === 'POST') {
      const body = await request.json<{ contactIds?: string[] }>()
      const contactIds = Array.isArray(body.contactIds) ? body.contactIds.filter(Boolean) : []
      if (contactIds.length === 0) return err('No contacts selected', 400)

      let allowedIds = contactIds
      if (!['admin', 'broker'].includes(ctx.role)) {
        const checks = await env.DB
          .prepare(`SELECT id FROM contacts WHERE tenant_id = ? AND is_active = 1 AND assigned_to = ? AND id IN (${contactIds.map(() => '?').join(',')})`)
          .bind(ctx.tenantId, ctx.userId, ...contactIds)
          .all<{ id: string }>()
        allowedIds = (checks.results || []).map((r) => r.id)
      }

      if (allowedIds.length === 0) return err('No eligible contacts found for delete', 403)

      const stmt = env.DB.prepare('UPDATE contacts SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ? AND is_active = 1')
      await env.DB.batch(allowedIds.map((id) => stmt.bind(id, ctx.tenantId)))

      return ok({ deleted: allowedIds.length })
    }

    // GET /api/contacts/lists
    if (path === '/api/contacts/lists' && method === 'GET') {
      const isAdminOrBroker = ['admin', 'broker'].includes(ctx.role)
      const createdByFilter = url.searchParams.get('created_by') ?? ''
      let where = 'l.tenant_id = ? AND l.is_active = 1'
      const params: (string | number)[] = [ctx.tenantId]
      if (!isAdminOrBroker) {
        where += ' AND (l.created_by = ? OR l.is_shared = 1 OR EXISTS (SELECT 1 FROM mailing_list_shares mls WHERE mls.list_id = l.id AND mls.user_id = ?))'
        params.push(ctx.userId, ctx.userId)
      } else if (createdByFilter === 'me') {
        where += ' AND l.created_by = ?'
        params.push(ctx.userId)
      } else if (createdByFilter && createdByFilter !== 'all') {
        where += ' AND l.created_by = ?'
        params.push(createdByFilter)
      }

      const lists = await env.DB
        .prepare(`
          SELECT l.*, u.name as created_by_name, COUNT(DISTINCT m.id) as member_count
          FROM mailing_lists l
          LEFT JOIN mailing_list_members m ON m.list_id = l.id AND m.tenant_id = l.tenant_id
          JOIN users u ON u.id = l.created_by
          WHERE ${where}
          GROUP BY l.id
          ORDER BY l.updated_at DESC
        `)
        .bind(...params)
        .all<any>()

      return ok(lists.results || [])
    }

    // POST /api/contacts/lists
    if (path === '/api/contacts/lists' && method === 'POST') {
      const body = await request.json<{ name?: string; description?: string; channel?: string; isShared?: boolean }>()
      if (!body.name || !body.name.trim()) return err('List name is required', 400)

      const id = `ml_${newId().replace(/-/g, '').slice(0, 12)}`
      await env.DB
        .prepare(`
          INSERT INTO mailing_lists (id, tenant_id, name, description, channel, created_by, is_shared)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(id, ctx.tenantId, body.name.trim(), body.description ?? null, body.channel ?? 'email', ctx.userId, body.isShared ? 1 : 0)
        .run()

      return ok({ id })
    }

    const listMatch = path.match(/^\/api\/contacts\/lists\/([^/]+)$/)
    if (listMatch && method === 'PUT') {
      const listId = listMatch[1]
      const body = await request.json<{ name?: string; description?: string; channel?: string; is_shared?: number; is_active?: number }>()

      await env.DB
        .prepare(`
          UPDATE mailing_lists
          SET name = COALESCE(?, name),
              description = COALESCE(?, description),
              channel = COALESCE(?, channel),
              is_shared = COALESCE(?, is_shared),
              is_active = COALESCE(?, is_active),
              updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `)
        .bind(body.name ?? null, body.description ?? null, body.channel ?? null, body.is_shared ?? null, body.is_active ?? null, listId, ctx.tenantId)
        .run()

      return ok({ updated: true })
    }

    if (listMatch && method === 'DELETE') {
      const listId = listMatch[1]
      await env.DB.prepare('UPDATE mailing_lists SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').bind(listId, ctx.tenantId).run()
      return ok({ deleted: true })
    }

    const listMembersMatch = path.match(/^\/api\/contacts\/lists\/([^/]+)\/members$/)
    if (listMembersMatch && method === 'GET') {
      const listId = listMembersMatch[1]
      const rows = await env.DB
        .prepare(`
          SELECT c.*, mlm.created_at as added_at
          FROM mailing_list_members mlm
          JOIN contacts c ON c.id = mlm.contact_id AND c.tenant_id = mlm.tenant_id
          WHERE mlm.tenant_id = ? AND mlm.list_id = ? AND c.is_active = 1
          ORDER BY mlm.created_at DESC
        `)
        .bind(ctx.tenantId, listId)
        .all<any>()

      return ok((rows.results || []).map((r: any) => ({ ...formatContact(r), added_at: r.added_at })))
    }

    if (listMembersMatch && method === 'POST') {
      const listId = listMembersMatch[1]
      const body = await request.json<{ contactIds?: string[] }>()
      const contactIds = Array.isArray(body.contactIds) ? body.contactIds.filter(Boolean) : []
      if (contactIds.length === 0) return err('No contacts selected', 400)

      const stmt = env.DB.prepare(`
        INSERT OR IGNORE INTO mailing_list_members (id, tenant_id, list_id, contact_id, added_by)
        VALUES (?, ?, ?, ?, ?)
      `)

      await env.DB.batch(
        contactIds.map((contactId) => stmt.bind(`mlm_${newId().replace(/-/g, '').slice(0, 12)}`, ctx.tenantId, listId, contactId, ctx.userId))
      )

      await env.DB.prepare('UPDATE mailing_lists SET updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').bind(listId, ctx.tenantId).run()
      return ok({ added: contactIds.length })
    }

    const removeMemberMatch = path.match(/^\/api\/contacts\/lists\/([^/]+)\/members\/([^/]+)$/)
    if (removeMemberMatch && method === 'DELETE') {
      const listId = removeMemberMatch[1]
      const contactId = removeMemberMatch[2]
      await env.DB
        .prepare('DELETE FROM mailing_list_members WHERE tenant_id = ? AND list_id = ? AND contact_id = ?')
        .bind(ctx.tenantId, listId, contactId)
        .run()

      await env.DB.prepare('UPDATE mailing_lists SET updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').bind(listId, ctx.tenantId).run()
      return ok({ removed: true })
    }

    // ── List Shares ──────────────────────────────────────────────────────────
    const listSharesMatch = path.match(/^\/api\/contacts\/lists\/([^/]+)\/shares$/)
    if (listSharesMatch && method === 'GET') {
      const listId = listSharesMatch[1]
      const rows = await env.DB
        .prepare(`
          SELECT u.id, u.name, u.email
          FROM mailing_list_shares mls
          JOIN users u ON u.id = mls.user_id
          WHERE mls.tenant_id = ? AND mls.list_id = ?
          ORDER BY u.name ASC
        `)
        .bind(ctx.tenantId, listId)
        .all<{ id: string; name: string; email: string }>()
      return ok(rows.results || [])
    }

    if (listSharesMatch && method === 'PUT') {
      const listId = listSharesMatch[1]
      const body = await request.json<{ userIds: string[] }>()
      if (!Array.isArray(body.userIds)) return err('userIds must be an array', 400)

      const validUsers = await env.DB
        .prepare(`SELECT id FROM users WHERE tenant_id = ? AND is_active = 1 AND id IN (${body.userIds.map(() => '?').join(',')})`)
        .bind(ctx.tenantId, ...body.userIds)
        .all<{ id: string }>()
      const validIds = new Set((validUsers.results || []).map((u) => u.id))

      await env.DB.prepare('DELETE FROM mailing_list_shares WHERE tenant_id = ? AND list_id = ?').bind(ctx.tenantId, listId).run()

      if (validIds.size > 0) {
        const stmt = env.DB.prepare(`
          INSERT INTO mailing_list_shares (id, tenant_id, list_id, user_id)
          VALUES (?, ?, ?, ?)
        `)
        await env.DB.batch(
          Array.from(validIds).map((uid) => stmt.bind(`mls_${newId().replace(/-/g, '').slice(0, 12)}`, ctx.tenantId, listId, uid))
        )
      }

      await env.DB.prepare('UPDATE mailing_lists SET updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').bind(listId, ctx.tenantId).run()
      return ok({ sharedWith: Array.from(validIds) })
    }

    // POST /api/contacts/bulk/add-to-list
    if (path === '/api/contacts/bulk/add-to-list' && method === 'POST') {
      const body = await request.json<{ contactIds?: string[]; listId?: string }>()
      const contactIds = Array.isArray(body.contactIds) ? body.contactIds.filter(Boolean) : []
      if (!body.listId) return err('listId is required', 400)
      if (contactIds.length === 0) return err('No contacts selected', 400)

      const list = await env.DB
        .prepare('SELECT id FROM mailing_lists WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(body.listId, ctx.tenantId)
        .first<{ id: string }>()
      if (!list) return err('Mailing list not found', 404)

      let allowedIds = contactIds
      if (!['admin', 'broker'].includes(ctx.role)) {
        const checks = await env.DB
          .prepare(`SELECT id FROM contacts WHERE tenant_id = ? AND is_active = 1 AND assigned_to = ? AND id IN (${contactIds.map(() => '?').join(',')})`)
          .bind(ctx.tenantId, ctx.userId, ...contactIds)
          .all<{ id: string }>()
        allowedIds = (checks.results || []).map((r) => r.id)
      }

      if (allowedIds.length === 0) return err('No eligible contacts found for this operation', 403)

      const stmt = env.DB.prepare(`
        INSERT OR IGNORE INTO mailing_list_members (id, tenant_id, list_id, contact_id, added_by)
        VALUES (?, ?, ?, ?, ?)
      `)
      await env.DB.batch(
        allowedIds.map((contactId) => stmt.bind(`mlm_${newId().replace(/-/g, '').slice(0, 12)}`, ctx.tenantId, body.listId, contactId, ctx.userId))
      )
      await env.DB.prepare('UPDATE mailing_lists SET updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?').bind(body.listId, ctx.tenantId).run()

      return ok({ added: allowedIds.length })
    }

    // GET /api/contacts/:id/lists
    const contactListsMatch = path.match(/^\/api\/contacts\/([^/]+)\/lists$/)
    if (contactListsMatch && method === 'GET') {
      const contactId = contactListsMatch[1]
      const rows = await env.DB
        .prepare(`
          SELECT l.*
          FROM mailing_lists l
          JOIN mailing_list_members m ON m.list_id = l.id AND m.tenant_id = l.tenant_id
          WHERE l.tenant_id = ? AND l.is_active = 1 AND m.contact_id = ?
          ORDER BY l.name ASC
        `)
        .bind(ctx.tenantId, contactId)
        .all<MailingListRow>()
      return ok(rows.results || [])
    }

    // ── Get single contact ────────────────────────────────────────────────
    // GET /api/contacts/:id
    const contactMatch = path.match(/^\/api\/contacts\/([^/]+)$/)
    if (contactMatch && method === 'GET') {
      const effectiveUserId = ctx.isAssistant ? ctx.principalId! : ctx.userId
      const contact = await env.DB
        .prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(contactMatch[1], ctx.tenantId)
        .first<ContactRow>()
      if (!contact) return err('Contact not found', 404)

      // Agents can only view their own unless broker/admin
      if (!['admin','broker'].includes(ctx.role) && contact.assigned_to !== effectiveUserId) {
        return err('Contact not found', 404)
      }

      // Fetch recent activities
      const activities = await env.DB
        .prepare('SELECT * FROM contact_activities WHERE contact_id = ? ORDER BY occurred_at DESC LIMIT 20')
        .bind(contactMatch[1])
        .all()

      // Fetch associated transactions
      const transactions = await env.DB
        .prepare(`
          SELECT t.id, t.name, t.status, t.type, t.price, t.target_close_date, t.created_at
          FROM transactions t
          JOIN transaction_parties tp ON tp.transaction_id = t.id
          WHERE tp.contact_id = ? AND t.tenant_id = ?
          ORDER BY t.created_at DESC
        `)
        .bind(contactMatch[1], ctx.tenantId)
        .all()

      return ok({ contact: formatContact(contact), activities: activities.results, transactions: transactions.results })
    }

    // ── Update contact ────────────────────────────────────────────────────
    // PUT /api/contacts/:id
    if (contactMatch && method === 'PUT') {
      const existing = await env.DB
        .prepare('SELECT id, assigned_to, notes FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(contactMatch[1], ctx.tenantId)
        .first<{ id: string; assigned_to: string | null; notes: string | null }>()
      if (!existing) return err('Contact not found', 404)
      // Assistant: enforce principal ownership
      const effectiveUserId = ctx.isAssistant ? ctx.principalId! : ctx.userId
      if (!['admin','broker'].includes(ctx.role) && existing.assigned_to !== effectiveUserId) {
        return err('Contact not found', 404)
      }

      const body = await request.json<Record<string, any>>()

      // Build field changes for audit
      const fieldChanges: Record<string, { old: any; new: any }> = {}
      const fields = [
        'firstName', 'lastName', 'email', 'phone', 'type', 'status', 'source', 'notes', 'tags', 'address',
        'assignedTo', 'timeline', 'budgetMin', 'budgetMax', 'financingReadiness', 'moveDate',
        'sellerMotivation', 'representationStatus', 'urgency', 'preferredContactMethod', 'language',
        'nextFollowUpDate', 'nextAction', 'leadStage'
      ]
      for (const f of fields) {
        const bodyKey = f.replace(/([A-Z])/g, '_$1').toLowerCase()
        if (body[f] !== undefined && body[f] !== existing[bodyKey]) {
          fieldChanges[f] = { old: existing[bodyKey], new: body[f] }
        }
      }

      // Assistant: force assigned_to to principal_id (ignore body value)
      const assignedToValue = ctx.isAssistant ? ctx.principalId! : (body.assignedTo ?? existing.assigned_to)
      const updatedByAssistant = ctx.isAssistant ? 1 : 0

      await env.DB
        .prepare(`UPDATE contacts SET
          first_name               = COALESCE(?, first_name),
          last_name                = COALESCE(?, last_name),
          email                    = COALESCE(?, email),
          phone                    = COALESCE(?, phone),
          type                     = COALESCE(?, type),
          status                   = COALESCE(?, status),
          source                   = COALESCE(?, source),
          notes                    = COALESCE(?, notes),
          tags                     = COALESCE(?, tags),
          address                  = COALESCE(?, address),
          assigned_to              = COALESCE(?, assigned_to),
          timeline                 = COALESCE(?, timeline),
          budget_min               = COALESCE(?, budget_min),
          budget_max               = COALESCE(?, budget_max),
          financing_readiness      = COALESCE(?, financing_readiness),
          move_date                = COALESCE(?, move_date),
          seller_motivation        = COALESCE(?, seller_motivation),
          representation_status    = COALESCE(?, representation_status),
          urgency                  = COALESCE(?, urgency),
          preferred_contact_method = COALESCE(?, preferred_contact_method),
          language                 = COALESCE(?, language),
          next_follow_up_date      = COALESCE(?, next_follow_up_date),
          next_action              = COALESCE(?, next_action),
          lead_stage               = COALESCE(?, lead_stage),
          updated_by_assistant     = ?,
          assistant_assignment_id  = ?,
          updated_at               = datetime('now')
          WHERE id = ? AND tenant_id = ?`)
        .bind(
          body.firstName ?? null, body.lastName ?? null,
          body.email ?? null, body.phone ?? null,
          body.type ?? null, body.status ?? null,
          body.source ?? null, body.notes ?? null,
          body.tags ? JSON.stringify(body.tags) : null,
          body.address ?? null,
          assignedToValue,
          body.timeline ?? null, body.budgetMin ?? null, body.budgetMax ?? null,
          body.financingReadiness ?? null, body.moveDate ?? null, body.sellerMotivation ?? null,
          body.representationStatus ?? null, body.urgency ?? null, body.preferredContactMethod ?? null,
          body.language ?? null, body.nextFollowUpDate ?? null, body.nextAction ?? null, body.leadStage ?? null,
          updatedByAssistant, ctx.isAssistant ? ctx.assignmentId : null,
          contactMatch[1], ctx.tenantId,
        )
        .run()

      // Audit log for delegated update
      if (ctx.isAssistant && Object.keys(fieldChanges).length > 0) {
        const auditId = newId()
        await env.DB.prepare(`
          INSERT INTO contact_audit_log (id, contact_id, tenant_id, user_id, acted_as_assistant_for, assistant_assignment_id, action, field_changes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'update', ?, datetime('now'))
        `).bind(auditId, contactMatch[1], ctx.tenantId, ctx.userId, ctx.principalId!, ctx.assignmentId!, JSON.stringify(fieldChanges)).run()
      }

      if (body.notes !== undefined && body.notes !== existing.notes && body.notes) {
        const activityId = `act_${newId().replace(/-/g, '').slice(0, 12)}`
        await env.DB.prepare(`
          INSERT INTO contact_activities (id, contact_id, tenant_id, user_id, type, title, body, occurred_at)
          VALUES (?, ?, ?, ?, 'note', 'Note Updated', ?, datetime('now'))
        `).bind(activityId, contactMatch[1], ctx.tenantId, ctx.isAssistant ? ctx.principalId! : ctx.userId, body.notes).run()
      }

      const updated = await env.DB
        .prepare('SELECT * FROM contacts WHERE id = ?')
        .bind(contactMatch[1])
        .first<ContactRow>()

      return ok({ contact: formatContact(updated!) })
    }

    // ── Merge Contacts ──────────────────────────────────────────────────
    // POST /api/contacts/merge
    if (path === '/api/contacts/merge' && method === 'POST') {
      const body = await request.json<{ targetId?: string; sourceId?: string }>()
      if (!body.targetId || !body.sourceId) return err('targetId and sourceId are required', 400)
      if (body.targetId === body.sourceId) return err('Cannot merge contact into itself', 400)

      const target = await env.DB
        .prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(body.targetId, ctx.tenantId)
        .first<ContactRow>()
      const source = await env.DB
        .prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(body.sourceId, ctx.tenantId)
        .first<ContactRow>()

      if (!target || !source) return err('One or both contacts not found', 404)

      // Move activities from source to target
      await env.DB
        .prepare('UPDATE contact_activities SET contact_id = ? WHERE contact_id = ? AND tenant_id = ?')
        .bind(target.id, source.id, ctx.tenantId)
        .run()

      // Move mailing list memberships from source to target
      await env.DB
        .prepare('UPDATE OR IGNORE mailing_list_members SET contact_id = ? WHERE contact_id = ? AND tenant_id = ?')
        .bind(target.id, source.id, ctx.tenantId)
        .run()

      // Soft delete source contact
      await env.DB
        .prepare('UPDATE contacts SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?')
        .bind(source.id, ctx.tenantId)
        .run()

      // Log merge activity
      const actId = `act_${newId().replace(/-/g, '').slice(0, 12)}`
      await env.DB
        .prepare('INSERT INTO contact_activities (id, contact_id, tenant_id, user_id, type, title, body, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(actId, target.id, ctx.tenantId, ctx.userId, 'note', 'Merged Contact Record', `Merged data from duplicate contact ${source.first_name} ${source.last_name} (${source.email || source.phone || 'No direct info'}).`, new Date().toISOString())
        .run()

      return ok({ merged: true, targetId: target.id })
    }

    // ── Convert Lead to Deal ──────────────────────────────────────────────
    // POST /api/contacts/:id/convert-to-deal
    const convertMatch = path.match(/^\/api\/contacts\/([^/]+)\/convert-to-deal$/)
    if (convertMatch && method === 'POST') {
      const contactId = convertMatch[1]
      const contact = await env.DB
        .prepare('SELECT * FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(contactId, ctx.tenantId)
        .first<ContactRow>()

      if (!contact) return err('Contact not found', 404)

      const body = await request.json<{ dealName?: string; price?: number; type?: string }>()
      const dealId = `tx_${newId().replace(/-/g, '').slice(0, 12)}`
      const dealName = body.dealName || `${contact.first_name} ${contact.last_name} — Deal`
      const price = body.price || contact.budget_max || 500000
      const dealType = body.type || (contact.type === 'seller' ? 'sale' : 'purchase')

      // Insert transaction into D1 database
      await env.DB
        .prepare(`
          INSERT INTO transactions (id, tenant_id, assigned_to, name, type, status, price, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'prospect', ?, datetime('now'), datetime('now'))
        `)
        .bind(dealId, ctx.tenantId, ctx.userId, dealName, dealType, price)
        .run()

      // Insert transaction party linking contact
      const partyId = `txp_${newId().replace(/-/g, '').slice(0, 12)}`
      await env.DB
        .prepare(`
          INSERT INTO transaction_parties (id, tenant_id, transaction_id, contact_id, role)
          VALUES (?, ?, ?, ?, ?)
        `)
        .bind(partyId, ctx.tenantId, dealId, contactId, contact.type === 'seller' ? 'seller' : 'buyer')
        .run()

      // Update lead stage to converted
      await env.DB
        .prepare("UPDATE contacts SET lead_stage = 'converted', status = 'active', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
        .bind(contactId, ctx.tenantId)
        .run()

      // Log activity
      const actId = `act_${newId().replace(/-/g, '').slice(0, 12)}`
      await env.DB
        .prepare('INSERT INTO contact_activities (id, contact_id, tenant_id, user_id, type, title, body, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(actId, contactId, ctx.tenantId, ctx.userId, 'note', 'Converted to Active Deal', `Lead converted into transaction deal "${dealName}".`, new Date().toISOString())
        .run()

      return ok({ dealId, dealName })
    }

    // ── Delete contact (soft) ─────────────────────────────────────────────
    // DELETE /api/contacts/:id
    if (contactMatch && method === 'DELETE') {
      if (ctx.isAssistant) {
        return err('Forbidden: assistants cannot delete contacts', 403)
      }
      const existing = await env.DB
        .prepare('SELECT id, assigned_to FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(contactMatch[1], ctx.tenantId)
        .first<{ id: string; assigned_to: string | null }>()
      if (!existing) return err('Contact not found', 404)
      if (!['admin','broker'].includes(ctx.role) && existing.assigned_to !== ctx.userId) {
        return err('Contact not found', 404)
      }

      await env.DB
        .prepare('UPDATE contacts SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?')
        .bind(contactMatch[1], ctx.tenantId)
        .run()

      return ok({ message: 'Contact deleted' })
    }

    // ── Activities ────────────────────────────────────────────────────────
    // POST /api/contacts/:id/activities
    const actMatch = path.match(/^\/api\/contacts\/([^/]+)\/activities$/)
    if (actMatch && method === 'POST') {
      const contactId = actMatch[1]
      const contact = await env.DB
        .prepare('SELECT id FROM contacts WHERE id = ? AND tenant_id = ?')
        .bind(contactId, ctx.tenantId)
        .first()
      if (!contact) return err('Contact not found', 404)

      const body = await request.json<{ type?: string; title: string; body?: string; occurredAt?: string }>()
      if (!body.title) return err('Title is required')

      const id = `act_${newId().replace(/-/g, '').slice(0, 12)}`
      await env.DB
        .prepare('INSERT INTO contact_activities (id, contact_id, tenant_id, user_id, type, title, body, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, contactId, ctx.tenantId, ctx.userId, body.type ?? 'note', body.title, body.body ?? null, body.occurredAt ?? new Date().toISOString())
        .run()

      return json({ success: true, data: { id, type: body.type ?? 'note', title: body.title } }, 201)
    }

    return err('CRM endpoint not found', 404)
  },
}
