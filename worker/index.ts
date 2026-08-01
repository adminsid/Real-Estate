/**
 * RE Workspace — Cloudflare Worker (Gateway)
 *
 * Multi-tenant hostname-aware platform gateway.
 *
 * Serves:
 *   - Static frontend (Workers Sites / KV)
 *   - /api/auth/*  — Authentication + session management
 *   - /api/sso/*   — Cross-app SSO token issuance and validation
 *   - /api/hr/*    — User management, permissions, invitations, impersonation
 *
 * Tenant resolution: hostname → tenant_hostnames DB table
 *   workspace.primeamericany.com → tenant_primeamerica (first tenant)
 *   Future tenant hostnames → their respective tenants
 *
 * Cross-app SSO:
 *   Apps on *.primeamericarealestate.com share the re_session cookie (Domain=.primeamericarealestate.com)
 *   Apps on different apex domains (workspace.primeamericany.com) use /api/sso/token redirect flow
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
  SESSION_TTL,
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
import {
  resolveOrCreateTenant,
  getTenant,
  isPrimeAmericaEmail,
  resolveTenantForHostname,
  getPrimaryHostname,
} from './lib/tenant'

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
  /** Canonical workers.dev platform URL — used as email link fallback if no tenant primary hostname found */
  PLATFORM_HOSTNAME: string
  FROM_EMAIL: string
  INVENTORY_WORKER_URL: string
  OPENHOUSE_WORKER_URL: string
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

function toCSV(headers: string[], rows: any[][]): string {
  const escape = (val: any) => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const headerLine = headers.map(escape).join(',')
  const rowLines = rows.map(row => row.map(escape).join(','))
  return [headerLine, ...rowLines].join('\n')
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow origins from any of our controlled domains plus localhost for development.
// The list is hardcoded as a starting point; tenant hostnames from the DB are
// checked dynamically in corsHeaders() when a DB is available.

const STATIC_ALLOWED_ORIGINS = [
  'https://re-workspace.lama-4db.workers.dev',
  'https://workspace.primeamericany.com',
  'https://inventory.primeamericarealestate.com',
  'https://openhouse.primeamericarealestate.com',
  'https://inside.primeamericarealestate.com',
  'https://cabinet.primeamericarealestate.com',
  'https://cabinet.lama-4db.workers.dev',
  'https://prime-america-kb.lama-4db.workers.dev',
  'http://localhost:5173',
  'http://localhost:4173',
]

function corsHeaders(origin: string): Record<string, string> {
  // Allow any *.primeamericarealestate.com or *.primeamericany.com origin
  const isDynamicAllowed =
    /^https:\/\/[a-z0-9-]+\.primeamericarealestate\.com$/.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.primeamericany\.com$/.test(origin)

  const isAllowed = STATIC_ALLOWED_ORIGINS.includes(origin) || isDynamicAllowed

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : STATIC_ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SSO-Token',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
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
  autoCreatedUsers: number
  autoCreatedList: Array<{ name: string; licenseNumber: string | null; email: string }>
  removedUsersList: Array<{ id: string; name: string; licenseNumber: string | null; email: string }>
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

  // Fetch all existing workspace users for matching & auto-provisioning
  const existingUsers = await db
    .prepare('SELECT id, name, license_number, email, role FROM users WHERE tenant_id = ?')
    .bind(tenantId)
    .all<{ id: string; name: string; license_number: string | null; email: string; role: string }>()

  const existingUserList = existingUsers.results || []
  const matchedUserIds = new Set<string>()
  const matchedAgentKeys = new Set<string>()

  let matchedUsers = 0
  for (const user of existingUserList) {
    const userTokens = normalizeName(user.name || '').split(' ').filter(Boolean)
    if (userTokens.length < 2) continue

    const first = userTokens[0]
    const last = userTokens[userTokens.length - 1]
    const matched = agents.find((agent) => {
      if (user.license_number && agent.license_number && user.license_number.trim().toUpperCase() === agent.license_number.trim().toUpperCase()) {
        return true
      }
      const holder = normalizeName(agent.license_holder_name || '')
      return holder.includes(first) && holder.includes(last)
    })

    if (!matched) continue

    const agentKey = (matched.license_number || '').trim() || (matched.license_holder_name || '').trim()
    matchedAgentKeys.add(agentKey)
    matchedUserIds.add(user.id)

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

  // Auto-provision user profiles for unlinked active agents from NY DOS dataset
  const autoCreatedList: Array<{ name: string; licenseNumber: string | null; email: string }> = []
  for (const agent of agents) {
    if (!agent.license_holder_name) continue
    const licNo = (agent.license_number || '').trim()
    const agentKey = licNo || agent.license_holder_name.trim()

    if (matchedAgentKeys.has(agentKey)) continue

    const newUserId = `usr_ny_${crypto.randomUUID().replace(/-/g, '')}`
    const placeholderEmail = `unclaimed_${(licNo || crypto.randomUUID().slice(0, 8)).toLowerCase()}@primeamericany.com`
    const isBroker = (agent.license_type || '').toLowerCase().includes('broker')
    const role = isBroker ? 'associate_broker' : 'salesperson'
    const title = agent.license_type || 'Licensed Real Estate Salesperson'

    await db
      .prepare(`
        INSERT INTO users (
          id, tenant_id, email, password_hash, name, role,
          license_number, license_state, license_expiration_date,
          title, is_active, email_verified, created_at, updated_at
        ) VALUES (
          ?, ?, ?, 'UNCLAIMED_NY_IMPORT', ?, ?,
          ?, 'NY', ?,
          ?, 0, 0, datetime('now'), datetime('now')
        )
      `)
      .bind(
        newUserId,
        tenantId,
        placeholderEmail.toLowerCase(),
        agent.license_holder_name.trim(),
        role,
        licNo || null,
        isoDatePart(agent.license_expiration_date),
        title,
      )
      .run()

    autoCreatedList.push({
      name: agent.license_holder_name.trim(),
      licenseNumber: licNo || null,
      email: placeholderEmail,
    })
  }

  // Compute removed/missing agents: users who have a license number or salesperson/broker role but were NOT matched in active NY DOS dataset
  const removedUsersList = existingUserList
    .filter((u) => ['salesperson', 'broker', 'associate_broker'].includes(u.role) && !matchedUserIds.has(u.id) && !u.email.startsWith('unclaimed_'))
    .map((u) => ({
      id: u.id,
      name: u.name,
      licenseNumber: u.license_number || null,
      email: u.email,
    }))

  return {
    businessName,
    totalAgents: agents.length,
    matchedUsers,
    autoCreatedUsers: autoCreatedList.length,
    autoCreatedList,
    removedUsersList,
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
    const hostname = url.hostname

    // CORS preflight
    if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // ── API Routes ───────────────────────────────────────────────────────────
    if (path.startsWith('/api/')) {
      try {
        const response = await handleApi(request, env, path, url, hostname)
        // Attach CORS headers to all API responses
        const corsH = corsHeaders(origin)
        const newHeaders = new Headers(response.headers)
        for (const [k, v] of Object.entries(corsH)) {
          // Don't overwrite Set-Cookie
          if (k !== 'Set-Cookie') newHeaders.set(k, v)
        }
        return new Response(response.body, { status: response.status, headers: newHeaders })
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

async function handleApi(request: Request, env: Env, path: string, url: URL, hostname = ''): Promise<Response> {
  // ── Derive the base URL for email links from the request hostname ──────────
  // This replaces the old hardcoded APP_BASE_URL env var.
  // Email links will point to the correct tenant hostname automatically.
  const requestBaseUrl = `${url.protocol}//${url.host}`
  const method = request.method

  if (path === '/api/health') {
    return ok({ status: 'ok', app: env.APP_NAME, env: env.APP_ENV, ts: Date.now(), inventory_url: env.INVENTORY_WORKER_URL, platform_hostname: env.PLATFORM_HOSTNAME })
  }

  // ════════════════════════════════════════════════════════════════════════
  // SSO ROUTES — Cross-app authentication
  // These endpoints allow other Prime America-controlled apps to validate
  // sessions and participate in single sign-on.
  // ════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/sso/validate?token=<sso_token>
   * Called by other Prime America apps to validate a cross-domain SSO token.
   * Returns user identity and permissions on success.
   * The token is single-use and expires in 5 minutes.
   */
  if (path === '/api/sso/validate' && request.method === 'GET') {
    const token = url.searchParams.get('token')
    if (!token) return err('Missing token', 400)

    const ssoRow = await env.DB
      .prepare(`SELECT * FROM sso_tokens WHERE token = ? AND used_at IS NULL AND expires_at > datetime('now')`)
      .bind(token)
      .first<{ token: string; user_id: string; tenant_id: string; target_app: string; return_to: string | null }>()

    if (!ssoRow) return err('Invalid or expired SSO token', 401)

    // Mark as used (one-time use)
    await env.DB
      .prepare(`UPDATE sso_tokens SET used_at = datetime('now') WHERE token = ?`)
      .bind(token)
      .run()

    const user = await env.DB
      .prepare('SELECT * FROM users WHERE id = ? AND is_active = 1')
      .bind(ssoRow.user_id)
      .first<UserRow>()

    if (!user) return err('User not found or inactive', 401)

    const tenant = await getTenant(env.DB, ssoRow.tenant_id)
    const permissions = await serializePermissions(user.id, user.role, env.DB)

    return ok({
      user: safeUser(user),
      tenant,
      permissions,
      targetApp: ssoRow.target_app,
      returnTo: ssoRow.return_to,
    })
  }

  /**
   * POST /api/sso/token
   * Issues a short-lived SSO token for a logged-in user.
   * Used when another app needs to verify the user's identity.
   * The token is returned and the calling app can use /api/sso/validate to verify it.
   */
  if (path === '/api/sso/token' && request.method === 'POST') {
    const session = await getSession(request, env.JWT_SECRET)
    if (!session) return authError()

    const body = await request.json<{ targetApp?: string; returnTo?: string }>().catch(() => ({}))
    const targetApp = body.targetApp || 'unknown'
    const returnTo = body.returnTo || null

    const token = generateToken(32)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes

    await env.DB
      .prepare('INSERT INTO sso_tokens (token, user_id, tenant_id, target_app, return_to, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(token, session.userId, session.tenantId, targetApp, returnTo, expiresAt)
      .run()

    return ok({ token, expiresAt, targetApp })
  }

  /**
   * GET /api/sso/redirect?app=<hostname>&return_to=<url>
   * Initiates a cross-domain SSO redirect flow.
   * The user must be logged in. A one-time token is issued and they are
   * redirected to the target app with ?sso_token=<token> in the URL.
   * The target app then calls /api/sso/validate?token=<token> to get the user identity.
   */
  if (path === '/api/sso/redirect' && request.method === 'GET') {
    let targetApp = url.searchParams.get('app') || ''
    if (targetApp === 'cabinet' || targetApp === 'cabinet-ai') {
      targetApp = 'cabinet.primeamericarealestate.com'
    }
    const returnTo = url.searchParams.get('return_to') || ''

    const session = await getSession(request, env.JWT_SECRET)

    if (!session) {
      // Not logged in — redirect to login with the original redirect intent
      const loginUrl = new URL(`${requestBaseUrl}/login`)
      loginUrl.searchParams.set('redirect', url.toString())
      return Response.redirect(loginUrl.toString(), 302)
    }

    // Validate the target app is a registered controlled app
    let appRow = await env.DB
      .prepare('SELECT hostname, controlled, sso_capable FROM app_registry WHERE hostname = ? AND controlled = 1 AND sso_capable = 1')
      .bind(targetApp)
      .first<{ hostname: string; controlled: number; sso_capable: number }>()

    if (!appRow && (targetApp === 'cabinet.primeamericarealestate.com' || targetApp.includes('cabinet') || targetApp.includes('prime-america-kb'))) {
      appRow = { hostname: targetApp, controlled: 1, sso_capable: 1 }
    }

    if (!appRow) {
      return err(`SSO redirect not available for ${targetApp}. This may be a third-party app.`, 400)
    }

    const token = generateToken(32)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    await env.DB
      .prepare('INSERT INTO sso_tokens (token, user_id, tenant_id, target_app, return_to, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(token, session.userId, session.tenantId, targetApp, returnTo || null, expiresAt)
      .run()

    const targetUrl = new URL(`https://${targetApp}`)
    if (returnTo) {
      try {
        // Only redirect to the path/query part of returnTo for safety (prevent open redirect)
        const parsedReturnTo = new URL(returnTo)
        targetUrl.pathname = parsedReturnTo.pathname
        targetUrl.search = parsedReturnTo.search
      } catch {
        // returnTo was not a valid URL — ignore it
      }
    }
    targetUrl.searchParams.set('sso_token', token)

    return Response.redirect(targetUrl.toString(), 302)
  }

  /**
   * GET /api/sso/apps
   * Returns the list of Prime America-controlled apps and third-party vendor apps.
   * Used by the workspace to power the App Launcher.
   */
  if (path === '/api/sso/apps' && request.method === 'GET') {
    const apps = await env.DB
      .prepare('SELECT name, hostname, app_type, controlled, sso_capable, auth_model, notes FROM app_registry ORDER BY controlled DESC, name ASC')
      .all<{ name: string; hostname: string; app_type: string; controlled: number; sso_capable: number; auth_model: string; notes: string | null }>()
    return ok({ apps: apps.results })
  }

  // GET /api/public/verify-dns-target
  if (path === '/api/public/verify-dns-target' && method === 'GET') {
    return ok({ platform: 're-workspace', healthy: true })
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
      INSERT INTO contacts (id, tenant_id, assigned_to, first_name, last_name, email, phone, type, status, source, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'buyer', 'prospect', 'listing_inquiry', ?)
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
  // GET /api/public/tenant/branding
  if (path === '/api/public/tenant/branding' && method === 'GET') {
    const tenantRow = await resolveTenantForHostname(hostname, env.DB)
    if (!tenantRow) {
      return err('Tenant not found', 404)
    }
    return ok({
      tenant: tenantRow
    })
  }
  // GET /api/public/listings
  if (path === '/api/public/listings' && method === 'GET') {
    try {
      const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`, {
        headers: {
          'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
          'Accept': 'application/json',
        }
      })
      if (!response.ok) {
        throw new Error(`Inventory returned status ${response.status}`)
      }
      const data: any = await response.json()
      const listings = data.listings || data.data || data || []
      const normalized = listings.map((project: any) => {
        try {
          const pdata = project.data || {}
          const pick = (...values: any[]) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '')
          return {
            id: project.id || '',
            mlsNumber: project.id ? project.id.slice(0, 8) : '',
            address: project.address || `${pdata.streetNumber || ''} ${pdata.streetName || ''} ${pdata.streetSuffix || ''}`.trim() || 'No Address',
            city: project.city || pdata.city || '',
            state: project.state || pdata.stateOrProvince || '',
            zip: project.zip || pdata.postalCode || '',
            price: Number(project.price ?? pdata.listPrice ?? 0),
            propertyType: project.propertyType || pdata.propertyType || '',
            propertySubtype: project.propertySubtype || pdata.propertySubType || pdata.propertyType || '',
            latitude: Number(project.latitude ?? project.lat ?? pdata.latitude ?? pdata.lat ?? 0),
            longitude: Number(project.longitude ?? project.lng ?? pdata.longitude ?? pdata.lng ?? 0),
            bedrooms: Number(project.bedrooms ?? pdata.bedroomsTotal ?? 0),
            bathrooms: Number(project.bathrooms ?? pdata.bathroomsTotalInteger ?? 0),
            sqft: Number(project.sqft ?? pdata.livingArea ?? 0),
            lotSize: Number(project.lotSize ?? pdata.lotSizeArea ?? pdata.lotSizeSquareFeet ?? 0),
            yearBuilt: Number(project.yearBuilt ?? pdata.yearBuilt ?? 0),
            listing_agent_name: pick(project.listingAgentName, project.listing_agent_name, pdata.listAgentName, pdata.listingAgentName, pdata.listAgentFullName, pdata.listingAgentFullName) || null,
            listing_agent_email: pick(project.listingAgentEmail, project.listing_agent_email, pdata.listAgentEmail, pdata.listingAgentEmail, pdata.listAgentEmailAddress) || null,
            listing_agent_phone: pick(project.listingAgentPhone, project.listing_agent_phone, pdata.listAgentDirectPhone, pdata.listingAgentPhone, pdata.listAgentMobilePhone, pdata.listAgentOfficePhone) || null,
            listing_agent_brokerage: pick(project.listingAgentBrokerage, project.listing_agent_brokerage, pdata.listOfficeName, pdata.listingOfficeName, pdata.brokerageName) || null,
            description: project.description || pdata.publicRemarks || '',
            status: String(project.status || pdata.standardStatus || pdata.mLSStatus || pdata.status || 'active').toLowerCase().replace('closed', 'sold'),
            heroMediaUrl: project.heroMediaUrl || null,
            media: Array.isArray(project.media) ? project.media : [],
          }
        } catch (e) {
          console.error('Error normalizing public project:', project, e)
          return null
        }
      }).filter(Boolean)
      return ok(normalized)
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
      const detailResponse = await fetch(`${env.INVENTORY_WORKER_URL}/api/projects/${listingId}`, {
        headers: {
          'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
          'Accept': 'application/json',
        }
      })
      if (detailResponse.ok) {
        const detailData: any = await detailResponse.json()
        const project = detailData.project || detailData
        if (project && project.id) {
          const pdata = project.data || {}
          const pick = (...values: any[]) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '')
          const normalized = {
            id: project.id,
            address: project.address || `${pdata.streetNumber || ''} ${pdata.streetName || ''} ${pdata.streetSuffix || ''}`.trim(),
            city: project.city || pdata.city || '',
            state: project.state || pdata.stateOrProvince || '',
            zip: project.zip || pdata.postalCode || '',
            price: project.price ?? pdata.listPrice ?? null,
            propertyType: project.propertyType || pdata.propertyType || '',
            propertySubtype: project.propertySubtype || pdata.propertySubType || pdata.propertyType || '',
            latitude: project.latitude ?? project.lat ?? pdata.latitude ?? pdata.lat ?? null,
            longitude: project.longitude ?? project.lng ?? pdata.longitude ?? pdata.lng ?? null,
            bedrooms: project.bedrooms ?? pdata.bedroomsTotal ?? 0,
            bathrooms: project.bathrooms ?? pdata.bathroomsTotalInteger ?? 0,
            sqft: project.sqft ?? pdata.livingArea ?? 0,
            lotSize: project.lotSize ?? pdata.lotSizeArea ?? pdata.lotSizeSquareFeet ?? null,
            yearBuilt: project.yearBuilt ?? pdata.yearBuilt ?? null,
            listing_agent_name: pick(project.listingAgentName, project.listing_agent_name, pdata.listAgentName, pdata.listingAgentName, pdata.listAgentFullName, pdata.listingAgentFullName) || null,
            listing_agent_email: pick(project.listingAgentEmail, project.listing_agent_email, pdata.listAgentEmail, pdata.listingAgentEmail, pdata.listAgentEmailAddress) || null,
            listing_agent_phone: pick(project.listingAgentPhone, project.listing_agent_phone, pdata.listAgentDirectPhone, pdata.listingAgentPhone, pdata.listAgentMobilePhone, pdata.listAgentOfficePhone) || null,
            listing_agent_brokerage: pick(project.listingAgentBrokerage, project.listing_agent_brokerage, pdata.listOfficeName, pdata.listingOfficeName, pdata.brokerageName) || null,
            description: project.description || pdata.publicRemarks || '',
            status: String(project.status || pdata.standardStatus || pdata.mLSStatus || pdata.status || 'active').toLowerCase().replace('closed', 'sold'),
            heroMediaUrl: project.heroMediaUrl || null,
            media: Array.isArray(project.media) ? project.media : [],
            raw: project,
          }
          return ok(normalized)
        }
      }

      // Fallback to listings collection lookup for compatibility.
      const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`, {
        headers: {
          'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
          'Accept': 'application/json',
        }
      })
      const data: any = await response.json()
      const listings = data.listings || data.data || data || []
      const listing = listings.find((l: any) => l.id === listingId)
      if (listing) {
        try {
          const pdata = listing.data || {}
          const pick = (...values: any[]) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '')
          return ok({
            id: listing.id || '',
            mlsNumber: listing.id ? listing.id.slice(0, 8) : '',
            address: listing.address || `${pdata.streetNumber || ''} ${pdata.streetName || ''} ${pdata.streetSuffix || ''}`.trim() || 'No Address',
            city: listing.city || pdata.city || '',
            state: listing.state || pdata.stateOrProvince || '',
            zip: listing.zip || pdata.postalCode || '',
            price: Number(listing.price ?? pdata.listPrice ?? 0),
            propertyType: listing.propertyType || pdata.propertyType || '',
            propertySubtype: listing.propertySubtype || pdata.propertySubType || pdata.propertyType || '',
            latitude: Number(listing.latitude ?? listing.lat ?? pdata.latitude ?? pdata.lat ?? 0),
            longitude: Number(listing.longitude ?? listing.lng ?? pdata.longitude ?? pdata.lng ?? 0),
            bedrooms: Number(listing.bedrooms ?? pdata.bedroomsTotal ?? 0),
            bathrooms: Number(listing.bathrooms ?? pdata.bathroomsTotalInteger ?? 0),
            sqft: Number(listing.sqft ?? pdata.livingArea ?? 0),
            lotSize: Number(listing.lotSize ?? pdata.lotSizeArea ?? pdata.lotSizeSquareFeet ?? 0),
            yearBuilt: Number(listing.yearBuilt ?? pdata.yearBuilt ?? 0),
            listing_agent_name: pick(listing.listingAgentName, listing.listing_agent_name, pdata.listAgentName, pdata.listingAgentName, pdata.listAgentFullName, pdata.listingAgentFullName) || null,
            listing_agent_email: pick(listing.listingAgentEmail, listing.listing_agent_email, pdata.listAgentEmail, pdata.listingAgentEmail, pdata.listAgentEmailAddress) || null,
            listing_agent_phone: pick(listing.listingAgentPhone, listing.listing_agent_phone, pdata.listAgentDirectPhone, pdata.listingAgentPhone, pdata.listAgentMobilePhone, pdata.listAgentOfficePhone) || null,
            listing_agent_brokerage: pick(listing.listingAgentBrokerage, listing.listing_agent_brokerage, pdata.listOfficeName, pdata.listingOfficeName, pdata.brokerageName) || null,
            description: listing.description || pdata.publicRemarks || '',
            heroMediaUrl: listing.heroMediaUrl || null,
            media: Array.isArray(listing.media) ? listing.media : [],
            raw: listing,
          })
        } catch (normalizeErr) {
          console.error('Error normalizing fallback listing detail:', listing, normalizeErr)
          return err('Error parsing listing data', 500)
        }
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
               t.name as company_name, t.logo_url as company_logo_url, t.primary_color, t.accent_color,
               t.company_address, t.company_telephone, t.company_fax
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
        company_address: string | null
        company_telephone: string | null
        company_fax: string | null
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
      tenantId: agent.tenant_id,
      companyAddress: agent.company_address,
      companyTelephone: agent.company_telephone,
      companyFax: agent.company_fax,
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
      const cleanString = (s: string) => {
        return s.toLowerCase()
          .replace(/\b(street|st|avenue|ave|road|rd|place|pl|drive|dr|lane|ln|court|ct|boulevard|blvd|way|terrace|ter|circle|cir|loop|trail|trl|parkway|pkwy|highway|hwy|suite|ste|apartment|apt|unit|floor|fl|north|south|east|west|n|s|e|w)\b/g, '')
          .replace(/[^a-z0-9]/g, '')
          .trim()
      }

      const filtered = events.filter((oh: any) => {
        // 1. Match by listing ID or MLS number
        const ohListingId = String(oh.listing_id || oh.inventory_listing_id || '').toLowerCase()
        const ohMls = String(oh.mls_number || oh.mlsNumber || '').toLowerCase()
        const cleanListingId = listingId.toLowerCase()
        
        if (cleanListingId && ohListingId && (ohListingId === cleanListingId || ohListingId.includes(cleanListingId) || cleanListingId.includes(ohListingId))) return true
        if (ohMls && cleanListingId && (ohMls === cleanListingId || ohMls.includes(cleanListingId) || cleanListingId.includes(ohMls))) return true

        // 2. Match by address (extremely robust)
        const ohAddr = String(oh.property_address || oh.address || '')
        const searchAddr = String(searchAddress || '')
        if (ohAddr && searchAddr) {
          const normOh = cleanString(ohAddr)
          const normSearch = cleanString(searchAddr)
          if (normOh && normSearch && (normOh.includes(normSearch) || normSearch.includes(normOh))) return true
        }

        // 3. Fallback matching for city + zip
        const ohCity = String(oh.city || '').toLowerCase().trim()
        const ohZip = String(oh.zip || oh.zip_code || '').split('-')[0].trim().slice(0, 5)
        const searchCleanZip = searchZip.split('-')[0].trim().slice(0, 5)

        if (searchCity && ohCity && searchCity === ohCity) {
          if (searchCleanZip && ohZip && searchCleanZip === ohZip) return true
        }

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

    // Send verification email — use the request hostname so the link goes back to the right tenant domain
    const verifyToken = generateToken()
    await storeToken(env.EMAIL_TOKENS_KV, 'verify', verifyToken, id, TOKEN_TTL.email_verify)
    const tenantBaseUrl = await getPrimaryHostname(env.DB, tenantId, `https://${env.PLATFORM_HOSTNAME}`)
    try {
      await sendVerificationEmail(env.EMAIL, body.email, body.name, verifyToken, tenantBaseUrl)
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
    const verifiedJwt = await signJWT(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      env.JWT_SECRET,
    )
    return json(
      { success: true, message: 'Email verified! You are now logged in.' },
      200,
      { 'Set-Cookie': setSessionCookie(verifiedJwt, SESSION_TTL, hostname) },
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

    const loginJwt = await signJWT(
      { userId: user.id, tenantId: user.tenant_id, role: user.role },
      env.JWT_SECRET,
    )

    const permissions = await serializePermissions(user.id, user.role, env.DB)

    return json(
      { success: true, data: { user: safeUser(user), permissions } },
      200,
      { 'Set-Cookie': setSessionCookie(loginJwt, SESSION_TTL, hostname) },
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
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie(hostname) })
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
      const resetToken = generateToken()
      await storeToken(env.EMAIL_TOKENS_KV, 'reset', resetToken, user.id, TOKEN_TTL.password_reset)
      // Get the tenant's primary hostname so the reset link goes to the right domain
      const resetBaseUrl = requestBaseUrl
      try {
        await sendPasswordResetEmail(env.EMAIL, user.email, user.name, resetToken, resetBaseUrl)
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
    const inviteJwt = await signJWT(
      { userId: id, tenantId: invite.tenant_id, role: invite.role },
      env.JWT_SECRET,
    )

    return json(
      { success: true, message: 'Account created. Welcome to Prime America Workspace!' },
      201,
      { 'Set-Cookie': setSessionCookie(inviteJwt, SESSION_TTL, hostname) },
    )
  }

  // GET /api/search
  if (path === '/api/search' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)

    const q = url.searchParams.get('q') || ''
    if (q.length < 2) {
      return ok({ contacts: [], transactions: [], listings: [], network: [] })
    }

    const searchQuery = `%${q}%`

    // Search contacts
    const contacts = await env.DB
      .prepare('SELECT id, first_name, last_name, email, phone, status FROM contacts WHERE tenant_id = ? AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?) LIMIT 5')
      .bind(session.tenantId, searchQuery, searchQuery, searchQuery, searchQuery)
      .all()

    // Search transactions
    const transactions = await env.DB
      .prepare('SELECT id, name, type, status, price FROM transactions WHERE tenant_id = ? AND (name LIKE ? OR notes LIKE ?) LIMIT 5')
      .bind(session.tenantId, searchQuery, searchQuery)
      .all()

    // Search network connections
    const network = await env.DB
      .prepare('SELECT id, name, company, type, email, phone FROM network_connections WHERE tenant_id = ? AND (name LIKE ? OR company LIKE ? OR email LIKE ?) LIMIT 5')
      .bind(session.tenantId, searchQuery, searchQuery, searchQuery)
      .all()

    // Search listings
    let listings: any[] = []
    try {
      const res = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings?q=${encodeURIComponent(q)}&limit=5`, {
        headers: {
          'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
          'Accept': 'application/json',
        }
      })
      const listData: any = await res.json()
      const allListings = listData.listings || listData.data || (Array.isArray(listData) ? listData : [])
      listings = allListings.filter((l: any) =>
        (l.address || '').toLowerCase().includes(q.toLowerCase()) ||
        (l.city || '').toLowerCase().includes(q.toLowerCase()) ||
        (l.mls_number || '').toLowerCase().includes(q.toLowerCase())
      ).slice(0, 5)
    } catch (e) {
      console.error('Listings search failed', e)
    }

    return ok({
      contacts: contacts.results,
      transactions: transactions.results,
      listings: listings,
      network: network.results,
    })
  }

  // ════════════════════════════════════════════════════════════════════════
  // DIRECTORY ROUTES (Any authenticated user in the workspace)
  // ════════════════════════════════════════════════════════════════════════

  if (path === '/api/directory/users' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)
    const search = url.searchParams.get('q') ?? ''
    
    let query = 'SELECT id, name, email, role, license_number FROM users WHERE tenant_id = ? AND is_active = 1'
    const params: any[] = [session.tenantId]
    
    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR license_number LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    
    query += ' ORDER BY name ASC LIMIT 20'
    const users = await env.DB.prepare(query).bind(...params).all()
    
    return ok(users.results)
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

    // PUT /api/hr/users/:id — update user profile/role/email
    if (userIdMatch && method === 'PUT') {
      const targetId = userIdMatch[1]
      const body = await request.json<{
        name?: string; email?: string; role?: string; title?: string; phone?: string; licenseNumber?: string; licenseState?: string; licenseExpirationDate?: string
      }>()

      const user = await env.DB
        .prepare('SELECT id, role, email FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; role: string; email: string }>()
      if (!user) return err('User not found', 404)

      if (body.email && body.email.trim().toLowerCase() !== user.email.toLowerCase()) {
        const dup = await env.DB
          .prepare('SELECT id FROM users WHERE email = ? AND tenant_id = ? AND id != ?')
          .bind(body.email.trim().toLowerCase(), session.tenantId, targetId)
          .first()
        if (dup) {
          return err('An account with this email address already exists', 400)
        }
      }

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
          email = COALESCE(?, email),
          role = COALESCE(?, role),
          title = COALESCE(?, title),
          phone = COALESCE(?, phone),
          license_number = COALESCE(?, license_number),
          license_state = COALESCE(?, license_state),
          license_expiration_date = COALESCE(?, license_expiration_date),
          updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?`)
        .bind(
          body.name ?? null,
          body.email ? body.email.trim().toLowerCase() : null,
          body.role ?? null,
          body.title ?? null,
          body.phone ?? null,
          body.licenseNumber ?? null,
          body.licenseState ?? null,
          body.licenseExpirationDate ?? null,
          targetId,
          session.tenantId,
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

      const hrResetToken = generateToken()
      await storeToken(env.EMAIL_TOKENS_KV, 'reset', hrResetToken, user.id, TOKEN_TTL.password_reset)
      await sendPasswordResetEmail(env.EMAIL, user.email, user.name, hrResetToken, requestBaseUrl)
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

      // Always send the welcome email with the temp password when manually creating a user
      // The temp password is emailed directly and NOT returned in the API response for security
      try {
        await sendManualUserWelcomeEmail(env.EMAIL, body.email, body.name, tempPassword, tenantName, requestBaseUrl)
      } catch (e) {
        console.error('Welcome email failed:', e)
      }

      return ok({
        success: true,
        user: {
          id: targetId,
          name: body.name,
          email: body.email,
          role: body.role
        },
        // Note: tempPassword is NOT returned in the response for security.
        // It is emailed to the user directly.
        emailSent: true
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

      // Generate a fresh temporary password and send it via email
      // The temp password is NOT returned in the API response for security
      const tempPasswordNew = 'WelcomeTemp' + Math.floor(1000 + Math.random() * 9000) + '!'
      const passwordHashNew = await hashPassword(tempPasswordNew)
      const tenantForWelcome = await getTenant(env.DB, session.tenantId)
      const tenantNameForWelcome = tenantForWelcome ? tenantForWelcome.name : 'Prime America'

      await env.DB
        .prepare('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ? AND tenant_id = ?')
        .bind(passwordHashNew, targetId, session.tenantId)
        .run()

      await sendManualUserWelcomeEmail(env.EMAIL, targetUser.email, targetUser.name, tempPasswordNew, tenantNameForWelcome, requestBaseUrl)

      return ok({ success: true, emailSent: true })
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
        env.EMAIL, email, name ?? null, inviter.name, tenant.name, role, token, requestBaseUrl,
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
      const { cookieHeader } = await stopImpersonation(session, env.DB, env.JWT_SECRET, hostname)
      return json({ success: true, message: 'Impersonation ended' }, 200, { 'Set-Cookie': cookieHeader })
    }

    // POST /api/hr/impersonate/:userId
    const impersonateMatch = path.match(/^\/api\/hr\/impersonate\/([^/]+)$/)
    if (impersonateMatch && method === 'POST') {
      const { reason } = await request.json<{ reason?: string }>().catch(() => ({ reason: undefined }))
      const { cookieHeader } = await startImpersonation(
        session, impersonateMatch[1], reason ?? null, env.DB, env.JWT_SECRET, hostname,
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

    return err('HR endpoint not found', 404)
  }

  // ── Tenant Branding & Dashboard Settings — /api/tenant/* ─────────────────────────
  if (path.startsWith('/api/tenant/')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    if (path === '/api/tenant/branding' && method === 'PUT') {
      if (!['admin', 'broker'].includes(session.role)) {
        return forbiddenError('Only admins or brokers can modify tenant branding settings')
      }
      const body = await request.json<{
        companyName?: string
        companyAddress?: string
        companyTelephone?: string
        companyFax?: string
        primaryColor?: string
        accentColor?: string
        tagline?: string
        websiteUrl?: string
        logoUrl?: string
        companyLicenseNumber?: string
        syncCompanyLicense?: boolean
        leadAppDomain?: string
        customWorkspaceDomain?: string
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
          company_address = ?,
          company_telephone = ?,
          company_fax = ?,
          primary_color = COALESCE(?, primary_color),
          accent_color = COALESCE(?, accent_color),
          tagline = ?,
          website_url = ?,
          logo_url = COALESCE(?, logo_url),
          company_license_number = CASE WHEN ? = 1 THEN ? ELSE company_license_number END,
          lead_app_domain = ?,
          custom_workspace_domain = ?
          WHERE id = ?`)
        .bind(
          body.companyName ?? null,
          body.companyAddress ?? null,
          body.companyTelephone ?? null,
          body.companyFax ?? null,
          body.primaryColor ?? null,
          body.accentColor ?? null,
          body.tagline ?? null,
          body.websiteUrl ?? null,
          body.logoUrl ?? null,
          hasCompanyLicenseField ? 1 : 0,
          normalizedCompanyLicense,
          body.leadAppDomain ?? null,
          body.customWorkspaceDomain ?? null,
          session.tenantId
        )
        .run()

      // Automatically register the custom domains in tenant_hostnames
      if (body.leadAppDomain && body.leadAppDomain.trim() !== '') {
        const domain = body.leadAppDomain.trim().toLowerCase()
        const existingHost = await env.DB
          .prepare('SELECT tenant_id FROM tenant_hostnames WHERE hostname = ?')
          .bind(domain)
          .first<{ tenant_id: string }>()

        if (existingHost) {
          if (existingHost.tenant_id !== session.tenantId) {
            return err('This custom lead app domain is already registered to another tenant')
          }
          await env.DB
            .prepare('UPDATE tenant_hostnames SET verified = 1 WHERE hostname = ?')
            .bind(domain)
            .run()
        } else {
          await env.DB
            .prepare('INSERT INTO tenant_hostnames (tenant_id, hostname, is_primary, verified) VALUES (?, ?, 0, 1)')
            .bind(session.tenantId, domain)
            .run()
        }
      }

      if (body.customWorkspaceDomain && body.customWorkspaceDomain.trim() !== '') {
        const domain = body.customWorkspaceDomain.trim().toLowerCase()
        const existingHost = await env.DB
          .prepare('SELECT tenant_id FROM tenant_hostnames WHERE hostname = ?')
          .bind(domain)
          .first<{ tenant_id: string }>()

        if (existingHost) {
          if (existingHost.tenant_id !== session.tenantId) {
            return err('This custom workspace domain is already registered to another tenant')
          }
          // Promote to primary
          await env.DB
            .prepare('UPDATE tenant_hostnames SET is_primary = 0 WHERE tenant_id = ?')
            .bind(session.tenantId)
            .run()
          await env.DB
            .prepare('UPDATE tenant_hostnames SET is_primary = 1, verified = 1 WHERE hostname = ?')
            .bind(domain)
            .run()
        } else {
          // Promote to primary
          await env.DB
            .prepare('UPDATE tenant_hostnames SET is_primary = 0 WHERE tenant_id = ?')
            .bind(session.tenantId)
            .run()
          await env.DB
            .prepare('INSERT INTO tenant_hostnames (tenant_id, hostname, is_primary, verified) VALUES (?, ?, 1, 1)')
            .bind(session.tenantId, domain)
            .run()
        }
      }
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

    // POST /api/tenant/sync-ny-license — trigger NY DOS dataset sync on demand
    if (path === '/api/tenant/sync-ny-license' && method === 'POST') {
      if (!['admin', 'broker'].includes(session.role)) {
        return forbiddenError('Only admins or brokers can trigger company license sync')
      }
      const tenant = await getTenant(env.DB, session.tenantId)
      const licenseNumber = (tenant?.company_license_number || '').trim()
      if (!licenseNumber) {
        return err('Company license number is not configured in workspace branding settings', 400)
      }
      const licenseSync = await syncCompanyLicenseDataFromNY(env.DB, session.tenantId, licenseNumber)
      const updatedTenant = await getTenant(env.DB, session.tenantId)
      return ok({ message: 'NY DOS Dataset sync completed', licenseSync, tenant: updatedTenant })
    }

    // GET /api/user/quick-links — get personal quick links
    if (path === '/api/user/quick-links' && method === 'GET') {
      const row = await env.DB
        .prepare('SELECT display_prefs FROM user_settings WHERE user_id = ?')
        .bind(session.userId)
        .first<{ display_prefs: string }>()
      let quickLinks = null
      if (row?.display_prefs) {
        try {
          const parsed = JSON.parse(row.display_prefs)
          quickLinks = parsed.quickLinks || null
        } catch {}
      }
      return ok({ quickLinks })
    }

    // PUT /api/user/quick-links — update personal quick links
    if (path === '/api/user/quick-links' && method === 'PUT') {
      const body = await request.json<{ quickLinks: any[] }>()
      const row = await env.DB
        .prepare('SELECT display_prefs FROM user_settings WHERE user_id = ?')
        .bind(session.userId)
        .first<{ display_prefs: string }>()
      let currentPrefs: any = {}
      if (row?.display_prefs) {
        try { currentPrefs = JSON.parse(row.display_prefs) } catch {}
      }
      currentPrefs.quickLinks = body.quickLinks || []
      await env.DB
        .prepare(`
          INSERT INTO user_settings (user_id, display_prefs, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET display_prefs = excluded.display_prefs, updated_at = datetime('now')
        `)
        .bind(session.userId, JSON.stringify(currentPrefs))
        .run()
      return ok({ message: 'Quick links updated', quickLinks: currentPrefs.quickLinks })
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

    // GET /api/tenant/verify-dns?domain=<domain>
    if (path.startsWith('/api/tenant/verify-dns') && method === 'GET') {
      const urlObj = new URL(request.url)
      const domain = urlObj.searchParams.get('domain')?.trim().toLowerCase()
      if (!domain) {
        return err('Missing domain parameter', 400)
      }

      try {
        const cleanDomain = domain.replace(/^https?:\/\//i, '')
        const dnsUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=CNAME`
        const response = await fetch(dnsUrl, {
          headers: { accept: 'application/dns-json' }
        })
        if (!response.ok) {
          return err('Failed to fetch from DNS resolver', 500)
        }
        
        const data = await response.json<{
          Status: number;
          Answer?: Array<{ name: string; type: number; TTL: number; data: string }>;
        }>()

        const answers = data.Answer || []
        const cnameMatch = answers.some(ans => {
          const target = ans.data.trim().toLowerCase().replace(/\.$/, '')
          return target === 're-workspace.lama-4db.workers.dev' || target === 'app.primeamericarealestate.com'
        })

        if (cnameMatch) {
          return ok({ verified: true, currentResolved: answers.map(a => a.data.replace(/\.$/, '')).join(', ') })
        }

        let resolvedInfo = answers.map(a => a.data.replace(/\.$/, '')).join(', ')
        if (answers.length === 0) {
          try {
            const aDnsUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(cleanDomain)}&type=A`
            const aRes = await fetch(aDnsUrl, { headers: { accept: 'application/dns-json' } })
            if (aRes.ok) {
              const aData = await aRes.json<{ Answer?: Array<{ data: string }> }>()
              if (aData.Answer && aData.Answer.length > 0) {
                resolvedInfo = aData.Answer.map(a => a.data).join(', ')
              }
            }
          } catch {}
        }

        // Fallback: If CNAME check failed but domain is proxied (e.g. Cloudflare CNAME flattening),
        // try to request the public platform target verification endpoint via HTTPS.
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 3000)
          
          const verifyUrl = `https://${cleanDomain}/api/public/verify-dns-target`
          const verifyRes = await fetch(verifyUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 're-workspace-dns-verifier' }
          })
          clearTimeout(timeoutId)
          
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json<{ platform?: string }>()
            if (verifyData && verifyData.platform === 're-workspace') {
              return ok({ 
                verified: true, 
                currentResolved: 'Proxied (' + (resolvedInfo || 'Cloudflare Edge') + ')' 
              })
            }
          }
        } catch (fetchErr) {
          // Fall through
        }

        return ok({ 
          verified: false, 
          currentResolved: resolvedInfo || 'None' 
        })
      } catch (e: any) {
        return err(e.message || 'DNS query failed', 500)
      }
    }

    return err('Tenant endpoint not found', 404)
  }

  // ── CRM proxy — /api/contacts/* ─────────────────────────────────────────────
  // Validates auth + permissions, injects context headers, proxies to re-crm service binding
  if (path.startsWith('/api/contacts') || path === '/api/contacts/stats') {
    const session = await requireAuth(request, env.JWT_SECRET)

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'crm', action, env.DB))) {
      throw forbiddenError(`No ${action} access to CRM`)
    }

    // Build a new request with auth context headers (CRM worker trusts these)
    const crmRequest = new Request(request.url, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'X-User-Id':   session.userId,
        'X-Tenant-Id': session.tenantId,
        'X-User-Role': session.role,
        // Strip the auth cookie so CRM never tries to re-validate
        'Cookie': '',
      },
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

    let myContactsCount = 0
    let myTransactionsCount = 0
    let myNetworkCount = 0
    let myActiveListingsCount = 0

    const isAdminOrBroker = ['admin', 'broker'].includes(session.role)

    const currentUser = await env.DB
      .prepare('SELECT email FROM users WHERE id = ? AND tenant_id = ?')
      .bind(session.userId, session.tenantId)
      .first<{ email: string | null }>()
    const currentUserEmail = (currentUser?.email || '').toLowerCase()

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

        if (isAdminOrBroker) {
          const myCrmReq = new Request(`${url.origin}/api/contacts/stats?assigned_to=${encodeURIComponent(session.userId)}`, {
            headers: {
              'X-User-Id': session.userId,
              'X-Tenant-Id': session.tenantId,
              'X-User-Role': session.role,
            }
          })
          const myCrmRes = await env.CRM.fetch(myCrmReq)
          if (myCrmRes.ok) {
            const myCrmData: any = await myCrmRes.json()
            if (myCrmData.success && myCrmData.data) {
              myContactsCount = myCrmData.data.total || 0
            }
          }
        } else {
          myContactsCount = contactsCount
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
            // Count active & under contract deals for the dashboard "Transactions" metric
            const d = txnData.data
            transactionsCount = (d.active || 0) + (d.under_contract || 0) + (d.lead || 0)
          }
        }

        if (isAdminOrBroker) {
          const myTxnReq = new Request(`${url.origin}/api/transactions/stats?assigned_to=${encodeURIComponent(session.userId)}`, {
            headers: {
              'X-User-Id': session.userId,
              'X-Tenant-Id': session.tenantId,
              'X-User-Role': session.role,
            }
          })
          const myTxnRes = await env.TRANSACTIONS.fetch(myTxnReq)
          if (myTxnRes.ok) {
            const myTxnData: any = await myTxnRes.json()
            if (myTxnData.success && myTxnData.data) {
              const d = myTxnData.data
              myTransactionsCount = (d.active || 0) + (d.under_contract || 0) + (d.lead || 0)
            }
          }
        } else {
          myTransactionsCount = transactionsCount
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

        const myNetRes = await env.DB
          .prepare('SELECT COUNT(*) as count FROM network_connections WHERE tenant_id = ? AND created_by = ?')
          .bind(session.tenantId, session.userId)
          .first<{ count: number }>()
        myNetworkCount = myNetRes?.count || 0
      } catch (e) {
        console.error('Failed to fetch network stats:', e)
      }
    }

    // 4. Fetch Active listings count from Inventory
    if (await can(session.userId, session.role, 'listings', 'read', env.DB)) {
      try {
        const invUrl = `${env.INVENTORY_WORKER_URL}/api/projects`
        const invRes = await fetch(invUrl, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
          }
        })
        if (invRes.ok) {
          const invData: any = await invRes.json()
          const listings = invData.listings || invData.projects || invData.entries || []
          activeListingsCount = listings.filter((l: any) => l.status === 'active' || l.status === 'published').length

          if (currentUserEmail) {
            myActiveListingsCount = listings.filter((l: any) => {
              const listEmail = String(l.listAgentEmail || l.listing_agent_email || '').toLowerCase()
              const coListEmail = String(l.coListAgentEmail || l.co_listing_agent_email || '').toLowerCase()
              const active = l.status === 'active' || l.status === 'published'
              return active && (listEmail === currentUserEmail || coListEmail === currentUserEmail)
            }).length
          } else {
            myActiveListingsCount = isAdminOrBroker ? 0 : activeListingsCount
          }
        }
      } catch (e) {
        console.error('Failed to fetch inventory stats:', e)
      }
    }

    if (!isAdminOrBroker) {
      myContactsCount = contactsCount
      myTransactionsCount = transactionsCount
      myNetworkCount = networkCount
      myActiveListingsCount = activeListingsCount
    }

    return ok({
      activeListings: activeListingsCount,
      crmContacts: contactsCount,
      transactions: transactionsCount,
      network: networkCount,
      company: {
        activeListings: activeListingsCount,
        crmContacts: contactsCount,
        transactions: transactionsCount,
        network: networkCount,
      },
      agent: {
        activeListings: myActiveListingsCount,
        crmContacts: myContactsCount,
        transactions: myTransactionsCount,
        network: myNetworkCount,
      },
    })
  }

  // ── Open Houses Proxy — /api/openhouses ──────────────────────────────────
  if (path === '/api/openhouses' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET)
    if (!(await can(session.userId, session.role, 'marketing', 'read', env.DB))) {
      throw forbiddenError('No access to Open Houses')
    }
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
        return error('Failed to fetch open houses from worker', 502)
      }
      const data: any = await res.json()
      return ok(data.events || [])
    } catch (e: any) {
      console.error(e)
      try {
        const altUrl = 'https://openhouse.primeamericarealestate.com/api/events/list'
        const altRes = await fetch(altUrl, { headers: { 'Accept': 'application/json' } })
        if (altRes.ok) {
          const data: any = await altRes.json()
          return ok(data.events || [])
        }
      } catch (e2) {}
      return error(`Error fetching open houses: ${e.message}`, 500)
    }
  }

  // ── Transactions proxy — /api/transactions/* ─────────────────────────────────────────────
  if (path.startsWith('/api/transactions')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'transactions', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Transactions`)
    }

    const txnRequest = new Request(request.url, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        'X-User-Id':   session.userId,
        'X-Tenant-Id': session.tenantId,
        'X-User-Role': session.role,
        'Cookie': '',
      },
      body: ['GET','HEAD'].includes(request.method) || request.headers.get('Upgrade') === 'websocket' ? undefined : request.body,
      // @ts-ignore duplex needed for streaming
      duplex: 'half',
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

    const targetUrl = new URL(request.url)

    // GET /api/listings - Fetch and normalize projects
    if (path === '/api/listings' && method === 'GET') {
      try {
        const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings${targetUrl.search}`, {
          headers: {
            'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
            'Accept': 'application/json',
          }
        })
        if (!response.ok) {
          throw new Error(`Inventory returned status ${response.status}`)
        }
        const data: any = await response.json()
        const listings = data.listings || data.data || data || []
        const normalized = listings.map((project: any) => {
          try {
            const pdata = project.data || {}
            const pick = (...values: any[]) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== '')
            return {
              id: project.id || '',
              mlsNumber: project.id ? project.id.slice(0, 8) : '',
              address: project.address || `${pdata.streetNumber || ''} ${pdata.streetName || ''} ${pdata.streetSuffix || ''}`.trim() || 'No Address',
              city: project.city || pdata.city || '',
              state: project.state || pdata.stateOrProvince || '',
              zip: project.zip || pdata.postalCode || '',
              price: Number(project.price ?? pdata.listPrice ?? 0),
              propertyType: project.propertyType || pdata.propertyType || '',
              propertySubtype: project.propertySubtype || pdata.propertySubType || pdata.propertyType || '',
              latitude: Number(project.latitude ?? project.lat ?? pdata.latitude ?? pdata.lat ?? 0),
              longitude: Number(project.longitude ?? project.lng ?? pdata.longitude ?? pdata.lng ?? 0),
              bedrooms: Number(project.bedrooms ?? pdata.bedroomsTotal ?? 0),
              bathrooms: Number(project.bathrooms ?? pdata.bathroomsTotalInteger ?? 0),
              sqft: Number(project.sqft ?? pdata.livingArea ?? 0),
              lotSize: Number(project.lotSize ?? pdata.lotSizeArea ?? pdata.lotSizeSquareFeet ?? 0),
              yearBuilt: Number(project.yearBuilt ?? pdata.yearBuilt ?? 0),
              listing_agent_name: pick(project.listingAgentName, project.listing_agent_name, pdata.listAgentName, pdata.listingAgentName, pdata.listAgentFullName, pdata.listingAgentFullName) || null,
              listing_agent_email: pick(project.listingAgentEmail, project.listing_agent_email, pdata.listAgentEmail, pdata.listingAgentEmail, pdata.listAgentEmailAddress) || null,
              listing_agent_phone: pick(project.listingAgentPhone, project.listing_agent_phone, pdata.listAgentDirectPhone, pdata.listingAgentPhone, pdata.listAgentMobilePhone, pdata.listAgentOfficePhone) || null,
              listing_agent_brokerage: pick(project.listingAgentBrokerage, project.listing_agent_brokerage, pdata.listOfficeName, pdata.listingOfficeName, pdata.brokerageName) || null,
              description: project.description || pdata.publicRemarks || '',
              status: String(project.status || pdata.standardStatus || pdata.mLSStatus || pdata.status || 'active').toLowerCase().replace('closed', 'sold'),
              heroMediaUrl: project.heroMediaUrl || null,
              media: Array.isArray(project.media) ? project.media : [],
            }
          } catch (e) {
            console.error('Error normalizing project:', project, e)
            return null
          }
        }).filter(Boolean)
        return ok(normalized)
      } catch (error) {
        console.error('Listings normalization proxy error:', error)
        return err('Failed to connect to inventory service', 502)
      }
    }

    // Proxy other requests to the inventory worker
    const proxyUrl = `${env.INVENTORY_WORKER_URL}${targetUrl.pathname}${targetUrl.search}`

    try {
      const response = await fetch(proxyUrl, {
        method: request.method,
        headers: {
          'Content-Type': request.headers.get('Content-Type') || 'application/json',
          'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
        },
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      })
      
      return new Response(response.body, {
        status: response.status,
        headers: response.headers
      })
    } catch (error) {
      console.error('Listings proxy error:', error)
      return err('Failed to connect to inventory service', 502)
    }
  }

  // ── Documents (R2 Storage) — /api/documents/* ────────────────────────────
  if (path.startsWith('/api/documents')) {
    // Allow public GET /api/documents/:id/download (e.g. workspace company logos, shared assets)
    const publicDocMatch = path.match(/^\/api\/documents\/([^/]+)\/download$/)
    if (publicDocMatch && request.method === 'GET') {
      const docId = publicDocMatch[1]
      const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ?').bind(docId).first<any>()
      if (!doc) return err('Not found', 404)

      const object = await env.ASSETS_BUCKET.get(doc.file_key as string)
      if (!object) return err('File not found in storage', 404)

      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set('Content-Disposition', `inline; filename="${doc.file_name}"`)
      headers.set('Access-Control-Allow-Origin', '*')
      
      return new Response(object.body, { headers })
    }

    const session = await requireAuth(request, env.JWT_SECRET)

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'storage', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Documents`)
    }

    // Upload a document or Create a Folder
    if ((path === '/api/documents/upload' || path === '/api/documents') && request.method === 'POST') {
      const contentType = request.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const body: any = await request.json()
        if (body.is_folder) {
          const id = newId()
          await env.DB.prepare(`
            INSERT INTO documents (id, tenant_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, uploaded_by, is_folder, parent_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)
          `).bind(id, session.tenantId, body.entity_type, body.entity_id, body.file_name, `folder-${id}`, 'application/x-folder', session.userId, body.parent_id || null).run()

          return ok({ id, file_name: body.file_name, is_folder: true })
        }
      }

      const formData = await request.formData()
      const entity_type = formData.get('entity_type') as string
      const entity_id = formData.get('entity_id') as string
      const file = formData.get('file') as File
      const parent_id = (formData.get('parent_id') as string) || null
      
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
        INSERT INTO documents (id, tenant_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, uploaded_by, is_folder, parent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).bind(id, session.tenantId, entity_type, entity_id, file.name, fileKey, file.type, file.size, session.userId, parent_id).run()

      // Trigger notification
      await createNotification(
        env.DB, 
        session.tenantId, 
        `New document "${file.name}" uploaded to ${entity_type === 'transaction' ? 'deal' : entity_type} by ${session.role}`
      )

      return ok({ id, file_name: file.name, size: file.size, key: fileKey })
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

    // Rename / Move document or folder (PUT /api/documents/:id)
    const renameMatch = path.match(/^\/api\/documents\/([^/]+)$/)
    if (renameMatch && request.method === 'PUT') {
      const docId = renameMatch[1]
      const body: any = await request.json()
      
      await env.DB.prepare(`
        UPDATE documents
        SET file_name = COALESCE(?, file_name),
            parent_id = CASE WHEN ? = 'ROOT' THEN NULL ELSE COALESCE(?, parent_id) END
        WHERE id = ? AND tenant_id = ?
      `).bind(
        body.file_name || null,
        body.parent_id || null,
        body.parent_id || null,
        docId,
        session.tenantId
      ).run()

      return ok({ success: true })
    }

    // GET /api/documents/download?key=...
    if (path === '/api/documents/download' && request.method === 'GET') {
      const key = url.searchParams.get('key')
      if (!key) return err('Missing key param', 400)

      const doc = await env.DB.prepare('SELECT * FROM documents WHERE file_key = ? AND tenant_id = ?').bind(key, session.tenantId).first()
      if (!doc) return err('Not found', 404)

      const object = await env.ASSETS_BUCKET.get(doc.file_key as string)
      if (!object) return err('File not found in storage', 404)

      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set('Content-Disposition', `inline; filename="${doc.file_name}"`)
      
      return new Response(object.body, { headers })
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
      headers.set('Content-Disposition', `inline; filename="${doc.file_name}"`)
      
      return new Response(object.body, { headers })
    }

    // Delete a document or folder
    const deleteMatch = path.match(/^\/api\/documents\/([^/]+)$/)
    if (deleteMatch && request.method === 'DELETE') {
      const docId = deleteMatch[1]
      const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').bind(docId, session.tenantId).first<any>()
      if (!doc) return err('Not found', 404)

      // Recursive helper to get descendants
      const getDescendants = async (db: D1Database, tenantId: string, parentId: string): Promise<any[]> => {
        const { results } = await db.prepare('SELECT id, file_key, is_folder, parent_id FROM documents WHERE tenant_id = ?').bind(tenantId).all()
        const map = new Map<string, any[]>()
        results.forEach((d: any) => {
          if (d.parent_id) {
            if (!map.has(d.parent_id)) map.set(d.parent_id, [])
            map.get(d.parent_id)!.push(d)
          }
        })
        const list: any[] = []
        const traverse = (id: string) => {
          const children = map.get(id) || []
          children.forEach((c) => {
            list.push(c)
            if (c.is_folder) traverse(c.id)
          })
        }
        traverse(parentId)
        return list
      }

      const descendants = await getDescendants(env.DB, session.tenantId, docId)
      const allDocs = [doc, ...descendants]

      for (const d of allDocs) {
        if (!d.is_folder && d.file_key) {
          try {
            await env.ASSETS_BUCKET.delete(d.file_key)
          } catch (e) {
            console.error('Failed to delete child from R2', e)
          }
        }
        await env.DB.prepare('DELETE FROM documents WHERE id = ? AND tenant_id = ?').bind(d.id, session.tenantId).run()
      }

      return ok({ success: true })
    }

    return err('Documents endpoint not found', 404)
  }

  // ── Showings API — /api/showings ──────────────────────────────────────────
  if (path.startsWith('/api/showings')) {
    const session = await requireAuth(request, env.JWT_SECRET)

    // GET /api/showings
    if (path === '/api/showings' && method === 'GET') {
      const dateFrom = url.searchParams.get('dateFrom')
      const dateTo = url.searchParams.get('dateTo')
      const agentId = url.searchParams.get('agentId')

      let queryStr = `
        SELECT s.*, u.name as agent_name
        FROM showings s
        JOIN users u ON u.id = s.agent_id
        WHERE s.tenant_id = ?
      `
      const binds: any[] = [session.tenantId]

      if (dateFrom) {
        queryStr += ' AND s.shown_at >= ?'
        binds.push(dateFrom)
      }
      if (dateTo) {
        queryStr += ' AND s.shown_at <= ?'
        binds.push(dateTo)
      }
      if (agentId) {
        queryStr += ' AND s.agent_id = ?'
        binds.push(agentId)
      }

      queryStr += ' ORDER BY s.shown_at DESC'

      const { results } = await env.DB.prepare(queryStr).bind(...binds).all()
      return ok(results)
    }

    // POST /api/showings
    if (path === '/api/showings' && method === 'POST') {
      const body = await request.json<{
        listingId: string
        buyerName: string
        shownAt: string
        feedback?: string
        listingAddress?: string
      }>()

      if (!body.listingId || !body.buyerName || !body.shownAt) {
        return err('Missing required fields')
      }

      const id = newId()
      await env.DB.prepare(`
        INSERT INTO showings (id, tenant_id, listing_id, agent_id, buyer_name, shown_at, feedback, listing_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        session.tenantId,
        body.listingId,
        session.userId,
        body.buyerName,
        body.shownAt,
        body.feedback || null,
        body.listingAddress || null
      ).run()

      return ok({ success: true, id })
    }

    // PUT /api/showings/:id
    const idMatch = path.match(/^\/api\/showings\/([^/]+)$/)
    if (idMatch && method === 'PUT') {
      const showingId = idMatch[1]
      const body = await request.json<{
        buyerName?: string
        shownAt?: string
        feedback?: string
      }>()

      await env.DB.prepare(`
        UPDATE showings
        SET buyer_name = COALESCE(?, buyer_name),
            shown_at = COALESCE(?, shown_at),
            feedback = COALESCE(?, feedback)
        WHERE id = ? AND tenant_id = ?
      `).bind(
        body.buyerName || null,
        body.shownAt || null,
        body.feedback || null,
        showingId,
        session.tenantId
      ).run()

      return ok({ success: true })
    }

    // DELETE /api/showings/:id
    if (idMatch && method === 'DELETE') {
      const showingId = idMatch[1]
      await env.DB.prepare('DELETE FROM showings WHERE id = ? AND tenant_id = ?')
        .bind(showingId, session.tenantId)
        .run()

      return ok({ success: true })
    }

    return err('Showings endpoint not found', 404)
  }

  // ── Admin Storage & Export — /api/storage/* and /api/export/* ──────────────────────────
  if (path.startsWith('/api/storage') || path.startsWith('/api/export')) {
    const session = await requireAuth(request, env.JWT_SECRET)
    if (session.role !== 'admin' && session.role !== 'broker') {
      return forbiddenError('Only admins and brokers can manage storage and exports')
    }

    // GET /api/storage/summary
    if (path === '/api/storage/summary' && method === 'GET') {
      const tenant = await env.DB.prepare('SELECT storage_limit_bytes FROM tenants WHERE id = ?').bind(session.tenantId).first<{ storage_limit_bytes: number }>()
      const limit = tenant?.storage_limit_bytes || 10737418240 // 10 GB default

      const totalResult = await env.DB.prepare('SELECT SUM(size_bytes) as total FROM documents WHERE tenant_id = ?').bind(session.tenantId).first<{ total: number | null }>()
      const totalUsed = totalResult?.total || 0

      const byEntity = await env.DB.prepare('SELECT entity_type, SUM(size_bytes) as size, COUNT(*) as count FROM documents WHERE tenant_id = ? GROUP BY entity_type').bind(session.tenantId).all()

      const byUser = await env.DB.prepare(`
        SELECT u.id, u.name, u.email, SUM(d.size_bytes) as size, COUNT(d.id) as count
        FROM documents d
        JOIN users u ON u.id = d.uploaded_by
        WHERE d.tenant_id = ?
        GROUP BY u.id
      `).bind(session.tenantId).all()

      const recent = await env.DB.prepare(`
        SELECT d.id, d.file_name, d.size_bytes, d.entity_type, d.created_at, u.name as uploaded_by_name
        FROM documents d
        LEFT JOIN users u ON u.id = d.uploaded_by
        WHERE d.tenant_id = ?
        ORDER BY d.created_at DESC
        LIMIT 10
      `).bind(session.tenantId).all()

      return ok({
        limit_bytes: limit,
        used_bytes: totalUsed,
        by_entity_type: byEntity.results || [],
        by_user: byUser.results || [],
        recent_uploads: recent.results || []
      })
    }

    // PUT /api/storage/limit
    if (path === '/api/storage/limit' && method === 'PUT') {
      if (session.role !== 'admin') {
        return forbiddenError('Only admins can update storage limits')
      }
      const { limit_bytes } = await request.json<{ limit_bytes: number }>()
      if (!limit_bytes || typeof limit_bytes !== 'number' || limit_bytes <= 0) {
        return err('Invalid limit_bytes', 400)
      }
      await env.DB.prepare('UPDATE tenants SET storage_limit_bytes = ? WHERE id = ?').bind(limit_bytes, session.tenantId).run()
      return ok({ success: true, limit_bytes })
    }

    // GET /api/export/crm
    if (path === '/api/export/crm' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, first_name, last_name, email, phone, type, status, source, address, created_at FROM contacts WHERE tenant_id = ?').bind(session.tenantId).all()
      const headers = ['ID', 'First Name', 'Last Name', 'Email', 'Phone', 'Type', 'Status', 'Source', 'Address', 'Created At']
      const rows = (results || []).map((c: any) => [
        c.id, c.first_name, c.last_name, c.email || '', c.phone || '', c.type, c.status, c.source || '', c.address || '', c.created_at
      ])
      return new Response(toCSV(headers, rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="crm-contacts-export.csv"'
        }
      })
    }

    // GET /api/export/transactions
    if (path === '/api/export/transactions' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, name, type, status, price, commission_amount, commission_rate, agreement_type, target_close_date, actual_close_date, created_at FROM transactions WHERE tenant_id = ?').bind(session.tenantId).all()
      const headers = ['ID', 'Name', 'Type', 'Status', 'Price', 'Commission Amount', 'Commission Rate', 'Agreement Type', 'Target Close Date', 'Actual Close Date', 'Created At']
      const rows = (results || []).map((t: any) => [
        t.id, t.name, t.type, t.status, t.price || '', t.commission_amount || '', t.commission_rate || '', t.agreement_type || '', t.target_close_date || '', t.actual_close_date || '', t.created_at
      ])
      return new Response(toCSV(headers, rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="transactions-export.csv"'
        }
      })
    }

    // GET /api/export/mls
    if (path === '/api/export/mls' && method === 'GET') {
      let listings: any[] = []
      try {
        const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`, {
          headers: {
            'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
            'Accept': 'application/json',
          }
        })
        if (response.ok) {
          const data = await response.json<{ listings: any[] }>()
          listings = data.listings || []
        }
      } catch (e) {
        console.error('Failed to fetch listings for export:', e)
      }
      const headers = ['ID', 'Name', 'Form ID', 'Property Type', 'Status', 'Completion Pct', 'Created At', 'Updated At']
      const rows = listings.map((l: any) => [
        l.id, l.name, l.formId, l.propertyType || '', l.status, l.completionPct || '0', l.createdAt, l.updatedAt
      ])
      return new Response(toCSV(headers, rows), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="mls-listings-export.csv"'
        }
      })
    }

    // GET /api/export/full
    if (path === '/api/export/full' && method === 'GET') {
      const contacts = await env.DB.prepare('SELECT * FROM contacts WHERE tenant_id = ?').bind(session.tenantId).all()
      const transactions = await env.DB.prepare('SELECT * FROM transactions WHERE tenant_id = ?').bind(session.tenantId).all()
      const documents = await env.DB.prepare('SELECT * FROM documents WHERE tenant_id = ?').bind(session.tenantId).all()
      const users = await env.DB.prepare('SELECT id, email, name, role, is_active FROM users WHERE tenant_id = ?').bind(session.tenantId).all()

      let listings: any[] = []
      try {
        const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`, {
          headers: {
            'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
            'Accept': 'application/json',
          }
        })
        if (response.ok) {
          const data = await response.json<{ listings: any[] }>()
          listings = data.listings || []
        }
      } catch (e) {
        console.error('Failed to fetch listings for full export:', e)
      }

      const exportData = {
        exported_at: new Date().toISOString(),
        tenant_id: session.tenantId,
        contacts: contacts.results || [],
        transactions: transactions.results || [],
        documents: documents.results || [],
        users: users.results || [],
        listings: listings
      }

      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="full-workspace-export.json"'
        }
      })
    }

    return err('Storage or export endpoint not found', 404)
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

  // ── Workspace Settings (tenant-level, admin-managed) — /api/workspace-settings ──
  if (path === '/api/workspace-settings') {
    const session = await getSession(request, env.JWT_SECRET)
    if (!session) return authError()

    if (method === 'GET') {
      const key = url.searchParams.get('key')
      const row = await env.DB.prepare('SELECT module_settings FROM tenants WHERE id = ?').bind(session.tenantId).first<{ module_settings: string | null }>()
      const settings: Record<string, any> = row?.module_settings ? JSON.parse(row.module_settings) : {}
      if (key) {
        return ok(settings[key] !== undefined ? { key, value: settings[key] } : null)
      }
      return ok(settings)
    }

    if (method === 'POST') {
      // Only admins/brokers can write workspace settings
      if (!['admin', 'broker'].includes(session.role)) return forbiddenError('Only admins and brokers can manage workspace settings')
      const body = await request.json<{ key: string; value: any }>()
      if (!body.key) return err('key is required')
      const row = await env.DB.prepare('SELECT module_settings FROM tenants WHERE id = ?').bind(session.tenantId).first<{ module_settings: string | null }>()
      const settings: Record<string, any> = row?.module_settings ? JSON.parse(row.module_settings) : {}
      settings[body.key] = body.value
      await env.DB.prepare('UPDATE tenants SET module_settings = ? WHERE id = ?').bind(JSON.stringify(settings), session.tenantId).run()
      return ok({ success: true })
    }

    return err('Method not allowed', 405)
  }

  // ── User Settings (key-value) — /api/user-settings ─────────────────────────
  if (path === '/api/user-settings') {
    const session = await getSession(request, env.JWT_SECRET)
    if (!session) return authError()

    if (method === 'GET') {
      const key = url.searchParams.get('key')
      // Ensure the row exists
      await env.DB.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').bind(session.userId).run()
      const row = await env.DB.prepare('SELECT display_prefs FROM user_settings WHERE user_id = ?').bind(session.userId).first<{ display_prefs: string }>()
      const prefs: Record<string, string> = row ? JSON.parse(row.display_prefs || '{}') : {}
      if (key) {
        return ok(prefs[key] !== undefined ? { key, value: prefs[key] } : null)
      }
      return ok(prefs)
    }

    if (method === 'POST') {
      const body = await request.json<{ key: string; value: string }>()
      if (!body.key) return err('key is required')
      await env.DB.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').bind(session.userId).run()
      const row = await env.DB.prepare('SELECT display_prefs FROM user_settings WHERE user_id = ?').bind(session.userId).first<{ display_prefs: string }>()
      const prefs: Record<string, string> = row ? JSON.parse(row.display_prefs || '{}') : {}
      prefs[body.key] = body.value
      await env.DB.prepare('UPDATE user_settings SET display_prefs = ?, updated_at = datetime(\'now\') WHERE user_id = ?').bind(JSON.stringify(prefs), session.userId).run()
      return ok({ success: true })
    }

    return err('Method not allowed', 405)
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
        INSERT INTO network_connections (id, tenant_id, created_by, name, title, company, address, email, phone, telephone, fax, website, poi, picture_url, type, notes, experience_rating, experience_notes, is_private, business_card_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, session.tenantId, session.userId, body.name, body.title || null, body.company || null,
        body.address || null, body.email || null, body.phone || null, body.telephone || body.phone || null, body.fax || null,
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
        SET name = ?, title = ?, company = ?, address = ?, email = ?, phone = ?, telephone = ?, fax = ?, website = ?, poi = ?, picture_url = ?,
            type = ?, notes = ?, experience_rating = ?, experience_notes = ?, is_private = ?, business_card_key = ?
        WHERE id = ? AND tenant_id = ?
      `).bind(
        body.name, body.title || null, body.company || null, body.address || null, body.email || null, body.phone || null,
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
