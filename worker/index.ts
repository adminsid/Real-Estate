/**
 * RE Workspace — Cloudflare Worker (Gateway)
 *
 * Serves:
 *   - Static frontend (Workers Sites / KV)
 *   - /api/auth/*  — Authentication + session management
 *   - /api/hr/*    — User management, permissions, invitations, impersonation
 *
 * Future phases will add Service Bindings for:
 *   CRM, Transactions, Network, Storage
 * And fetch() proxies for:
 *   inventory.primeamericarealestate.com, openhouse.primeamericany.com
 */

import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler'
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
const assetManifest = JSON.parse(manifestJSON)

import {
  hashPassword,
  verifyPassword,
  signJWT,
  generateToken,
  newId,
} from './lib/crypto'
import {
  getSession,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
  startImpersonation,
  stopImpersonation,
  authError,
  forbiddenError,
} from './lib/auth'
import {
  serializePermissions,
  can,
  roleAtLeast,
  canImpersonate,
} from './lib/permissions'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendInvitationEmail,
  sendWelcomeEmail,
  sendManualUserWelcomeEmail,
} from './lib/email'
import { resolveOrCreateTenant, getTenant, isPrimeAmericaEmail } from './lib/tenant'

import type { D1Database, KVNamespace, ExecutionContext, Fetcher, R2Bucket } from '@cloudflare/workers-types'

// ── Env ──────────────────────────────────────────────────────────────────────

export interface Env {
  __STATIC_CONTENT: any
  DB: D1Database
  EMAIL_TOKENS_KV: KVNamespace
  EMAIL: { send: (msg: any) => Promise<void> }
  JWT_SECRET: string
  INTERNAL_API_SECRET: string
  APP_NAME: string
  APP_ENV: string
  APP_BASE_URL: string
  FROM_EMAIL: string
  INVENTORY_WORKER_URL: string
  // Service bindings for modules
  CRM: Fetcher
  TRANSACTIONS: Fetcher
  // Storage
  ASSETS_BUCKET: R2Bucket
}

// ── Response helpers ─────────────────────────────────────────────────────────

function json<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

function ok<T>(data: T, extra: Record<string, string> = {}): Response {
  return json({ success: true, data }, 200, extra)
}

function err(message: string, status = 400): Response {
  return json({ success: false, error: message }, status)
}

// ── CORS (for localhost dev) ──────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  const allowed = [
    'https://re-workspace.lama-4db.workers.dev',
    'http://localhost:5173',
    'http://localhost:4173',
  ]
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

// ── KV Token helpers ─────────────────────────────────────────────────────────

const TOKEN_TTL = {
  email_verify: 60 * 60 * 24,     // 24h
  password_reset: 60 * 60,         // 1h
  invitation: 60 * 60 * 24 * 7,   // 7 days
}

async function storeToken(kv: KVNamespace, prefix: string, token: string, value: string, ttl: number) {
  await kv.put(`${prefix}:${token}`, value, { expirationTtl: ttl })
}

async function consumeToken(kv: KVNamespace, prefix: string, token: string): Promise<string | null> {
  const key = `${prefix}:${token}`
  const val = await kv.get(key)
  if (val) await kv.delete(key)
  return val
}

// ── User row type ─────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  tenant_id: string
  email: string
  password_hash: string
  name: string
  role: string
  license_number: string | null
  license_state: string | null
  avatar_url: string | null
  phone: string | null
  title: string | null
  is_active: number
  email_verified: number
  invited_by: string | null
  last_login_at: string | null
  created_at: string
  updated_at: string
}

async function createNotification(db: D1Database, tenantId: string, message: string) {
  const id = crypto.randomUUID()
  await db
    .prepare('INSERT INTO notifications (id, tenant_id, message) VALUES (?, ?, ?)')
    .bind(id, tenantId, message)
    .run()
}

function safeUser(u: UserRow) {
  const { password_hash, ...safe } = u
  return safe
}

// ── Assistant Assignment Resolution ───────────────────────────────────────────
// Resolves active assistant assignment and returns trusted context for workers.
// Caller must be authenticated as role='assistant'.
interface AssistantAssignmentResult {
  assignmentId: string
  principalId: string
  canAccessTransactions: 0 | 1
  canAccessContacts: 0 | 1
  assistantId: string
  principalName: string
}

async function resolveAssistantAssignment(
  db: D1Database,
  assistantId: string,
  tenantId: string
): Promise<AssistantAssignmentResult | null> {
  const row = await db.prepare(`
    SELECT
      aa.id as assignment_id,
      aa.principal_id,
      aa.can_access_transactions,
      aa.can_access_contacts,
      u_assistant.id as assistant_id,
      u_assistant.role as assistant_role,
      u_assistant.is_active as assistant_active,
      u_principal.id as principal_id,
      u_principal.role as principal_role,
      u_principal.is_active as principal_active,
      u_principal.name as principal_name
    FROM assistant_assignments aa
    JOIN users u_assistant ON u_assistant.id = aa.assistant_id
    JOIN users u_principal ON u_principal.id = aa.principal_id
    WHERE aa.assistant_id = ?
      AND aa.tenant_id = ?
      AND aa.status = 'active'
      AND (aa.expires_at IS NULL OR aa.expires_at > datetime('now'))
      AND (aa.can_access_transactions = 1 OR aa.can_access_contacts = 1)
      AND u_assistant.role = 'assistant'
      AND u_assistant.is_active = 1
      AND u_principal.role = 'salesperson'
      AND u_principal.is_active = 1
      AND u_assistant.tenant_id = aa.tenant_id
      AND u_principal.tenant_id = aa.tenant_id
    LIMIT 1
  `).bind(assistantId, tenantId).first<{
    assignment_id: string
    principal_id: string
    can_access_transactions: number
    can_access_contacts: number
    assistant_id: string
    assistant_role: string
    assistant_active: number
    principal_id: string
    principal_role: string
    principal_active: number
    principal_name: string
  }>()

  if (!row) return null

  return {
    assignmentId: row.assignment_id,
    principalId: row.principal_id,
    canAccessTransactions: row.can_access_transactions,
    canAccessContacts: row.can_access_contacts,
    assistantId: row.assistant_id,
    principalName: row.principal_name,
  }
}

interface NyLicenseRow {
  business_name?: string
  business_address_1?: string
  business_city?: string
  business_state?: string
  business_zip?: string
  county?: string
  license_holder_name?: string
  license_expiration_date?: string
  license_number?: string
  license_type?: string
}

function escapeSocrataLiteral(value: string): string {
  return value.replace(/'/g, "''")
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isoDatePart(value?: string | null): string | null {
  if (!value || value.length < 10) return null
  return value.slice(0, 10)
}

async function syncCompanyLicenseDataFromNY(
  db: D1Database,
  tenantId: string,
  companyLicenseNumber: string,
): Promise<{
  businessName: string
  totalAgents: number
  matchedUsers: number
  licenseNumber: string
  licenseHolderName: string | null
  licenseType: string | null
  licenseExpirationDate: string | null
  syncedAt: string
}> {
  const normalizedLicense = companyLicenseNumber.trim().toUpperCase()
  if (!normalizedLicense) {
    throw new Error('Company license number is required for NY dataset sync')
  }

  const fieldSelect = 'business_name,business_address_1,business_city,business_state,business_zip,county,license_holder_name,license_expiration_date,license_number,license_type'
  const whereByLicense = `license_number='${escapeSocrataLiteral(normalizedLicense)}'`
  const lookupUrl = `https://data.ny.gov/resource/yg7h-zjbf.json?$select=${encodeURIComponent(fieldSelect)}&$where=${encodeURIComponent(whereByLicense)}&$limit=5`

  const lookupRes = await fetch(lookupUrl)
  if (!lookupRes.ok) {
    throw new Error('Failed to query NY active license dataset')
  }
  const lookupRows = await lookupRes.json<NyLicenseRow[]>()
  if (!Array.isArray(lookupRows) || lookupRows.length === 0) {
    throw new Error('No NY active record found for the provided company license number')
  }

  const primary = lookupRows[0]
  const businessName = (primary.business_name || '').trim()
  if (!businessName) {
    throw new Error('NY dataset returned an invalid business profile for this license number')
  }

  const whereByBusiness = `upper(business_name)=upper('${escapeSocrataLiteral(businessName)}')`
  const companyUrl = `https://data.ny.gov/resource/yg7h-zjbf.json?$select=${encodeURIComponent(fieldSelect)}&$where=${encodeURIComponent(whereByBusiness)}&$limit=5000`

  const companyRes = await fetch(companyUrl)
  if (!companyRes.ok) {
    throw new Error('Failed to load company agent roster from NY dataset')
  }

  const companyRows = await companyRes.json<NyLicenseRow[]>()
  const dedup = new Map<string, NyLicenseRow>()
  for (const row of Array.isArray(companyRows) ? companyRows : []) {
    const key = (row.license_number || '').trim() || `${row.license_holder_name || ''}|${row.license_type || ''}`
    if (!key) continue
    if (!dedup.has(key)) dedup.set(key, row)
  }

  const agents = Array.from(dedup.values()).sort((a, b) => (a.license_holder_name || '').localeCompare(b.license_holder_name || ''))
  const syncedAt = new Date().toISOString()

  const payload = {
    dataset: 'yg7h-zjbf',
    syncedAt,
    businessName,
    businessAddress: {
      line1: primary.business_address_1 || null,
      city: primary.business_city || null,
      state: primary.business_state || null,
      zip: primary.business_zip || null,
      county: primary.county || null,
    },
    totalAgents: agents.length,
    truncated: agents.length > 1000,
    agents: agents.slice(0, 1000).map((row) => ({
      licenseHolderName: row.license_holder_name || null,
      licenseNumber: row.license_number || null,
      licenseType: row.license_type || null,
      licenseExpirationDate: isoDatePart(row.license_expiration_date),
    })),
  }

  await db
    .prepare(`
      UPDATE tenants
      SET
        company_license_number = ?,
        company_license_holder_name = ?,
        company_license_type = ?,
        company_license_expiration_date = ?,
        company_license_synced_at = ?,
        company_agents_json = ?
      WHERE id = ?
    `)
    .bind(
      normalizedLicense,
      primary.license_holder_name || null,
      primary.license_type || null,
      isoDatePart(primary.license_expiration_date),
      syncedAt,
      JSON.stringify(payload),
      tenantId,
    )
    .run()

  const users = await db
    .prepare('SELECT id, name FROM users WHERE tenant_id = ? AND is_active = 1')
    .bind(tenantId)
    .all<{ id: string; name: string }>()

  let matchedUsers = 0
  for (const user of users.results || []) {
    const userTokens = normalizeName(user.name || '').split(' ').filter(Boolean)
    if (userTokens.length < 2) continue

    const first = userTokens[0]
    const last = userTokens[userTokens.length - 1]
    const matched = agents.find((agent) => {
      const holder = normalizeName(agent.license_holder_name || '')
      return holder.includes(first) && holder.includes(last)
    })

    if (!matched) continue

    await db
      .prepare(`
        UPDATE users
        SET
          license_number = COALESCE(?, license_number),
          license_state = 'NY',
          license_expiration_date = COALESCE(?, license_expiration_date),
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
      `)
      .bind(
        matched.license_number || null,
        isoDatePart(matched.license_expiration_date),
        user.id,
        tenantId,
      )
      .run()

    matchedUsers += 1
  }

  return {
    businessName,
    totalAgents: agents.length,
    matchedUsers,
    licenseNumber: normalizedLicense,
    licenseHolderName: primary.license_holder_name || null,
    licenseType: primary.license_type || null,
    licenseExpirationDate: isoDatePart(primary.license_expiration_date),
    syncedAt,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN FETCH HANDLER
// ════════════════════════════════════════════════════════════════════════════

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = request.headers.get('Origin') ?? ''

    // CORS preflight
    if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // ── API Routes ───────────────────────────────────────────────────────────
    if (path.startsWith('/api/')) {
      try {
        return await handleApi(request, env, path, url)
      } catch (e) {
        if (e instanceof Response) return e
        console.error('Worker error:', e)
        return err('Internal server error', 500)
      }
    }

    // ── Static Frontend ──────────────────────────────────────────────────────
    try {
      return await getAssetFromKV(
        { request, waitUntil: ctx.waitUntil.bind(ctx) },
        { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest },
      )
    } catch (e) {
      if (e instanceof NotFoundError) {
        // SPA fallback — serve index.html for all unknown routes
        try {
          const fallback = new Request(new URL('/index.html', request.url).toString(), request)
          const res = await getAssetFromKV(
            { request: fallback, waitUntil: ctx.waitUntil.bind(ctx) },
            { ASSET_NAMESPACE: env.__STATIC_CONTENT, ASSET_MANIFEST: assetManifest },
          )
          return new Response(res.body, { ...res, status: 200 })
        } catch {
          return new Response('Not Found', { status: 404 })
        }
      }
      return new Response('Internal Error', { status: 500 })
    }
  },
}

// ════════════════════════════════════════════════════════════════════════════
// API ROUTER
// ════════════════════════════════════════════════════════════════════════════

async function handleApi(request: Request, env: Env, path: string, url: URL): Promise<Response> {
  const method = request.method

  if (path === '/api/health') {
    return ok({ status: 'ok', app: env.APP_NAME, env: env.APP_ENV, ts: Date.now() })
  }

  // ── SSO Redirect — /api/sso/redirect ────────────────────────────────────────
  if (path === '/api/sso/redirect' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)
    const appId = url.searchParams.get('app') || ''
    const returnTo = url.searchParams.get('return_to') || '/'

    // Map known apps to their target URLs (logical app IDs only)
    const appUrls: Record<string, string> = {
      'prime-america-kb': 'https://primeamerica.theceshop.com/real-estate/',
      'inventory': 'https://inventory.primeamericarealestate.com',
      'openhouse': 'https://openhouse.primeamericarealestate.com',
    }

    const targetUrl = appUrls[appId]
    if (!targetUrl) {
      return err(`Unknown SSO target app: ${appId}`, 400)
    }

    // Generate SSO token
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min expiry

    try {
      await env.DB.prepare(`
        INSERT INTO sso_tokens (id, tenant_id, user_id, target_app, return_to, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(token, session.tenantId, session.userId, appId, returnTo, expiresAt).run()

      // Redirect to target app with SSO token
      const redirectUrl = `${targetUrl}?sso_token=${encodeURIComponent(token)}`
      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrl }
      })
    } catch (e) {
      console.error('SSO redirect error:', e)
      return err('Failed to create SSO session', 500)
    }
  }

  // ── Public Lead Submission ────────────────────────────────────────────────
  if (path === '/api/public/lead' && method === 'POST') {
    const body = await request.json<{
      tenantId: string
      agentId?: string
      first_name: string
      last_name: string
      email: string
      phone: string
      notes?: string
    }>()

    const contactId = crypto.randomUUID()
    await env.DB.prepare(`
      INSERT INTO contacts (id, tenant_id, assigned_to, first_name, last_name, email, phone, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'lead', ?)
    `).bind(
      contactId, body.tenantId, body.agentId || null,
      body.first_name, body.last_name, body.email, body.phone,
      body.notes || 'Public inquiry lead'
    ).run()

    await createNotification(
      env.DB,
      body.tenantId,
      `New public listing inquiry lead: ${body.first_name} ${body.last_name}`
    )

    return ok({ success: true, contactId })
  }

  // GET /api/public/listings
  if (path === '/api/public/listings' && method === 'GET') {
    try {
      const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`)
      if (!response.ok) {
        throw new Error(`Inventory returned status ${response.status}`)
      }
      const data: any = await response.json()
      const listings = data.listings || data.data || data || []
      const normalized = listings.map((project: any) => {
        const pdata = project.data || {}
        return {
          id: project.id,
          address: project.address || `${pdata.streetNumber || ''} ${pdata.streetName || ''} ${pdata.streetSuffix || ''}`.trim(),
          city: project.city || pdata.city || '',
          state: project.state || pdata.stateOrProvince || '',
          zip: project.zip || pdata.postalCode || '',
          price: project.price ?? pdata.listPrice ?? null,
          propertyType: project.propertyType || pdata.propertyType || '',
          bedrooms: project.bedrooms ?? pdata.bedroomsTotal ?? 0,
          bathrooms: project.bathrooms ?? pdata.bathroomsTotalInteger ?? 0,
          sqft: project.sqft ?? pdata.livingArea ?? 0,
          description: project.description || pdata.publicRemarks || '',
          heroMediaUrl: project.heroMediaUrl || null,
          media: Array.isArray(project.media) ? project.media : [],
        }
      })
      return ok({ success: true, data: normalized })
    } catch (e: any) {
      console.error('Failed to load public listings:', e)
      return err('Failed to load listings', 500)
    }
  }

  // GET /api/public/listings/:id
  const publicListingMatch = path.match(/^\/api\/public\/listings\/([^/]+)$/)
  if (publicListingMatch && method === 'GET') {
    const listingId = publicListingMatch[1]
    try {
      // Prefer detail endpoint for richer payload including media gallery.
      const detailResponse = await fetch(`${env.INVENTORY_WORKER_URL}/api/projects/${listingId}`)
      if (detailResponse.ok) {
        const detailData: any = await detailResponse.json()
        const project = detailData.project || detailData
        if (project && project.id) {
          const pdata = project.data || {}
          const normalized = {
            id: project.id,
            address: project.address || `${pdata.streetNumber || ''} ${pdata.streetName || ''} ${pdata.streetSuffix || ''}`.trim(),
            city: project.city || pdata.city || '',
            state: project.state || pdata.stateOrProvince || '',
            zip: project.zip || pdata.postalCode || '',
            price: project.price ?? pdata.listPrice ?? null,
            propertyType: project.propertyType || pdata.propertyType || '',
            bedrooms: project.bedrooms ?? pdata.bedroomsTotal ?? 0,
            bathrooms: project.bathrooms ?? pdata.bathroomsTotalInteger ?? 0,
            sqft: project.sqft ?? pdata.livingArea ?? 0,
            description: project.description || pdata.publicRemarks || '',
            heroMediaUrl: project.heroMediaUrl || null,
            media: Array.isArray(project.media) ? project.media : [],
            raw: project,
          }
          return ok(normalized)
        }
      }

      // Fallback to listings collection lookup for compatibility.
      const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`)
      const data: any = await response.json()
      const listings = data.listings || data.data || data || []
      const listing = listings.find((l: any) => l.id === listingId)
      if (listing) {
        return ok(listing)
      }
      return err('Listing not found', 404)
    } catch (e: any) {
      return err(e.message, 500)
    }
  }

  // GET /api/public/listings/:id/map-settings
  const publicMapSettingsMatch = path.match(/^\/api\/public\/listings\/([^/]+)\/map-settings$/)
  if (publicMapSettingsMatch && method === 'GET') {
    const listingId = publicMapSettingsMatch[1]
    try {
      const settings = await env.DB.prepare('SELECT lat, lng, categories FROM listing_map_settings WHERE listing_id = ?')
        .bind(listingId)
        .first<{ lat: number | null; lng: number | null; categories: string | null }>()
      if (settings) {
        let parsedCats = null
        if (settings.categories) {
          try {
            parsedCats = JSON.parse(settings.categories)
          } catch (e) {}
        }
        return ok({
          lat: settings.lat,
          lng: settings.lng,
          categories: parsedCats
        })
      }
      return ok(null)
    } catch (e: any) {
      return err(e.message, 500)
    }
  }

  // GET /api/public/agents/:id
  const publicAgentMatch = path.match(/^\/api\/public\/agents\/([^/]+)$/)
  if (publicAgentMatch && method === 'GET') {
    const agentId = publicAgentMatch[1]
    const agent = await env.DB
      .prepare(`
         SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.avatar_url, u.phone, u.license_number,
               t.name as company_name, t.logo_url as company_logo_url, t.primary_color, t.accent_color
        FROM users u
        LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = ?
      `)
      .bind(agentId)
      .first<{
        id: string
        tenant_id: string
        name: string
        email: string
        role: string
        avatar_url: string | null
        phone: string | null
        license_number: string | null
        company_name: string | null
        company_logo_url: string | null
        primary_color: string | null
        accent_color: string | null
      }>()

    if (!agent) {
      return err('Agent not found', 404)
    }

    return ok({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      avatarUrl: agent.avatar_url,
      phone: agent.phone,
      licenseNumber: agent.license_number,
      companyName: agent.company_name,
      companyLogoUrl: agent.company_logo_url,
      companyLogoPublicUrl: agent.company_logo_url ? `/api/public/tenants/${encodeURIComponent(agent.tenant_id)}/logo` : null,
      primaryColor: agent.primary_color,
      accentColor: agent.accent_color,
    })
  }

  // GET /api/public/tenants/:tenantId/logo
  const publicTenantLogoMatch = path.match(/^\/api\/public\/tenants\/([^/]+)\/logo$/)
  if (publicTenantLogoMatch && method === 'GET') {
    const tenantId = publicTenantLogoMatch[1]
    const tenant = await env.DB
      .prepare('SELECT logo_url FROM tenants WHERE id = ?')
      .bind(tenantId)
      .first<{ logo_url: string | null }>()

    if (!tenant?.logo_url) {
      return err('Logo not found', 404)
    }

    const logoMatch = String(tenant.logo_url).match(/^\/api\/documents\/([^/]+)\/download$/)
    if (!logoMatch) {
      return err('Logo not available publicly', 404)
    }

    const docId = logoMatch[1]
    const doc = await env.DB
      .prepare('SELECT file_key, file_name, content_type FROM documents WHERE id = ? AND tenant_id = ?')
      .bind(docId, tenantId)
      .first<{ file_key: string; file_name: string; content_type: string | null }>()

    if (!doc) {
      return err('Logo not found', 404)
    }

    const object = await env.ASSETS_BUCKET.get(doc.file_key)
    if (!object) return err('Logo not found in storage', 404)

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('Cache-Control', 'public, max-age=3600')
    if (doc.content_type) headers.set('Content-Type', doc.content_type)
    headers.set('Content-Disposition', `inline; filename="${doc.file_name}"`)

    return new Response(object.body, { headers })
  }

  // GET /api/public/openhouses
  if (path === '/api/public/openhouses' && method === 'GET') {
    try {
      const openHouseUrl = `${env.OPENHOUSE_WORKER_URL}/api/events/list`
      const res = await fetch(openHouseUrl, { headers: { 'Accept': 'application/json' } })
      if (!res.ok) {
        const altUrl = 'https://openhouse.primeamericarealestate.com/api/events/list'
        const altRes = await fetch(altUrl, { headers: { 'Accept': 'application/json' } })
        if (altRes.ok) {
          const data: any = await altRes.json()
          return ok(data.events || [])
        }
        return ok([])
      }
      const data: any = await res.json()
      return ok(data.events || [])
    } catch (e: any) {
      try {
        const altUrl = 'https://openhouse.primeamericarealestate.com/api/events/list'
        const altRes = await fetch(altUrl, { headers: { 'Accept': 'application/json' } })
        if (altRes.ok) {
          const data: any = await altRes.json()
          return ok(data.events || [])
        }
      } catch (e2) {}
      return ok([])
    }
  }

  // GET /api/public/openhouses/search
  if (path === '/api/public/openhouses/search' && method === 'GET') {
    const searchAddress = (url.searchParams.get('address') || '').toLowerCase().trim()
    const searchCity = (url.searchParams.get('city') || '').toLowerCase().trim()
    const searchState = (url.searchParams.get('state') || '').toLowerCase().trim()
    const searchZip = (url.searchParams.get('zip') || '').toLowerCase().trim()
    const listingId = url.searchParams.get('listingId') || ''

    try {
      const openHouseUrl = `${env.OPENHOUSE_WORKER_URL}/api/events/list`
      const res = await fetch(openHouseUrl, { headers: { 'Accept': 'application/json' } })
      let events: any[] = []

      if (res.ok) {
        const data: any = await res.json()
        events = data.events || []
      } else {
        const altUrl = 'https://openhouse.primeamericarealestate.com/api/events/list'
        const altRes = await fetch(altUrl, { headers: { 'Accept': 'application/json' } })
        if (altRes.ok) {
          const data: any = await altRes.json()
          events = data.events || []
        }
      }

      const filtered = events.filter((oh: any) => {
        const ohListingId = String(oh.listing_id || oh.inventory_listing_id || '')
        if (listingId && ohListingId && ohListingId === listingId) return true

        const ohAddr = String(oh.property_address || oh.address || '').toLowerCase()
        const ohCity = String(oh.city || '').toLowerCase()
        const ohState = String(oh.state || '').toLowerCase()
        const ohZip = String(oh.zip || oh.zip_code || '').toLowerCase()

        if (searchZip && ohZip && ohZip === searchZip) return true

        const addressMatch = searchAddress
          ? ohAddr.includes(searchAddress) || searchAddress.includes(ohAddr)
          : false
        const cityMatch = searchCity ? ohCity === searchCity : false
        const stateMatch = searchState ? ohState === searchState : false

        if (addressMatch) return true
        if (cityMatch && stateMatch) return true
        if (cityMatch && searchAddress && ohAddr.includes(searchAddress.split(' ')[0] || '')) return true

        return false
      })

      return ok(filtered)
    } catch {
      return ok([])
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // AUTH ROUTES
  // ════════════════════════════════════════════════════════════════════════

  // POST /api/auth/signup
  if (path === '/api/auth/signup' && method === 'POST') {
    const body = await request.json<{
      name: string
      email: string
      password: string
      role?: string
      companyName?: string
      licenseNumber?: string
    }>()

    if (!body.name || !body.email || !body.password) {
      return err('Name, email, and password are required')
    }
    if (body.password.length < 8) return err('Password must be at least 8 characters')

    // Resolve tenant
    let tenantId: string
    let assignedRole = body.role ?? 'salesperson'

    if (isPrimeAmericaEmail(body.email)) {
      tenantId = 'tenant_primeamerica'
      // admin@ address always gets admin role
      if (body.email.toLowerCase().startsWith('admin@')) {
        assignedRole = 'admin'
      } else {
        // First user in tenant becomes admin
        const existingCount = await env.DB
          .prepare('SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ?')
          .bind(tenantId)
          .first<{ cnt: number }>()
        if ((existingCount?.cnt ?? 0) === 0) assignedRole = 'admin'
      }
    } else if (body.companyName) {
      const { tenantId: tid, isNew } = await resolveOrCreateTenant(env.DB, body.companyName)
      tenantId = tid
      // First user in a brand-new tenant is always admin
      if (isNew) assignedRole = 'admin'
    } else {
      return err('Please provide your company name')
    }

    // Check email not already registered in this tenant
    const existing = await env.DB
      .prepare('SELECT id FROM users WHERE email = ? AND tenant_id = ?')
      .bind(body.email.toLowerCase(), tenantId)
      .first()
    if (existing) return err('An account with this email already exists', 409)

    const id = `usr_${newId().replace(/-/g, '').slice(0, 12)}`
    const passwordHash = await hashPassword(body.password)

    await env.DB
      .prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role, license_number)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, tenantId, body.email.toLowerCase(), passwordHash, body.name, assignedRole, body.licenseNumber ?? null)
      .run()

    // Initialize user settings row
    await env.DB.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').bind(id).run()

    // Send verification email
    const token = generateToken()
    await storeToken(env.EMAIL_TOKENS_KV, 'verify', token, id, TOKEN_TTL.email_verify)
    try {
      await sendVerificationEmail(env.EMAIL, body.email, body.name, token, env.APP_BASE_URL)
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr)
    }

    return json({ success: true, message: 'Account created. Please check your email to verify.' }, 201)
  }

  // GET /api/auth/verify-email?token=xxx
  if (path === '/api/auth/verify-email' && method === 'GET') {
    const token = url.searchParams.get('token')
    if (!token) return err('Missing token')

    const userId = await consumeToken(env.EMAIL_TOKENS_KV, 'verify', token)
    if (!userId) return err('Invalid or expired verification link', 400)

    const user = await env.DB
      .prepare('UPDATE users SET email_verified = 1, updated_at = datetime(\'now\') WHERE id = ? RETURNING *')
      .bind(userId)
      .first<UserRow>()

    if (!user) return err('User not found', 404)

    // Send welcome email
    try {
      await sendWelcomeEmail(env.EMAIL, user.email, user.name)
    } catch {}

    // Auto-login after verification
    const jwt = await signJWT(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      env.JWT_SECRET,
    )
    return json(
      { success: true, message: 'Email verified! You are now logged in.' },
      200,
      { 'Set-Cookie': setSessionCookie(jwt) },
    )
  }

  // POST /api/auth/login
  if (path === '/api/auth/login' && method === 'POST') {
    const { email, password } = await request.json<{ email: string; password: string }>()
    if (!email || !password) return err('Email and password are required')

    const user = await env.DB
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email.toLowerCase())
      .first<UserRow>()

    if (!user || !await verifyPassword(password, user.password_hash)) {
      return err('Invalid email or password', 401)
    }
    if (!user.is_active) return err('Your account has been deactivated. Contact your administrator.', 403)
    if (!user.email_verified) return err('Please verify your email before logging in. Check your inbox.', 403)

    // Update last login
    await env.DB
      .prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(user.id)
      .run()

    const jwt = await signJWT(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      env.JWT_SECRET,
    )

    const permissions = await serializePermissions(user.id, user.role, env.DB)

    return json(
      { success: true, data: { user: safeUser(user), permissions } },
      200,
      { 'Set-Cookie': setSessionCookie(jwt) },
    )
  }

  // POST /api/auth/logout
  if (path === '/api/auth/logout' && method === 'POST') {
    const session = await getSession(request, env.JWT_SECRET)
    // If currently impersonating, log the end
    if (session?.impersonationLogId) {
      await env.DB
        .prepare('UPDATE impersonation_audit_log SET ended_at = datetime(\'now\') WHERE id = ?')
        .bind(session.impersonationLogId)
        .run()
    }
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() })
  }

  // GET /api/auth/me
  if (path === '/api/auth/me' && method === 'GET') {
    const session = await getSession(request, env.JWT_SECRET)
    if (!session) return authError()

    const user = await env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(session.userId)
      .first<UserRow>()

    if (!user || !user.is_active) return authError()

    const permissions = await serializePermissions(user.id, user.role, env.DB)
    const tenant = await getTenant(env.DB, user.tenant_id)

    return ok({
      user: safeUser(user),
      permissions,
      tenant,
      impersonating: session.impersonatedBy
        ? { impersonatedBy: session.impersonatedBy, logId: session.impersonationLogId }
        : null,
    })
  }

  // GET /api/auth/assistant-principal — resolve assistant's active assignment and principal
  if (path === '/api/auth/assistant-principal' && method === 'GET') {
    const session = await getSession(request, env.JWT_SECRET)
    if (!session) return authError()

    const user = await env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(session.userId)
      .first<UserRow>()

    if (!user || !user.is_active || user.role !== 'assistant') {
      return ok({ success: false, data: null })
    }

    const assignment = await env.DB.prepare(`
      SELECT
        aa.id as assignment_id,
        aa.principal_id,
        aa.can_access_transactions,
        aa.can_access_contacts,
        u_principal.id as principal_id,
        u_principal.role as principal_role,
        u_principal.is_active as principal_active,
        u_principal.name as principal_name,
        u_principal.email as principal_email
      FROM assistant_assignments aa
      JOIN users u_principal ON u_principal.id = aa.principal_id
      WHERE aa.assistant_id = ?
        AND aa.tenant_id = ?
        AND aa.status = 'active'
        AND (aa.expires_at IS NULL OR aa.expires_at > datetime('now'))
        AND (aa.can_access_transactions = 1 OR aa.can_access_contacts = 1)
        AND u_principal.role = 'salesperson'
        AND u_principal.is_active = 1
        AND u_principal.tenant_id = aa.tenant_id
      LIMIT 1
    `).bind(session.userId, session.tenantId).first<{
      assignment_id: string
      principal_id: string
      can_access_transactions: number
      can_access_contacts: number
      principal_id: string
      principal_role: string
      principal_active: number
      principal_name: string
      principal_email: string
    }>()

    if (!assignment) {
      return ok({ success: false, data: null })
    }

    const principal = await env.DB
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(assignment.principal_id)
      .first<UserRow>()

    if (!principal) {
      return ok({ success: false, data: null })
    }

    return ok({
      success: true,
      data: {
        principal: safeUser(principal),
        assignmentId: assignment.assignment_id,
        canAccessTransactions: assignment.can_access_transactions === 1,
        canAccessContacts: assignment.can_access_contacts === 1,
      }
    })
  }

  // PUT /api/auth/me
  if (path === '/api/auth/me' && method === 'PUT') {
    const session = await getSession(request, env.JWT_SECRET)
    if (!session) return authError()
    const body = await request.json<{
      name?: string
      phone?: string
      title?: string
      licenseNumber?: string | null
      avatarUrl?: string | null
      license_expiration_date?: string | null
    }>()

    await env.DB
      .prepare(`
        UPDATE users
        SET
          name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          title = COALESCE(?, title),
          license_number = COALESCE(?, license_number),
          avatar_url = COALESCE(?, avatar_url),
          license_expiration_date = ?,
          updated_at = datetime("now")
        WHERE id = ?
      `)
      .bind(
        body.name ?? null,
        body.phone ?? null,
        body.title ?? null,
        body.licenseNumber ?? null,
        body.avatarUrl ?? null,
        body.license_expiration_date || null,
        session.userId,
      )
      .run()

    return ok({ success: true })
  }

  // POST /api/auth/avatar
  if (path === '/api/auth/avatar' && method === 'POST') {
    const session = await requireAuth(request, env.JWT_SECRET)
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return err('Missing avatar file', 400)

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const key = `${session.tenantId}/avatars/${session.userId}/${newId()}.${ext}`

    await env.ASSETS_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' }
    })

    await env.DB
      .prepare('UPDATE users SET avatar_url = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?')
      .bind(key, session.userId, session.tenantId)
      .run()

    return ok({
      key,
      avatarUrl: `/api/auth/avatar/${encodeURIComponent(key)}`,
    })
  }

  // GET /api/auth/avatar/:key
  const avatarMatch = path.match(/^\/api\/auth\/avatar\/(.+)$/)
  if (avatarMatch && method === 'GET') {
    const key = decodeURIComponent(avatarMatch[1])
    if (!key.includes('/avatars/')) {
      return forbiddenError('Invalid avatar key')
    }

    const object = await env.ASSETS_BUCKET.get(key)
    if (!object) return err('Avatar not found', 404)

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('Cache-Control', 'public, max-age=86400')
    return new Response(object.body, { headers })
  }

  // POST /api/auth/delete-account
  if (path === '/api/auth/delete-account' && method === 'POST') {
    const session = await getSession(request, env.JWT_SECRET)
    if (!session) return authError()

    const user = await env.DB
      .prepare('SELECT id, role, tenant_id FROM users WHERE id = ?')
      .bind(session.userId)
      .first<{ id: string; role: string; tenant_id: string }>()

    if (!user) return authError()

    if (user.role === 'admin') {
      // Cascade delete workspace database entries
      await env.DB.prepare('DELETE FROM transaction_tasks WHERE tenant_id = ?').bind(user.tenant_id).run()
      await env.DB.prepare('DELETE FROM transactions WHERE tenant_id = ?').bind(user.tenant_id).run()
      await env.DB.prepare('DELETE FROM contacts WHERE tenant_id = ?').bind(user.tenant_id).run()
      await env.DB.prepare('DELETE FROM network_connections WHERE tenant_id = ?').bind(user.tenant_id).run()
      await env.DB.prepare('DELETE FROM network_referrals WHERE tenant_id = ?').bind(user.tenant_id).run()
      await env.DB.prepare('DELETE FROM documents WHERE tenant_id = ?').bind(user.tenant_id).run()
      await env.DB.prepare('DELETE FROM users WHERE tenant_id = ?').bind(user.tenant_id).run()
      await env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(user.tenant_id).run()
    } else {
      // Deactivate user access (restorable by admin)
      await env.DB
        .prepare('UPDATE users SET is_active = 0, updated_at = datetime("now") WHERE id = ?')
        .bind(user.id)
        .run()
    }

    return ok({ success: true })
  }

  // POST /api/auth/forgot-password
  if (path === '/api/auth/forgot-password' && method === 'POST') {
    const { email } = await request.json<{ email: string }>()
    if (!email) return err('Email is required')

    const user = await env.DB
      .prepare('SELECT id, name, email FROM users WHERE email = ? AND is_active = 1')
      .bind(email.toLowerCase())
      .first<{ id: string; name: string; email: string }>()

    // Always return success to prevent email enumeration
    if (user) {
      const token = generateToken()
      await storeToken(env.EMAIL_TOKENS_KV, 'reset', token, user.id, TOKEN_TTL.password_reset)
      try {
        await sendPasswordResetEmail(env.EMAIL, user.email, user.name, token, env.APP_BASE_URL)
      } catch (e) {
        console.error('Password reset email failed:', e)
      }
    }

    return ok({ message: 'If an account exists with this email, a reset link has been sent.' })
  }

  // POST /api/auth/reset-password
  if (path === '/api/auth/reset-password' && method === 'POST') {
    const { token, password } = await request.json<{ token: string; password: string }>()
    if (!token || !password) return err('Token and password are required')
    if (password.length < 8) return err('Password must be at least 8 characters')

    const userId = await consumeToken(env.EMAIL_TOKENS_KV, 'reset', token)
    if (!userId) return err('Invalid or expired reset link', 400)

    const passwordHash = await hashPassword(password)
    await env.DB
      .prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(passwordHash, userId)
      .run()

    return ok({ message: 'Password updated successfully. You can now log in.' })
  }

  // POST /api/auth/accept-invite
  if (path === '/api/auth/accept-invite' && method === 'POST') {
    const { token, name, password } = await request.json<{
      token: string; name: string; password: string
    }>()
    if (!token || !name || !password) return err('Token, name, and password are required')
    if (password.length < 8) return err('Password must be at least 8 characters')

    const invite = await env.DB
      .prepare(`SELECT * FROM invitations WHERE token = ? AND accepted_at IS NULL AND expires_at > datetime('now')`)
      .bind(token)
      .first<{ id: string; tenant_id: string; email: string; role: string; invited_by: string; name: string | null }>()

    if (!invite) return err('Invalid or expired invitation link', 400)

    // Check not already registered
    const existing = await env.DB
      .prepare('SELECT id FROM users WHERE email = ? AND tenant_id = ?')
      .bind(invite.email.toLowerCase(), invite.tenant_id)
      .first()
    if (existing) return err('An account with this email already exists', 409)

    const id = `usr_${newId().replace(/-/g, '').slice(0, 12)}`
    const passwordHash = await hashPassword(password)

    await env.DB
      .prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role, email_verified, invited_by)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind(id, invite.tenant_id, invite.email.toLowerCase(), passwordHash, name, invite.role, invite.invited_by)
      .run()

    await env.DB.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').bind(id).run()

    // Mark invitation as accepted
    await env.DB
      .prepare('UPDATE invitations SET accepted_at = datetime(\'now\') WHERE id = ?')
      .bind(invite.id)
      .run()

    // Auto-login
    const jwt = await signJWT(
      { userId: id, tenantId: invite.tenant_id, role: invite.role },
      env.JWT_SECRET,
    )

    return json(
      { success: true, message: 'Account created. Welcome to RE Workspace!' },
      201,
      { 'Set-Cookie': setSessionCookie(jwt) },
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // HR ROUTES (admin + broker only)
  // ════════════════════════════════════════════════════════════════════════

  if (path.startsWith('/api/hr/')) {
    const session = await requireAuth(request, env.JWT_SECRET)
    // Most HR routes require admin/broker, EXCEPT stopping impersonation (since you might be impersonating a salesperson)
    if (path !== '/api/hr/impersonate/stop') {
      if (!roleAtLeast(session.role, 'broker') || !(await can(session.userId, session.role, 'hr', 'read', env.DB))) {
        throw forbiddenError('HR access requires broker or admin role with HR permissions')
      }
    }

    // GET /api/hr/users — list all users in tenant
    if (path === '/api/hr/users' && method === 'GET') {
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
      const offset = (page - 1) * limit
      const search = url.searchParams.get('q') ?? ''

      let query = 'SELECT * FROM users WHERE tenant_id = ?'
      const params: any[] = [session.tenantId]
      if (search) {
        query += ' AND (name LIKE ? OR email LIKE ?)'
        params.push(`%${search}%`, `%${search}%`)
      }
      query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const rows = await env.DB.prepare(query).bind(...params).all<UserRow>()
      const { results } = await env.DB
        .prepare('SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ?')
        .bind(session.tenantId)
        .all<{ cnt: number }>()

      return ok({ users: rows.results.map(safeUser), total: results[0]?.cnt ?? 0, page, limit })
    }

    // GET /api/hr/users/:id
    const userIdMatch = path.match(/^\/api\/hr\/users\/([^/]+)$/)
    if (userIdMatch && method === 'GET') {
      const targetId = userIdMatch[1]
      const user = await env.DB
        .prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<UserRow>()
      if (!user) return err('User not found', 404)

      const permissions = await serializePermissions(user.id, user.role, env.DB)
      return ok({ user: safeUser(user), permissions })
    }

    // PUT /api/hr/users/:id — update user profile/role
    if (userIdMatch && method === 'PUT') {
      const targetId = userIdMatch[1]
      const body = await request.json<{
        name?: string; role?: string; title?: string; phone?: string; licenseNumber?: string; licenseState?: string
      }>()

      const user = await env.DB
        .prepare('SELECT id, role FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; role: string }>()
      if (!user) return err('User not found', 404)

      const roleChanged = body.role !== undefined && body.role !== user.role

      if (roleChanged && session.role !== 'admin') {
        return forbiddenError('Only admins can change user roles')
      }

      // Broker cannot promote to admin or broker level
      if (session.role === 'broker' && body.role && roleAtLeast(body.role, 'broker')) {
        return forbiddenError('Brokers cannot assign admin or broker roles')
      }

      if (roleChanged && body.role && user.role === 'admin' && body.role !== 'admin') {
        const adminCount = await env.DB
          .prepare('SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND role = ?')
          .bind(session.tenantId, 'admin')
          .first<{ cnt: number }>()
        if ((adminCount?.cnt || 0) <= 1) {
          return err('Cannot change role for the last admin in workspace', 400)
        }
      }

      await env.DB
        .prepare(`UPDATE users SET
          name = COALESCE(?, name),
          role = COALESCE(?, role),
          title = COALESCE(?, title),
          phone = COALESCE(?, phone),
          license_number = COALESCE(?, license_number),
          license_state = COALESCE(?, license_state),
          updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?`)
        .bind(
          body.name ?? null, body.role ?? null, body.title ?? null,
          body.phone ?? null, body.licenseNumber ?? null, body.licenseState ?? null,
          targetId, session.tenantId,
        )
        .run()

      if (roleChanged) {
        // Revert to role-based defaults whenever role changes.
        await env.DB
          .prepare('DELETE FROM user_permissions WHERE tenant_id = ? AND user_id = ?')
          .bind(session.tenantId, targetId)
          .run()
      }

      const updated = await env.DB
        .prepare('SELECT * FROM users WHERE id = ?')
        .bind(targetId)
        .first<UserRow>()
      return ok({ user: safeUser(updated!) })
    }

    // DELETE /api/hr/users/:id — hard delete user (admin only)
    if (userIdMatch && method === 'DELETE') {
      if (session.role !== 'admin') {
        throw forbiddenError('Only admins can permanently delete users')
      }

      const targetId = userIdMatch[1]
      if (targetId === session.userId) return err('You cannot delete your own user record', 400)

      const targetUser = await env.DB
        .prepare('SELECT id, role FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; role: string }>()
      if (!targetUser) return err('User not found', 404)

      if (targetUser.role === 'admin') {
        const adminCount = await env.DB
          .prepare('SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND role = ?')
          .bind(session.tenantId, 'admin')
          .first<{ cnt: number }>()
        if ((adminCount?.cnt || 0) <= 1) {
          return err('Cannot delete the last admin in workspace', 400)
        }
      }

      await env.DB.prepare('UPDATE transactions SET assigned_to = NULL WHERE tenant_id = ? AND assigned_to = ?').bind(session.tenantId, targetId).run()
      await env.DB.prepare('UPDATE transaction_tasks SET completed_by = NULL WHERE tenant_id = ? AND completed_by = ?').bind(session.tenantId, targetId).run()
      await env.DB.prepare('UPDATE transaction_tasks SET approved_by = NULL WHERE tenant_id = ? AND approved_by = ?').bind(session.tenantId, targetId).run()
      await env.DB.prepare('UPDATE contacts SET assigned_to = NULL WHERE tenant_id = ? AND assigned_to = ?').bind(session.tenantId, targetId).run()
      await env.DB.prepare('UPDATE documents SET uploaded_by = NULL WHERE tenant_id = ? AND uploaded_by = ?').bind(session.tenantId, targetId).run()
      await env.DB.prepare('DELETE FROM user_permissions WHERE tenant_id = ? AND (user_id = ? OR granted_by = ?)').bind(session.tenantId, targetId, targetId).run()
      await env.DB.prepare('DELETE FROM invitations WHERE tenant_id = ? AND invited_by = ?').bind(session.tenantId, targetId).run()
      await env.DB.prepare('DELETE FROM impersonation_audit_log WHERE tenant_id = ? AND (impersonator_id = ? OR target_user_id = ?)').bind(session.tenantId, targetId, targetId).run()
      await env.DB.prepare('DELETE FROM users WHERE tenant_id = ? AND id = ?').bind(session.tenantId, targetId).run()

      return ok({ message: 'User deleted permanently' })
    }

    // POST /api/hr/users/:id/deactivate
    const deactivateMatch = path.match(/^\/api\/hr\/users\/([^/]+)\/deactivate$/)
    if (deactivateMatch && method === 'POST') {
      if (session.role !== 'admin' && session.role !== 'broker') {
        throw forbiddenError('Only admins and brokers can deactivate users')
      }
      const targetId = deactivateMatch[1]
      if (targetId === session.userId) return err('Cannot deactivate your own account')

      const targetUser = await env.DB
        .prepare('SELECT role FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ role: string }>()
      if (!targetUser) return err('User not found', 404)

      if (session.role === 'broker' && roleAtLeast(targetUser.role, 'broker')) {
        return err('Brokers cannot deactivate other brokers or admins', 403)
      }

      await env.DB
        .prepare('UPDATE users SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .run()
      return ok({ message: 'User deactivated' })
    }

    // POST /api/hr/users/:id/reactivate
    const reactivateMatch = path.match(/^\/api\/hr\/users\/([^/]+)\/reactivate$/)
    if (reactivateMatch && method === 'POST') {
      if (session.role !== 'admin' && session.role !== 'broker') {
        throw forbiddenError('Only admins and brokers can reactivate users')
      }
      const targetId = reactivateMatch[1]

      const targetUser = await env.DB
        .prepare('SELECT role FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ role: string }>()
      if (!targetUser) return err('User not found', 404)

      if (session.role === 'broker' && roleAtLeast(targetUser.role, 'broker')) {
        return err('Brokers cannot reactivate other brokers or admins', 403)
      }

      await env.DB
        .prepare('UPDATE users SET is_active = 1, updated_at = datetime(\'now\') WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .run()
      return ok({ message: 'User reactivated' })
    }

    // GET /api/hr/users/:id/permissions
    const permsMatch = path.match(/^\/api\/hr\/users\/([^/]+)\/permissions$/)
    if (permsMatch && method === 'GET') {
      if (session.role !== 'admin') return forbiddenError('Only admins can view permission overrides')
      const targetId = permsMatch[1]
      const user = await env.DB
        .prepare('SELECT id, role FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; role: string }>()
      if (!user) return err('User not found', 404)

      const overrides = await env.DB
        .prepare('SELECT module, action, granted FROM user_permissions WHERE user_id = ?')
        .bind(targetId)
        .all()
      const effective = await serializePermissions(user.id, user.role, env.DB)
      return ok({ effective, overrides: overrides.results })
    }

    // PUT /api/hr/users/:id/permissions — set overrides
    if (permsMatch && method === 'PUT') {
      if (session.role !== 'admin') return forbiddenError('Only admins can modify permission overrides')
      const targetId = permsMatch[1]
      const { permissions } = await request.json<{
        permissions: Array<{ module: string; action: string; granted: number }>
      }>()

      const user = await env.DB
        .prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first()
      if (!user) return err('User not found', 404)

      await env.DB
        .prepare('DELETE FROM user_permissions WHERE tenant_id = ? AND user_id = ?')
        .bind(session.tenantId, targetId)
        .run()

      // Upsert each permission override
      for (const perm of permissions) {
        await env.DB
          .prepare(`INSERT INTO user_permissions (id, user_id, tenant_id, module, action, granted, granted_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, module, action) DO UPDATE SET granted = excluded.granted, granted_by = excluded.granted_by`)
          .bind(newId(), targetId, session.tenantId, perm.module, perm.action, perm.granted, session.userId)
          .run()
      }

      const effective = await serializePermissions(targetId, '', env.DB)
      return ok({ message: 'Permissions updated', effective })
    }

    // POST /api/hr/users/:id/reset-password — force send reset email
    const resetMatch = path.match(/^\/api\/hr\/users\/([^/]+)\/reset-password$/)
    if (resetMatch && method === 'POST') {
      if (session.role !== 'admin') throw forbiddenError('Only admins can force password resets')
      const targetId = resetMatch[1]
      const user = await env.DB
        .prepare('SELECT id, name, email FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; name: string; email: string }>()
      if (!user) return err('User not found', 404)

      const token = generateToken()
      await storeToken(env.EMAIL_TOKENS_KV, 'reset', token, user.id, TOKEN_TTL.password_reset)
      await sendPasswordResetEmail(env.EMAIL, user.email, user.name, token, env.APP_BASE_URL)
      return ok({ message: 'Password reset email sent' })
    }

    // POST /api/hr/users/manual
    if (path === '/api/hr/users/manual' && method === 'POST') {
      if (session.role !== 'admin' && session.role !== 'broker') {
        throw forbiddenError('Only admins and brokers can manually add users')
      }
      const body = await request.json<{
        name: string
        email: string
        role: string
        licenseNumber?: string
        sendWelcomeEmail?: boolean
      }>()

      // Role check: broker can only invite/create roles below broker
      if (session.role === 'broker' && !roleAtLeast(body.role, 'broker')) {
        throw forbiddenError('Brokers can only add salesperson, assistant, vendor, or partner roles')
      }

      // Check if email already exists
      const existingUser = await env.DB
        .prepare('SELECT id FROM users WHERE email = ?')
        .bind(body.email.toLowerCase())
        .first()

      if (existingUser) {
        return err('Email already registered in the workspace')
      }

      const targetId = newId()
      const tempPassword = 'WelcomeTemp' + Math.floor(1000 + Math.random() * 9000) + '!'
      const passwordHash = await hashPassword(tempPassword)
      const tenant = await getTenant(env.DB, session.tenantId)
      const tenantName = tenant ? tenant.name : 'Prime America'

      await env.DB
        .prepare(`
          INSERT INTO users (id, tenant_id, name, email, password_hash, role, license_number, is_active, email_verified, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'))
        `)
        .bind(targetId, session.tenantId, body.name, body.email.toLowerCase(), passwordHash, body.role, body.licenseNumber || null)
        .run()

      if (body.sendWelcomeEmail) {
        try {
          await sendManualUserWelcomeEmail(env.EMAIL, body.email, body.name, tempPassword, tenantName, env.APP_BASE_URL)
        } catch (e) {
          console.error('Welcome email failed:', e)
        }
      }

      return ok({
        success: true,
        user: {
          id: targetId,
          name: body.name,
          email: body.email,
          role: body.role
        },
        tempPassword
      })
    }

    // POST /api/hr/users/:id/send-welcome
    const welcomeMatch = path.match(/^\/api\/hr\/users\/([^/]+)\/send-welcome$/)
    if (welcomeMatch && method === 'POST') {
      if (session.role !== 'admin' && session.role !== 'broker') {
        throw forbiddenError('Only admins and brokers can send user credentials')
      }
      const targetId = welcomeMatch[1]
      const targetUser = await env.DB
        .prepare('SELECT id, name, email, role FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; name: string; email: string; role: string }>()

      if (!targetUser) return err('User not found', 404)

      // Role check: broker cannot manage admins/brokers
      if (session.role === 'broker' && !roleAtLeast(targetUser.role, 'broker')) {
        throw forbiddenError('Brokers can only manage salesperson, assistant, vendor, or partner roles')
      }

      // Generate a fresh temporary password
      const tempPassword = 'WelcomeTemp' + Math.floor(1000 + Math.random() * 9000) + '!'
      const passwordHash = await hashPassword(tempPassword)
      const tenant = await getTenant(env.DB, session.tenantId)
      const tenantName = tenant ? tenant.name : 'Prime America'

      await env.DB
        .prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?')
        .bind(passwordHash, targetId, session.tenantId)
        .run()

      await sendManualUserWelcomeEmail(env.EMAIL, targetUser.email, targetUser.name, tempPassword, tenantName, env.APP_BASE_URL)

      return ok({ success: true, tempPassword })
    }

    // GET /api/search
    if (path === '/api/search' && method === 'GET') {
      const session = await getSession(request, env.JWT_SECRET)
      if (!session) return authError()

      const q = url.searchParams.get('q') || ''
      if (q.length < 2) {
        return ok({ contacts: [], transactions: [], listings: [] })
      }

      const searchQuery = `%${q}%`

      // Search contacts
      const contacts = await env.DB
        .prepare('SELECT id, first_name, last_name, email, phone, status FROM contacts WHERE tenant_id = ? AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?) LIMIT 5')
        .bind(session.tenantId, searchQuery, searchQuery, searchQuery)
        .all()

      // Search transactions
      const transactions = await env.DB
        .prepare('SELECT id, name, type, status, price FROM transactions WHERE tenant_id = ? AND name LIKE ? LIMIT 5')
        .bind(session.tenantId, searchQuery)
        .all()

      // Search listings
      let listings: any[] = []
      try {
        const res = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`)
        const listData: any = await res.json()
        const allListings = listData.listings || listData.data || listData || []
        listings = allListings.filter((l: any) =>
          (l.address || '').toLowerCase().includes(q.toLowerCase()) ||
          (l.city || '').toLowerCase().includes(q.toLowerCase())
        ).slice(0, 5)
      } catch (e) {
        console.error('Listings search failed', e)
      }

      return ok({
        contacts: contacts.results,
        transactions: transactions.results,
        listings: listings
      })
    }

    // GET /api/hr/invitations
    if (path === '/api/hr/invitations' && method === 'GET') {
      const rows = await env.DB
        .prepare(`SELECT i.*, u.name as invited_by_name FROM invitations i
                  LEFT JOIN users u ON u.id = i.invited_by
                  WHERE i.tenant_id = ? AND i.accepted_at IS NULL AND i.expires_at > datetime('now')
                  ORDER BY i.created_at DESC`)
        .bind(session.tenantId)
        .all()
      return ok({ invitations: rows.results })
    }

    // POST /api/hr/invitations — send invitation
    if (path === '/api/hr/invitations' && method === 'POST') {
      const { email, name, role } = await request.json<{ email: string; name?: string; role: string }>()
      if (!email || !role) return err('Email and role are required')

      // Check not already a member
      const existing = await env.DB
        .prepare('SELECT id FROM users WHERE email = ? AND tenant_id = ?')
        .bind(email.toLowerCase(), session.tenantId)
        .first()
      if (existing) return err('This email is already a member of your workspace', 409)

      // Broker cannot invite above salesperson
      if (session.role === 'broker' && roleAtLeast(role, 'broker')) {
        return forbiddenError('Brokers cannot invite admin or broker-level users')
      }

      const inviter = await env.DB
        .prepare('SELECT name FROM users WHERE id = ?')
        .bind(session.userId)
        .first<{ name: string }>()
      const tenant = await getTenant(env.DB, session.tenantId)
      if (!inviter || !tenant) return err('Tenant or inviter not found', 500)

      const token = generateToken()
      const id = newId()
      const expiresAt = new Date(Date.now() + TOKEN_TTL.invitation * 1000).toISOString()

      await env.DB
        .prepare('INSERT INTO invitations (id, tenant_id, invited_by, email, name, role, token, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, session.tenantId, session.userId, email.toLowerCase(), name ?? null, role, token, expiresAt)
        .run()

      await sendInvitationEmail(
        env.EMAIL, email, name ?? null, inviter.name, tenant.name, role, token, env.APP_BASE_URL,
      )

      return json({ success: true, message: 'Invitation sent' }, 201)
    }

    // DELETE /api/hr/invitations/:id
    const inviteDeleteMatch = path.match(/^\/api\/hr\/invitations\/([^/]+)$/)
    if (inviteDeleteMatch && method === 'DELETE') {
      await env.DB
        .prepare('DELETE FROM invitations WHERE id = ? AND tenant_id = ?')
        .bind(inviteDeleteMatch[1], session.tenantId)
        .run()
      return ok({ message: 'Invitation revoked' })
    }

    // POST /api/hr/impersonate/stop
    if (path === '/api/hr/impersonate/stop' && method === 'POST') {
      const { cookieHeader } = await stopImpersonation(session, env.DB, env.JWT_SECRET)
      return json({ success: true, message: 'Impersonation ended' }, 200, { 'Set-Cookie': cookieHeader })
    }

    // POST /api/hr/impersonate/:userId
    const impersonateMatch = path.match(/^\/api\/hr\/impersonate\/([^/]+)$/)
    if (impersonateMatch && method === 'POST') {
      const { reason } = await request.json<{ reason?: string }>().catch(() => ({ reason: undefined }))
      const { cookieHeader } = await startImpersonation(
        session, impersonateMatch[1], reason ?? null, env.DB, env.JWT_SECRET,
      )
      return json({ success: true, message: 'Impersonation started' }, 200, { 'Set-Cookie': cookieHeader })
    }

    // GET /api/hr/impersonate/audit
    if (path === '/api/hr/impersonate/audit' && method === 'GET') {
      if (session.role !== 'admin') throw forbiddenError('Admin only')
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
      const offset = (page - 1) * limit

      const rows = await env.DB
        .prepare(`SELECT l.*, imp.name as impersonator_name, imp.email as impersonator_email,
                         tgt.name as target_name, tgt.email as target_email, tgt.role as target_role
                  FROM impersonation_audit_log l
                  JOIN users imp ON imp.id = l.impersonator_id
                  JOIN users tgt ON tgt.id = l.target_user_id
                  WHERE l.tenant_id = ?
                  ORDER BY l.started_at DESC LIMIT ? OFFSET ?`)
        .bind(session.tenantId, limit, offset)
        .all()
      return ok({ entries: rows.results, page, limit })
    }

    // ── Assistant Assignments (admin only) ────────────────────────────────────
    // POST /api/hr/assistant-assignments — create assignment
    if (path === '/api/hr/assistant-assignments' && method === 'POST') {
      if (session.role !== 'admin') {
        throw forbiddenError('Only admins can create assistant assignments')
      }
      const body = await request.json<{
        assistant_id: string
        principal_id: string
        can_access_transactions?: boolean
        can_access_contacts?: boolean
        expires_at?: string | null
      }>()

      if (!body.assistant_id || !body.principal_id) {
        return err('assistant_id and principal_id are required', 400)
      }
      const canTx = body.can_access_transactions ? 1 : 0
      const canContacts = body.can_access_contacts ? 1 : 0
      if (canTx === 0 && canContacts === 0) {
        return err('At least one scope permission (transactions or contacts) is required', 400)
      }

      // Validate assistant: role=assistant, active, same tenant
      const assistant = await env.DB
        .prepare('SELECT id, role, tenant_id, is_active FROM users WHERE id = ?')
        .bind(body.assistant_id)
        .first<{ id: string; role: string; tenant_id: string; is_active: number }>()
      if (!assistant || assistant.role !== 'assistant' || !assistant.is_active || assistant.tenant_id !== session.tenantId) {
        return err('Invalid assistant: must be active assistant in this tenant', 400)
      }

      // Validate principal: role=salesperson, active, same tenant
      const principal = await env.DB
        .prepare('SELECT id, role, tenant_id, is_active, name FROM users WHERE id = ?')
        .bind(body.principal_id)
        .first<{ id: string; role: string; tenant_id: string; is_active: number; name: string }>()
      if (!principal || principal.role !== 'salesperson' || !principal.is_active || principal.tenant_id !== session.tenantId) {
        return err('Invalid principal: must be active salesperson in this tenant', 400)
      }

      // Check for existing active assignment for this assistant
      const existing = await env.DB
        .prepare('SELECT id FROM assistant_assignments WHERE assistant_id = ? AND status = ?')
        .bind(body.assistant_id, 'active')
        .first()
      if (existing) {
        return err('Assistant already has an active assignment', 409)
      }

      const id = crypto.randomUUID()
      await env.DB.prepare(`
        INSERT INTO assistant_assignments (id, tenant_id, assistant_id, principal_id, can_access_transactions, can_access_contacts, expires_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, session.tenantId, body.assistant_id, body.principal_id, canTx, canContacts, body.expires_at || null, session.userId).run()

      return ok({ id, principalName: principal.name })
    }

    // GET /api/hr/assistant-assignments — list assignments
    if (path === '/api/hr/assistant-assignments' && method === 'GET') {
      if (session.role !== 'admin') {
        throw forbiddenError('Only admins can view assistant assignments')
      }
      const page = parseInt(url.searchParams.get('page') ?? '1')
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 100)
      const offset = (page - 1) * limit
      const search = url.searchParams.get('q') ?? ''

      let query = `
        SELECT aa.*, ua.name as assistant_name, ua.email as assistant_email,
               up.name as principal_name, up.email as principal_email
        FROM assistant_assignments aa
        JOIN users ua ON ua.id = aa.assistant_id
        JOIN users up ON up.id = aa.principal_id
        WHERE aa.tenant_id = ?
      `
      const params: any[] = [session.tenantId]
      if (search) {
        query += ' AND (ua.name LIKE ? OR ua.email LIKE ? OR up.name LIKE ? OR up.email LIKE ?)'
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`)
      }
      query += ' ORDER BY aa.created_at DESC LIMIT ? OFFSET ?'
      params.push(limit, offset)

      const rows = await env.DB.prepare(query).bind(...params).all()
      const { results } = await env.DB
        .prepare('SELECT COUNT(*) as cnt FROM assistant_assignments WHERE tenant_id = ?')
        .bind(session.tenantId)
        .all<{ cnt: number }>()

      return ok({ assignments: rows.results, total: results[0]?.cnt ?? 0, page, limit })
    }

    // PUT /api/hr/assistant-assignments/:id — update assignment (pause/revoke/expire)
    const asstAssignMatch = path.match(/^\/api\/hr\/assistant-assignments\/([^/]+)$/)
    if (asstAssignMatch && method === 'PUT') {
      if (session.role !== 'admin') {
        throw forbiddenError('Only admins can modify assistant assignments')
      }
      const assignId = asstAssignMatch[1]
      const body = await request.json<{
        status?: 'active' | 'paused' | 'revoked' | 'expired'
        can_access_transactions?: boolean
        can_access_contacts?: boolean
        expires_at?: string | null
      }>()

      const existing = await env.DB
        .prepare('SELECT * FROM assistant_assignments WHERE id = ? AND tenant_id = ?')
        .bind(assignId, session.tenantId)
        .first()
      if (!existing) return err('Assignment not found', 404)

      const updates: string[] = []
      const binds: any[] = []
      if (body.status !== undefined) { updates.push('status = ?'); binds.push(body.status) }
      if (body.can_access_transactions !== undefined) { updates.push('can_access_transactions = ?'); binds.push(body.can_access_transactions ? 1 : 0) }
      if (body.can_access_contacts !== undefined) { updates.push('can_access_contacts = ?'); binds.push(body.can_access_contacts ? 1 : 0) }
      if (body.expires_at !== undefined) { updates.push('expires_at = ?'); binds.push(body.expires_at) }
      updates.push('updated_at = datetime("now")')

      if (updates.length > 1) {
        binds.push(assignId, session.tenantId)
        await env.DB.prepare(`UPDATE assistant_assignments SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`).bind(...binds).run()
      }

      return ok({ success: true })
    }

    // DELETE /api/hr/assistant-assignments/:id — revoke assignment
    if (asstAssignMatch && method === 'DELETE') {
      if (session.role !== 'admin') {
        throw forbiddenError('Only admins can revoke assistant assignments')
      }
      const assignId = asstAssignMatch[1]
      await env.DB.prepare('UPDATE assistant_assignments SET status = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?').bind('revoked', asstAssignMatch[1], session.tenantId).run()
      return ok({ success: true, message: 'Assignment revoked' })
    }

    return err('HR endpoint not found', 404)
  }

  // ── Tenant Branding & Dashboard Settings — /api/tenant/* ─────────────────────────
  if (path.startsWith('/api/tenant/')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    // PUT /api/tenant/branding
    if (path === '/api/tenant/branding' && method === 'PUT') {
      if (!['admin', 'broker'].includes(session.role)) {
        return forbiddenError('Only admins or brokers can modify tenant branding settings')
      }

      const body = await request.json<{
        companyName?: string
        primaryColor?: string
        accentColor?: string
        tagline?: string
        websiteUrl?: string
        logoUrl?: string
        companyLicenseNumber?: string
        syncCompanyLicense?: boolean
      }>()

      const existingTenant = await env.DB
        .prepare('SELECT company_license_number FROM tenants WHERE id = ?')
        .bind(session.tenantId)
        .first<{ company_license_number: string | null }>()

      const hasCompanyLicenseField = body.companyLicenseNumber !== undefined
      const normalizedCompanyLicense = hasCompanyLicenseField
        ? (body.companyLicenseNumber || '').trim().toUpperCase()
        : null

      await env.DB
        .prepare(`UPDATE tenants SET
          name = COALESCE(?, name),
          primary_color = COALESCE(?, primary_color),
          accent_color = COALESCE(?, accent_color),
          tagline = ?,
          website_url = ?,
          logo_url = COALESCE(?, logo_url),
          company_license_number = CASE WHEN ? = 1 THEN ? ELSE company_license_number END
          WHERE id = ?`)
        .bind(
          body.companyName ?? null,
          body.primaryColor ?? null,
          body.accentColor ?? null,
          body.tagline ?? null,
          body.websiteUrl ?? null,
          body.logoUrl ?? null,
          hasCompanyLicenseField ? 1 : 0,
          normalizedCompanyLicense,
          session.tenantId
        )
        .run()

      let licenseSync: any = null
      if (normalizedCompanyLicense) {
        const previousCompanyLicense = (existingTenant?.company_license_number || '').trim().toUpperCase()
        const shouldSync = body.syncCompanyLicense === true || normalizedCompanyLicense !== previousCompanyLicense
        if (shouldSync) {
          licenseSync = await syncCompanyLicenseDataFromNY(env.DB, session.tenantId, normalizedCompanyLicense)
        }
      }

      const tenant = await getTenant(env.DB, session.tenantId)

      return ok({ message: 'Branding updated successfully', tenant, licenseSync })
    }

    // PUT /api/tenant/dashboard-settings
    if (path === '/api/tenant/dashboard-settings' && method === 'PUT') {
      if (session.role !== 'admin') {
        return forbiddenError('Only admins can modify dashboard settings')
      }

      const body = await request.json<any>()
      await env.DB
        .prepare('UPDATE tenants SET dashboard_settings = ? WHERE id = ?')
        .bind(JSON.stringify(body), session.tenantId)
        .run()

      return ok({ message: 'Dashboard settings updated successfully' })
    }

    return err('Tenant endpoint not found', 404)
  }

  // ── CRM proxy — /api/contacts/* ─────────────────────────────────────────────
  // Validates auth + permissions, injects context headers, proxies to re-crm service binding
  if (path.startsWith('/api/contacts') || path === '/api/contacts/stats') {
    const session = await requireAuth(request, env.JWT_SECRET)

    // Assistant assignment resolution (if role=assistant)
    let assistantCtx: AssistantAssignmentResult | null = null
    if (session.role === 'assistant') {
      assistantCtx = await resolveAssistantAssignment(env.DB, session.userId, session.tenantId)
      if (!assistantCtx || assistantCtx.canAccessContacts === 0) {
        throw forbiddenError('Assistant has no active assignment or no contacts scope')
      }
    }

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'crm', action, env.DB))) {
      throw forbiddenError(`No ${action} access to CRM`)
    }

    // Build a new request with auth context headers (CRM worker trusts these)
    const headers: Record<string, string> = {
      ...Object.fromEntries(request.headers.entries()),
      'X-User-Id':   session.userId,
      'X-Tenant-Id': session.tenantId,
      'X-User-Role': session.role,
      // Strip the auth cookie so CRM never tries to re-validate
      'Cookie': '',
    }
    if (assistantCtx) {
      headers['X-Internal-Principal-Id'] = assistantCtx.principalId
      headers['X-Internal-Assignment-Id'] = assistantCtx.assignmentId
      headers['X-Internal-Can-Transactions'] = String(assistantCtx.canAccessTransactions)
      headers['X-Internal-Can-Contacts'] = String(assistantCtx.canAccessContacts)
      headers['X-Internal-Assistant-Id'] = assistantCtx.assistantId
    }
    // Strip any client-supplied internal headers
    const internalHeaders = [
      'X-Internal-Principal-Id',
      'X-Internal-Assignment-Id',
      'X-Internal-Can-Transactions',
      'X-Internal-Can-Contacts',
      'X-Internal-Assistant-Id',
    ]
    for (const h of internalHeaders) {
      if (headers[h] && !assistantCtx) delete headers[h]
    }

    const crmRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
      // @ts-ignore duplex needed for streaming
      duplex: 'half',
    })

    return env.CRM.fetch(crmRequest)
  }

  // ── Stats aggregator — /api/stats ──────────────────────────────────────────────
  if (path === '/api/stats' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)

    let contactsCount = 0
    let transactionsCount = 0
    let networkCount = 0
    let activeListingsCount = 0

    // 1. Fetch CRM contacts stats
    if (await can(session.userId, session.role, 'crm', 'read', env.DB)) {
      try {
        const crmReq = new Request(`${url.origin}/api/contacts/stats`, {
          headers: {
            'X-User-Id': session.userId,
            'X-Tenant-Id': session.tenantId,
            'X-User-Role': session.role,
          }
        })
        const crmRes = await env.CRM.fetch(crmReq)
        if (crmRes.ok) {
          const crmData: any = await crmRes.json()
          if (crmData.success && crmData.data) {
            contactsCount = crmData.data.total || 0
          }
        }
      } catch (e) {
        console.error('Failed to fetch CRM stats:', e)
      }
    }

    // 2. Fetch Transactions stats
    if (await can(session.userId, session.role, 'transactions', 'read', env.DB)) {
      try {
        const txnReq = new Request(`${url.origin}/api/transactions/stats`, {
          headers: {
            'X-User-Id': session.userId,
            'X-Tenant-Id': session.tenantId,
            'X-User-Role': session.role,
          }
        })
        const txnRes = await env.TRANSACTIONS.fetch(txnReq)
        if (txnRes.ok) {
          const txnData: any = await txnRes.json()
          if (txnData.success && txnData.data) {
            // Count all open pipeline deals for the dashboard "Active Transactions" metric
            const d = txnData.data
            transactionsCount = (d.active || 0) + (d.offer_received || 0) + (d.under_contract || 0) + (d.lead || 0)
          }
        }
      } catch (e) {
        console.error('Failed to fetch transaction stats:', e)
      }
    }

    // 3. Count Network connections locally in D1
    if (await can(session.userId, session.role, 'network', 'read', env.DB)) {
      try {
        const netRes = await env.DB
          .prepare('SELECT COUNT(*) as count FROM network_connections WHERE tenant_id = ?')
          .bind(session.tenantId)
          .first<{ count: number }>()
        networkCount = netRes?.count || 0
      } catch (e) {
        console.error('Failed to fetch network stats:', e)
      }
    }

    // 4. Fetch Active listings count from Inventory
    if (await can(session.userId, session.role, 'listings', 'read', env.DB)) {
      try {
        const invUrl = `${env.INVENTORY_WORKER_URL}/api/projects`
        const invRes = await fetch(invUrl, { headers: { 'Accept': 'application/json' } })
        if (invRes.ok) {
          const invData: any = await invRes.json()
          const listings = invData.listings || invData.projects || invData.entries || []
          activeListingsCount = listings.filter((l: any) => l.status === 'active' || l.status === 'published').length
        }
      } catch (e) {
        console.error('Failed to fetch inventory stats:', e)
      }
    }

    return ok({
      activeListings: activeListingsCount,
      crmContacts: contactsCount,
      transactions: transactionsCount,
      network: networkCount
    })
  }

  // ── Open Houses Proxy — /api/openhouses ──────────────────────────────────
  if (path === '/api/openhouses' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)
    if (!(await can(session.userId, session.role, 'marketing', 'read', env.DB))) {
      throw forbiddenError('No access to Open Houses')
    }
    const urls = [
      `${env.OPENHOUSE_WORKER_URL}/api/events/list`,
      'https://openhouse.primeamericarealestate.com/api/events/list',
    ]
    // Forward user's session cookie for upstream authentication
    const cookieHeader = request.headers.get('Cookie')
    const fetchHeaders: Record<string, string> = {
      'Accept': 'application/json',
    }
    if (cookieHeader) {
      fetchHeaders['Cookie'] = cookieHeader
    }
    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: fetchHeaders })
        if (res.ok) {
          const data: any = await res.json()
          return ok(data.events || [])
        }
      } catch (e) {
        continue
      }
    }
    // All upstream services unavailable
    return error('Open House service is temporarily unavailable', 503)
  }

  // ── Transactions proxy — /api/transactions/* ─────────────────────────────────────────────
  if (path.startsWith('/api/transactions')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    // Assistant assignment resolution (if role=assistant)
    let assistantCtx: AssistantAssignmentResult | null = null
    if (session.role === 'assistant') {
      assistantCtx = await resolveAssistantAssignment(env.DB, session.userId, session.tenantId)
      if (!assistantCtx || assistantCtx.canAccessTransactions === 0) {
        throw forbiddenError('Assistant has no active assignment or no transactions scope')
      }
    }

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'transactions', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Transactions`)
    }

    const txnBody = ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer()

    const headers: Record<string, string> = {
      ...Object.fromEntries(request.headers.entries()),
      'X-User-Id':   session.userId,
      'X-Tenant-Id': session.tenantId,
      'X-User-Role': session.role,
      'Cookie': '',
    }
    if (assistantCtx) {
      headers['X-Internal-Principal-Id'] = assistantCtx.principalId
      headers['X-Internal-Assignment-Id'] = assistantCtx.assignmentId
      headers['X-Internal-Can-Transactions'] = String(assistantCtx.canAccessTransactions)
      headers['X-Internal-Can-Contacts'] = String(assistantCtx.canAccessContacts)
      headers['X-Internal-Assistant-Id'] = assistantCtx.assistantId
    }
    // Strip any client-supplied internal headers
    const internalHeaders = [
      'X-Internal-Principal-Id',
      'X-Internal-Assignment-Id',
      'X-Internal-Can-Transactions',
      'X-Internal-Can-Contacts',
      'X-Internal-Assistant-Id',
    ]
    for (const h of internalHeaders) {
      if (headers[h] && !assistantCtx) delete headers[h]
    }

    const txnRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: txnBody,
    })

    return env.TRANSACTIONS.fetch(txnRequest)
  }

// ── Listings proxy — /api/listings/* ─────────────────────────────────────────────
  if (path.startsWith('/api/listings')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    // Check specific sub-route for listing map settings
    const mapSettingsMatch = path.match(/^\/api\/listings\/([^/]+)\/map-settings$/)
    if (mapSettingsMatch) {
      const listingId = mapSettingsMatch[1]
      const action = ['GET', 'HEAD'].includes(method) ? 'read' : 'write'
      if (!(await can(session.userId, session.role, 'listings', action, env.DB))) {
        throw forbiddenError(`No ${action} access to Listings Map Settings`)
      }

      if (method === 'GET') {
        const settings = await env.DB.prepare('SELECT lat, lng, categories FROM listing_map_settings WHERE listing_id = ?')
          .bind(listingId)
          .first<{ lat: number | null; lng: number | null; categories: string | null }>()
        if (settings) {
          let parsedCats = null
          if (settings.categories) {
            try {
              parsedCats = JSON.parse(settings.categories)
            } catch (e) {}
          }
          return ok({
            lat: settings.lat,
            lng: settings.lng,
            categories: parsedCats
          })
        }
        return ok(null)
      }

      if (method === 'POST') {
        const body: any = await request.json()
        const lat = body.lat ?? null
        const lng = body.lng ?? null
        const categories = body.categories ? JSON.stringify(body.categories) : null

        await env.DB.prepare(`
          INSERT INTO listing_map_settings (listing_id, lat, lng, categories, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(listing_id) DO UPDATE SET
            lat = excluded.lat,
            lng = excluded.lng,
            categories = excluded.categories,
            updated_at = datetime('now')
        `)
          .bind(listingId, lat, lng, categories)
          .run()

        return ok({ success: true })
      }
    }

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'listings', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Listings`)
    }

    // Proxy request to the inventory worker
    const targetUrl = new URL(request.url)
    const proxyUrl = `${env.INVENTORY_WORKER_URL}${targetUrl.pathname}${targetUrl.search}`

    try {
      // Forward user's session cookie for upstream SSO authentication
      const cookieHeader = request.headers.get('Cookie')
      const proxyHeaders: Record<string, string> = {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
      }
      if (cookieHeader) {
        proxyHeaders['Cookie'] = cookieHeader
      }

      const response = await fetch(proxyUrl, {
        method: request.method,
        headers: proxyHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        cf: { cacheTtl: 0 },
      })

      // Check if response is JSON before passing through
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        // Upstream returned non-JSON error (e.g., HTML 522 page)
        const text = await response.text().catch(() => '')
        console.error(`Listings proxy: upstream returned ${response.status} (${contentType}): ${text.slice(0, 200)}`)
        return error('Listing service is temporarily unavailable', 503)
      }

      const data = await response.json().catch(() => null)
      if (!data) {
        return error('Listing service returned invalid response', 502)
      }

      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Listings proxy error:', error)
      return error('Failed to connect to listing service', 503)
    }
  }

  // ── Documents (R2 Storage) — /api/documents/* ────────────────────────────
  if (path.startsWith('/api/documents')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'storage', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Documents`)
    }

    // Upload a document
    if (path === '/api/documents' && request.method === 'POST') {
      const formData = await request.formData()
      const entity_type = formData.get('entity_type') as string
      const entity_id = formData.get('entity_id') as string
      const file = formData.get('file') as File

      if (!entity_type || !entity_id || !file) {
        return err('Missing required fields', 400)
      }

      const id = newId()
      const fileExt = file.name.split('.').pop()
      const fileKey = `${session.tenantId}/${entity_type}/${entity_id}/${id}.${fileExt}`

      await env.ASSETS_BUCKET.put(fileKey, file.stream(), {
        httpMetadata: { contentType: file.type }
      })

      await env.DB.prepare(`
        INSERT INTO documents (id, tenant_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, uploaded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, session.tenantId, entity_type, entity_id, file.name, fileKey, file.type, file.size, session.userId).run()

      // Trigger notification
      await createNotification(
        env.DB,
        session.tenantId,
        `New document "${file.name}" uploaded to ${entity_type === 'transaction' ? 'deal' : entity_type} by ${session.role}`
      )

      return ok({ id, file_name: file.name, size: file.size })
    }

    // List documents for an entity
    if (path === '/api/documents' && request.method === 'GET') {
      const urlParams = new URL(request.url).searchParams
      const entity_type = urlParams.get('entity_type')
      const entity_id = urlParams.get('entity_id')
      if (!entity_type || !entity_id) return err('Missing entity filters', 400)

      const { results } = await env.DB.prepare(`
        SELECT d.*, u.first_name, u.last_name
        FROM documents d
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.tenant_id = ? AND d.entity_type = ? AND d.entity_id = ?
        ORDER BY d.created_at DESC
      `).bind(session.tenantId, entity_type, entity_id).all()

      return ok(results)
    }

    // Download a document
    const docMatch = path.match(/^\/api\/documents\/([^/]+)\/download$/)
    if (docMatch && request.method === 'GET') {
      const docId = docMatch[1]
      const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').bind(docId, session.tenantId).first()
      if (!doc) return err('Not found', 404)

      const object = await env.ASSETS_BUCKET.get(doc.file_key as string)
      if (!object) return err('File not found in storage', 404)

      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set('Content-Disposition', `attachment; filename="${doc.file_name}"`)

      return new Response(object.body, { headers })
    }

    // Delete a document
    const deleteMatch = path.match(/^\/api\/documents\/([^/]+)$/)
    if (deleteMatch && request.method === 'DELETE') {
      const docId = deleteMatch[1]
      const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').bind(docId, session.tenantId).first()
      if (!doc) return err('Not found', 404)

      await env.ASSETS_BUCKET.delete(doc.file_key as string)
      await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(docId).run()
      return ok({ success: true })
    }

    return err('Documents endpoint not found', 404)
  }

  // ── Notifications — /api/notifications ────────────────────────────────────────
  if (path === '/api/notifications' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)
    try {
      const { results } = await env.DB
        .prepare('SELECT * FROM notifications WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100')
        .bind(session.tenantId)
        .all<{ id: string; message: string; created_at: string }>()
      return ok(results || [])
    } catch (e) {
      console.error('Failed to load notifications', e)
      return ok([])
    }
  }

  // ── Notifications — Mark as read ─────────────────────────────────────────────
  const notificationReadMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/)
  if (notificationReadMatch && method === 'POST') {
    const session = await requireAuth(request, env.JWT_SECRET)
    const notificationId = notificationReadMatch[1]
    try {
      await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND tenant_id = ?')
        .bind(notificationId, session.tenantId)
        .run()
      return ok({ success: true })
    } catch (e) {
      console.error('Failed to mark notification as read', e)
      return err('Failed to mark notification as read', 500)
    }
  }

  // ── Notifications — Delete ──────────────────────────────────────────────────
  const notificationDeleteMatch = path.match(/^\/api\/notifications\/([^/]+)$/)
  if (notificationDeleteMatch && method === 'DELETE') {
    const session = await requireAuth(request, env.JWT_SECRET)
    const notificationId = notificationDeleteMatch[1]
    try {
      await env.DB.prepare('DELETE FROM notifications WHERE id = ? AND tenant_id = ?')
        .bind(notificationId, session.tenantId)
        .run()
      return ok({ success: true })
    } catch (e) {
      console.error('Failed to delete notification', e)
      return err('Failed to delete notification', 500)
    }
  }

  // ── Notifications — Mark all as read ────────────────────────────────────────
  if (path === '/api/notifications/read-all' && method === 'POST') {
    const session = await requireAuth(request, env.JWT_SECRET)
    try {
      await env.DB.prepare('UPDATE notifications SET is_read = 1 WHERE tenant_id = ? AND is_read = 0')
        .bind(session.tenantId)
        .run()
      return ok({ success: true })
    } catch (e) {
      console.error('Failed to mark all notifications as read', e)
      return err('Failed to mark all notifications as read', 500)
    }
  }

  // ── Notifications (SSE) — /api/notifications/stream ─────────────────────
  if (path === '/api/notifications/stream' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)

    let lastChecked = new Date().toISOString()
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(': ok\n\n'))

        while (true) {
          try {
            const { results } = await env.DB
              .prepare('SELECT * FROM notifications WHERE tenant_id = ? AND created_at > ? ORDER BY created_at ASC')
              .bind(session.tenantId, lastChecked)
              .all<{ id: string; message: string; created_at: string }>()

            if (results && results.length > 0) {
              for (const row of results) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`))
                if (row.created_at > lastChecked) {
                  lastChecked = row.created_at
                }
              }
            }
          } catch (e) {
            console.error('SSE D1 read error', e)
            break
          }
          await new Promise(r => setTimeout(r, 4000))
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
  }

  // ── Network (Phase 5) — /api/network/* ──────────────────────────────────
  // ── Network (Phase 5) — /api/network/* ──────────────────────────────────
  if (path.startsWith('/api/network')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'network', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Network`)
    }

    // List Referrals
    if (path === '/api/network/referrals' && request.method === 'GET') {
      let queryStr = `
        SELECT r.*, u.name as sender_name, c.name as connection_name, c.type as connection_type
        FROM network_referrals r
        JOIN users u ON u.id = r.sender_id
        JOIN network_connections c ON c.id = r.recipient_connection_id
        WHERE r.tenant_id = ?
      `
      const binds = [session.tenantId]
      if (session.role === 'salesperson') {
        queryStr += ' AND (r.sender_id = ? OR c.created_by = ?)'
        binds.push(session.userId, session.userId)
      }
      queryStr += ' ORDER BY r.created_at DESC'
      const { results } = await env.DB.prepare(queryStr).bind(...binds).all()
      return ok(results)
    }

    // Create Referral
    if (path === '/api/network/referrals' && request.method === 'POST') {
      const body: any = await request.json()
      const id = newId()
      await env.DB.prepare(`
        INSERT INTO network_referrals (id, tenant_id, sender_id, recipient_connection_id, client_name, client_email, client_phone, referral_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, session.tenantId, session.userId, body.recipient_connection_id,
        body.client_name, body.client_email || null, body.client_phone || null,
        body.referral_type || 'buy', body.notes || null
      ).run()

      await createNotification(
        env.DB,
        session.tenantId,
        `New B2B referral for "${body.client_name}" sent by ${session.role}`
      )
      return ok({ id })
    }

    // Update Referral Status
    const statusMatch = path.match(/^\/api\/network\/referrals\/([^/]+)\/status$/)
    if (statusMatch && request.method === 'PUT') {
      const referralId = statusMatch[1]
      const { status, experience_rating, experience_notes } = await request.json<{ status: string; experience_rating?: number; experience_notes?: string }>()
      await env.DB.prepare('UPDATE network_referrals SET status = ?, experience_rating = COALESCE(?, experience_rating), experience_notes = COALESCE(?, experience_notes) WHERE id = ? AND tenant_id = ?').bind(status, experience_rating ?? null, experience_notes ?? null, referralId, session.tenantId).run()

      if (status === 'completed') {
        await env.DB.prepare(`
          UPDATE network_connections
          SET successful_referrals = COALESCE(successful_referrals, 0) + 1
          WHERE id = (
            SELECT recipient_connection_id FROM network_referrals WHERE id = ? AND tenant_id = ?
          ) AND tenant_id = ?
        `).bind(referralId, session.tenantId, session.tenantId).run()
      }
      return ok({ success: true })
    }

    // List Connections
    if (path === '/api/network' && request.method === 'GET') {
      // Refresh aggregated referral counters for analytics display.
      await env.DB.prepare(`
        UPDATE network_connections
        SET total_referrals = (
          SELECT COUNT(*) FROM network_referrals r
          WHERE r.recipient_connection_id = network_connections.id
            AND r.tenant_id = network_connections.tenant_id
        ),
            successful_referrals = (
          SELECT COUNT(*) FROM network_referrals r
          WHERE r.recipient_connection_id = network_connections.id
            AND r.tenant_id = network_connections.tenant_id
            AND r.status = 'completed'
        )
        WHERE tenant_id = ?
      `).bind(session.tenantId).run()

      let queryStr = 'SELECT * FROM network_connections WHERE tenant_id = ?'
      const binds = [session.tenantId]
      if (session.role === 'salesperson') {
        queryStr += ' AND (created_by = ? OR is_private = 0)'
        binds.push(session.userId)
      }
      queryStr += ' ORDER BY connected_at DESC'
      const { results } = await env.DB.prepare(queryStr).bind(...binds).all()
      return ok(results)
    }

    // Create Connection
    if (path === '/api/network' && request.method === 'POST') {
      const body: any = await request.json()
      const id = newId()

      await env.DB.prepare(`
        INSERT INTO network_connections (id, tenant_id, created_by, name, title, company, email, phone, telephone, fax, website, poi, picture_url, type, notes, experience_rating, experience_notes, is_private, business_card_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, session.tenantId, session.userId, body.name, body.title || null, body.company || null,
        body.email || null, body.phone || null, body.telephone || body.phone || null, body.fax || null,
        body.website || null, body.poi || null, body.picture_url || null,
        body.type || 'colleague', body.notes || null,
        body.experience_rating ? Number(body.experience_rating) : null,
        body.experience_notes || null,
        body.is_private ? 1 : 0, body.business_card_key || null
      ).run()

      // Trigger notification
      await createNotification(
        env.DB,
        session.tenantId,
        `New connection "${body.name}" (${body.type || 'colleague'}) added to the network`
      )

      return ok({ id })
    }

    // Update Connection
    const netUpdateMatch = path.match(/^\/api\/network\/([^/]+)$/)
    if (netUpdateMatch && request.method === 'PUT') {
      const id = netUpdateMatch[1]
      const body: any = await request.json()

      await env.DB.prepare(`
        UPDATE network_connections
        SET name = ?, title = ?, company = ?, email = ?, phone = ?, telephone = ?, fax = ?, website = ?, poi = ?, picture_url = ?,
            type = ?, notes = ?, experience_rating = ?, experience_notes = ?, is_private = ?, business_card_key = ?
        WHERE id = ? AND tenant_id = ?
      `).bind(
        body.name, body.title || null, body.company || null, body.email || null, body.phone || null,
        body.telephone || body.phone || null, body.fax || null, body.website || null, body.poi || null, body.picture_url || null,
        body.type, body.notes || null,
        body.experience_rating ? Number(body.experience_rating) : null,
        body.experience_notes || null,
        body.is_private ? 1 : 0, body.business_card_key || null,
        id, session.tenantId
      ).run()

      return ok({ success: true })
    }

    // Delete Connection
    const netDeleteMatch = path.match(/^\/api\/network\/([^/]+)$/)
    if (netDeleteMatch && request.method === 'DELETE') {
      const id = netDeleteMatch[1]
      await env.DB.prepare('DELETE FROM network_connections WHERE id = ? AND tenant_id = ?').bind(id, session.tenantId).run()
      return ok({ success: true })
    }

    return err('Network endpoint not found', 404)
  }

  // ── 404 for unmatched /api/* ─────────────────────────────────────────────
  return err('Not found', 404)
}
