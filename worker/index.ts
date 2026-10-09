import { handleOperations } from './lib/operations'
import { completePasswordReset, storePasswordResetToken } from './lib/password-reset'
import { startOperationsAgreement } from './lib/operations-agreements'
import { avatarUrl as resolveAvatarUrl } from '../src/lib/avatar'
import { launchRoutes } from './lib/agent-launch'
import { processIntake, type Intake } from './lib/lead-intake'
import { deliverNotificationEmails } from './lib/agent-notifications'
import { handleListingInquiries } from './lib/listing-inquiries'
import { saveOfflineNote } from './lib/offline-notes'
import { handleNext, handleContactRelationships } from './lib/next'
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
  clearAllSessionCookies,
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
  workspaceEmailUrl,
} from './lib/email'
import { resolveOrCreateTenant, getTenant, isPrimeAmericaEmail, resolveTenantForHostname } from './lib/tenant'
import { dollarsToCents, necFilingThresholdCents } from './lib/commission'
import { handleDirectorRequest } from './lib/director-routes'
import { imageBytesToDataUrl, parseBusinessCardOcrResponse } from './lib/network'
import type { Ai } from '@cloudflare/workers-types'

import type { D1Database, KVNamespace, ExecutionContext, Fetcher, R2Bucket } from '@cloudflare/workers-types'

// ── Env ──────────────────────────────────────────────────────────────────────

export interface Env {
  __STATIC_CONTENT: any
  DB: D1Database
  EMAIL_TOKENS_KV: KVNamespace
  EMAIL: { send: (msg: any) => Promise<void> }
  JWT_SECRET: string
  BRAND_HUB_SSO_SECRET?: string
  BRAND_HUB_TENANT_ID?: string
  INTERNAL_API_SECRET: string
  APP_NAME: string
  APP_ENV: string
  APP_BASE_URL: string
  FROM_EMAIL: string
  INVENTORY_WORKER_URL: string
  // Service bindings for modules
  AUTH?: Fetcher
  CRM: Fetcher
  TRANSACTIONS: Fetcher
  PRIME_VIEW: Fetcher
  // Storage
  ASSETS_BUCKET: R2Bucket
  // DIRECTOR.EXE
  AI: Ai
  DIRECTOR_DEFAULT_QUOTA?: string
  DIRECTOR_MONTHLY_BUDGET_USD?: string
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
  autoCreatedUsers: number
  autoCreatedList: Array<{ name: string; licenseNumber: string | null }>
  removedUsersList: Array<{ name: string; email: string }>
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
    .prepare('SELECT id, name, email, license_number, role FROM users WHERE tenant_id = ? AND is_active = 1')
    .bind(tenantId)
    .all<{ id: string; name: string; email: string; license_number: string | null; role: string }>()

  let matchedUsers = 0
  const matchedAgentKeys = new Set<string>()
  const removedUsersList: Array<{ name: string; email: string }> = []

  for (const user of users.results || []) {
    let matched: NyLicenseRow | undefined
    const userLic = (user.license_number || '').trim().toUpperCase()

    // 1. Try matching by license number first if on file
    if (userLic) {
      matched = agents.find((agent) => (agent.license_number || '').trim().toUpperCase() === userLic)
    }

    // 2. Fall back to normalized first & last name matching
    if (!matched) {
      const userTokens = normalizeName(user.name || '').split(' ').filter(Boolean)
      if (userTokens.length >= 2) {
        const first = userTokens[0]
        const last = userTokens[userTokens.length - 1]
        matched = agents.find((agent) => {
          const holder = normalizeName(agent.license_holder_name || '')
          return holder.includes(first) && holder.includes(last)
        })
      }
    }

    if (matched) {
      const key = (matched.license_number || '').trim() || `${matched.license_holder_name || ''}|${matched.license_type || ''}`
      matchedAgentKeys.add(key)

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
    } else {
      // If user is a salesperson or broker (or had a license number entered), they are expected on NY DOS
      if (['salesperson', 'broker'].includes(user.role) || userLic) {
        removedUsersList.push({
          name: user.name || 'Unnamed Agent',
          email: user.email || '',
        })
      }
    }
  }

  // Find all state agents who are on the DOS registry but not claimed/matched by any workspace user
  const autoCreatedList: Array<{ name: string; licenseNumber: string | null }> = []
  for (const agent of agents) {
    const key = (agent.license_number || '').trim() || `${agent.license_holder_name || ''}|${agent.license_type || ''}`
    if (!matchedAgentKeys.has(key)) {
      autoCreatedList.push({
        name: agent.license_holder_name || 'Unknown Agent',
        licenseNumber: agent.license_number || null,
      })
    }
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
    autoCreatedUsers: autoCreatedList.length,
    autoCreatedList,
    removedUsersList,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INVENTORY NORMALIZATION HELPERS
// ════════════════════════════════════════════════════════════════════════════

function normalizeInventoryListing(project: any): any {
  if (!project) return null
  const pdata = project.data || {}

  const streetParts = [pdata.streetNumber, pdata.streetName, pdata.streetSuffix].filter(Boolean)
  const street = streetParts.join(' ').trim()

  const listingAgentName = pdata.listAgentFullName || project.agent_name || project.agentName || ''
  const listingAgentEmail = pdata.listAgentEmail || project.agent_email || project.agentEmail || ''
  const listingAgentPhone = pdata.listAgentDirectPhone || pdata.listAgentCellPhone || project.agent_phone || project.agentPhone || ''
  const listingAgentBrokerage = pdata.listOfficeName || project.brokerage_name || project.brokerage || 'Prime America Real Estate'

  const access = project.access || {}
  const editToken = access.editToken || pdata.editToken || ''
  const inviteOnlyToken = access.inviteOnlyToken || pdata.inviteOnlyToken || ''
  const editUrl = editToken
    ? `https://inventory.primeamericarealestate.com/share/edit/${project.id}/${editToken}`
    : `https://inventory.primeamericarealestate.com/listings/${project.id}`
  const readOnlyUrl = inviteOnlyToken
    ? `https://inventory.primeamericarealestate.com/share/invite/${project.id}/${inviteOnlyToken}`
    : ''

  const rawMedia = Array.isArray(project.media) ? project.media : []
  const normalizedMedia = rawMedia.map((m: any) => {
    const rawUrl = m.mediaUrl || m.url || m.media_url || ''
    let mediaUrl = rawUrl
    if (rawUrl && typeof rawUrl === 'string') {
      const trimmed = rawUrl.trim()
      if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/') && !trimmed.startsWith('data:')) {
        mediaUrl = project.id ? `/api/media/${project.id}/${trimmed}` : `/api/media/${trimmed}`
      }
    }
    return {
      ...m,
      mediaUrl,
    }
  })

  let heroMediaUrl = project.heroMediaUrl || null
  if (heroMediaUrl && typeof heroMediaUrl === 'string') {
    const trimmed = heroMediaUrl.trim()
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('/') && !trimmed.startsWith('data:')) {
      heroMediaUrl = project.id ? `/api/media/${project.id}/${trimmed}` : `/api/media/${trimmed}`
    }
  }

  return {
    id: project.id || '',
    address: project.name || street || 'Address unavailable',
    city: pdata.city || project.city || '',
    state: pdata.stateOrProvince || project.state || '',
    zip: pdata.postalCode || project.zip || '',
    price: pdata.listPrice ?? project.price ?? null,
    status: project.status || pdata.listingStatus || 'active',
    approval_status: project.approvalStatus || project.approval_status || null,
    type: project.propertyType || pdata.propertyType || pdata.propertySubtype || '',
    propertyType: project.propertyType || pdata.propertyType || pdata.propertySubtype || '',
    bedrooms: pdata.bedroomsTotal ?? 0,
    bathrooms: pdata.bathroomsTotalInteger ?? 0,
    sqft: pdata.livingArea ?? 0,
    description: pdata.publicRemarks || pdata.marketingHeadline || project.description || '',
    heroMediaUrl: heroMediaUrl || normalizedMedia[0]?.mediaUrl || null,
    listingAgentName,
    listingAgentEmail,
    listingAgentPhone,
    listingAgentBrokerage,
    editUrl,
    readOnlyUrl,
    editToken,
    inviteOnlyToken,
    createdBy: project.createdBy || project.created_by || pdata.createdBy || '',
    media: normalizedMedia,
    raw: { data: pdata },
    lotSize: pdata.lotSizeArea || pdata.lotSizeSquareFeet || pdata.lotSize || 0,
    yearBuilt: pdata.yearBuilt || 0,
    propertySubtype: pdata.propertySubtype || '',
    mlsNumber: pdata.mlsNumber || pdata.listingId || '',
    neighborhood: pdata.neighborhood || pdata.subdivisionName || '',
    county: pdata.county || '',
    mlsAreaMajor: pdata.mlsAreaMajor || '',
    mlsAreaMinor: pdata.mlsAreaMinor || '',
    schoolDistrict: pdata.schoolDistrict || pdata.highSchoolDistrict || '',
    elementarySchool: pdata.elementarySchool || '',
    middleOrJuniorSchool: pdata.middleOrJuniorSchool || '',
    highSchool: pdata.highSchool || '',
    latitude: pdata.latitude || null,
    longitude: pdata.longitude || null,
    onMarketDate: pdata.onMarketDate || project.createdAt || null,
  }
}

// ─── Public Listing DTO ───────────────────────────────────────────────────────
// Allow-listed fields only. Strips raw upstream data and scrubs media metadata.

function toPublicListingDto(normalized: any): any {
  if (!normalized) return null
  return {
    id: normalized.id,
    address: normalized.address,
    city: normalized.city,
    state: normalized.state,
    zip: normalized.zip || null,
    price: normalized.price ?? null,
    status: normalized.status,
    type: normalized.type,
    propertyType: normalized.propertyType,
    bedrooms: normalized.bedrooms ?? 0,
    bathrooms: normalized.bathrooms ?? 0,
    sqft: normalized.sqft ?? 0,
    description: normalized.description || '',
    heroMediaUrl: normalized.heroMediaUrl || null,
    listingAgentName: normalized.listingAgentName || null,
    listingAgentEmail: normalized.listingAgentEmail || null,
    listingAgentPhone: normalized.listingAgentPhone || null,
    listingAgentBrokerage: normalized.listingAgentBrokerage || null,
    lotSize: normalized.lotSize ?? 0,
    yearBuilt: normalized.yearBuilt ?? 0,
    propertySubtype: normalized.propertySubtype || '',
    mlsNumber: normalized.mlsNumber || '',
    neighborhood: normalized.neighborhood || '',
    county: normalized.county || '',
    mlsAreaMajor: normalized.mlsAreaMajor || '',
    mlsAreaMinor: normalized.mlsAreaMinor || '',
    schoolDistrict: normalized.schoolDistrict || '',
    elementarySchool: normalized.elementarySchool || '',
    middleOrJuniorSchool: normalized.middleOrJuniorSchool || '',
    highSchool: normalized.highSchool || '',
    latitude: normalized.latitude ?? null,
    longitude: normalized.longitude ?? null,
    onMarketDate: normalized.onMarketDate || null,
    media: (normalized.media || []).map((m: any) => ({
      id: m.id || '',
      mediaUrl: m.mediaUrl || '',
      caption: m.caption || '',
      orderIndex: m.orderIndex ?? 0,
      type: m.type || 'image',
    })),
  }
}

// ─── Workspace Internal Listing DTO ──────────────────────────────────────────
// Includes authenticated workspace fields (createdBy, scoped edit links, etc.)

function toWorkspaceListingDto(normalized: any): any {
  if (!normalized) return null
  return {
    ...toPublicListingDto(normalized),
    approval_status: normalized.approval_status,
    createdBy: normalized.createdBy || null,
    editUrl: normalized.editUrl || null,
    readOnlyUrl: normalized.readOnlyUrl || null,
    editToken: normalized.editToken || null,
    inviteOnlyToken: normalized.inviteOnlyToken || null,
  }
}

function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

async function fetchPublicListing(listingId: string, env: Env): Promise<any | null> {
  try {
    const proxyHeaders = { Authorization: `Bearer ${env.INTERNAL_API_SECRET}` }
    const response = await fetch(
      `${env.INVENTORY_WORKER_URL}/api/external/listings?id=${encodeURIComponent(listingId)}&limit=1`,
      {
      headers: proxyHeaders,
      }
    )
    if (response.ok) {
      const data: any = await response.json()
      const listings = Array.isArray(data.listings)
        ? data.listings
        : Array.isArray(data.data)
          ? data.data
          : data.id
            ? [data]
            : []
      const listing = listings.find((l: any) => l.id === listingId)
      if (listing) {
        return toPublicListingDto(normalizeInventoryListing(listing))
      }
    }
  } catch (e) {
    console.error('Error fetching public listing for OpenGraph:', e)
  }
  return null
}

async function fetchInviteListing(listingId: string, inviteToken: string, env: Env): Promise<any | null> {
  if (!listingId || !inviteToken) return null
  try {
    const response = await fetch(
      `${env.INVENTORY_WORKER_URL}/api/shared/invite/${encodeURIComponent(listingId)}/${encodeURIComponent(inviteToken)}`,
      { headers: { Authorization: `Bearer ${env.INTERNAL_API_SECRET}` } },
    )
    if (!response.ok) return null
    return toPublicListingDto(normalizeInventoryListing(await response.json()))
  } catch {
    return null
  }
}

async function fetchInternalListing(listingId: string, tenantId: string, env: Env): Promise<any | null> {
  try {
    const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings/${encodeURIComponent(listingId)}`, {
      headers: {
        Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        'X-User-Id': 'workspace-public-inquiry',
        'X-Tenant-Id': tenantId,
        'X-User-Role': 'admin',
      },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN FETCH HANDLER
// ════════════════════════════════════════════════════════════════════════════

export default {
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(deliverNotificationEmails(env))
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const origin = request.headers.get('Origin') ?? ''
    // Cookie-authenticated mutations must originate from this application.
    if (!['GET','HEAD','OPTIONS'].includes(request.method) && request.headers.get('Cookie')?.includes('re_session=')) {
      const trustedOrigins = [url.origin,'https://workspace.primeamericany.com','https://inside.primeamericarealestate.com','https://inventory.primeamericarealestate.com','https://openhouse.primeamericarealestate.com']
      if ((origin && !trustedOrigins.includes(origin)) || (!origin && request.headers.get('Sec-Fetch-Site')==='cross-site')) return err('Invalid request origin',403)
    }


    // CORS preflight
    if (request.method === 'OPTIONS' && path.startsWith('/api/')) {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // ── API Routes ───────────────────────────────────────────────────────────
    if (path.startsWith('/api/')) {
      try {
        return await handleApi(request, env, path, url, ctx)
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

          // Dynamic Server-Side OpenGraph & Twitter Card Injection for Listings
          const listingMatch = path.match(/^\/(?:public|inventory)\/listings\/([^/]+)/) || path.match(/^\/p\/([^/]+)/)
          if (listingMatch && request.method === 'GET') {
            const listingId = listingMatch[1]
            const inviteToken = url.searchParams.get('inviteToken') || ''
            const listing = inviteToken
              ? await fetchInviteListing(listingId, inviteToken, env)
              : await fetchPublicListing(listingId, env)
            if (listing) {
              const html = await res.text()
              const title = `${listing.price ? '$' + Number(listing.price).toLocaleString() + ' — ' : ''}${listing.address} | Prime America Real Estate`
              const streetClean = (listing.address || '').replace(/,\s*(?:USA|United States)$/i, '')
              const specs = [
                listing.bedrooms ? `${listing.bedrooms} Beds` : null,
                listing.bathrooms ? `${listing.bathrooms} Baths` : null,
                listing.sqft ? `${Number(listing.sqft).toLocaleString()} SqFt` : null,
                listing.propertyType || 'Real Estate'
              ].filter(Boolean).join(' • ')

              const description = `${specs}. ${listing.description ? listing.description.replace(/\s+/g, ' ').slice(0, 200) : 'Explore high-resolution photos, 3D tour, neighborhood amenities, and local market details on Prime America Real Estate.'}`

              let heroImg = listing.heroMediaUrl || ''
              if (heroImg && !heroImg.startsWith('http://') && !heroImg.startsWith('https://')) {
                heroImg = `https://inventory.primeamericarealestate.com${heroImg.startsWith('/') ? '' : '/'}${heroImg}`
              }
              if (!heroImg) {
                heroImg = `${url.origin}/prime-america-seal.png`
              }

              const canonicalUrl = `${url.origin}/public/listings/${listing.id}/${slugify(listing.address || '')}`

              const socialUrl = new URL(canonicalUrl)
              if (url.searchParams.get('sharedBy')) socialUrl.searchParams.set('sharedBy', url.searchParams.get('sharedBy')!)
              if (inviteToken) socialUrl.searchParams.set('inviteToken', inviteToken)

              const escapeAttr = (s: string) => (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

              const metaTags = `
    <title>${escapeAttr(title)}</title>
    <meta name="description" content="${escapeAttr(description)}">
    <link rel="canonical" href="${escapeAttr(canonicalUrl)}">
    <!-- OpenGraph / Social Rich Previews -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Prime America Real Estate">
    <meta property="og:title" content="${escapeAttr(title)}">
    <meta property="og:description" content="${escapeAttr(description)}">
    <meta property="og:image" content="${escapeAttr(heroImg)}">
    <meta property="og:image:alt" content="${escapeAttr(streetClean)}">
    <meta property="og:url" content="${escapeAttr(socialUrl.toString())}">
    <!-- Twitter / X Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeAttr(title)}">
    <meta name="twitter:description" content="${escapeAttr(description)}">
    <meta name="twitter:image" content="${escapeAttr(heroImg)}">
    <!-- Structured Schema.org RealEstateListing -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "RealEstateListing",
      "name": ${JSON.stringify(title)},
      "description": ${JSON.stringify(description)},
      "image": ${JSON.stringify(heroImg)},
      "url": ${JSON.stringify(canonicalUrl)},
      "offers": {
        "@type": "Offer",
        "price": ${listing.price || 0},
        "priceCurrency": "USD"
      }
    }
    </script>`

              const injectedHtml = html.replace(/<title>.*?<\/title>/i, metaTags)

              return new Response(injectedHtml, {
                status: 200,
                headers: {
                  'Content-Type': 'text/html; charset=utf-8',
                  'Cache-Control': 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=86400',
                },
              })
            }
          }

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

async function handleApi(request: Request, env: Env, path: string, url: URL, ctx: ExecutionContext): Promise<Response> {
  const method = request.method

  if (path.startsWith('/api/pilot/') || path === '/api/user/notification-preferences') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const response = await launchRoutes(request, env, session)
    if (request.method === 'POST' && response?.ok) ctx.waitUntil(deliverNotificationEmails(env))
    return response || err('Not found',404)
  }

  if (path === '/api/health') {
    return ok({ status: 'ok', app: env.APP_NAME, env: env.APP_ENV, ts: Date.now() })
  }

  // ── Prime View Proxy — /api/prime-view/* ──────────────────────────────────────
  // Simple pass-through. Prime View worker currently serves health checks only.
  // Auth enrichment and assistant delegation will be restored when new routes are built.
  if (path.startsWith('/api/prime-view/')) {
    return env.PRIME_VIEW.fetch(request);
  }

  // ── SSO Redirect — /api/sso/redirect ────────────────────────────────────────
  if (path === '/api/sso/redirect' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const appId = url.searchParams.get('app') || ''
    const returnTo = url.searchParams.get('return_to') || '/'

    // Map known apps to their target URLs (logical app IDs only)
    const appUrls: Record<string, string> = {
      'prime-america-kb': 'https://prime-america-kb.lama-4db.workers.dev/hub/',
      'academy': 'https://primeamerica.theceshop.com/real-estate/',
      'inventory': 'https://inventory.primeamericarealestate.com',
      'listing-input': 'https://inventory.primeamericarealestate.com',
      'openhouse': 'https://openhouse.primeamericarealestate.com',
      'brand-hub': 'https://inside.primeamericarealestate.com',
      'branding-hub': 'https://inside.primeamericarealestate.com',
    }

    const targetUrl = appUrls[appId]
    if (!targetUrl) {
      return err(`Unknown SSO target app: ${appId}`, 400)
    }

    // Resolve before minting: a token must never be sent to another origin.
    if (returnTo.startsWith('//') || /[\\\x00-\x20]/.test(returnTo)) return err('Invalid SSO destination', 400)
    let destination: URL
    try { destination = new URL(returnTo, targetUrl) } catch { return err('Invalid SSO destination', 400) }
    if (destination.origin !== new URL(targetUrl).origin || destination.username || destination.password) return err('Invalid SSO destination', 400)
    const hubApp = appId === 'brand-hub' || appId === 'branding-hub'
    if (hubApp) {
      if (session.tenantId !== env.BRAND_HUB_TENANT_ID) return err('Hub access unavailable for this workspace', 403)
      const state = destination.searchParams.get('state') || ''
      if (destination.pathname !== '/auth/workspace/callback' || !/^[a-f0-9-]{36}$/.test(state) || destination.hash || [...destination.searchParams.keys()].some(key => key !== 'state')) {
        const start = new URL('/auth/workspace/start', targetUrl)
        start.searchParams.set('return_to', destination.pathname + destination.search + destination.hash)
        start.searchParams.set('workspace_origin', url.origin)
        return Response.redirect(start.toString(), 303)
      }
    }
    const storedReturn = destination.pathname + destination.search + destination.hash

    // Generate SSO token
    const token = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 min expiry

    try {
      await env.DB.prepare(`
        INSERT INTO sso_tokens (token, tenant_id, user_id, target_app, return_to, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(token, session.tenantId, session.userId, appId, storedReturn, expiresAt).run()

      const redirectUrlObj = destination
      redirectUrlObj.searchParams.set('sso_token', token)

      return new Response(null, {
        status: 302,
        headers: { 'Location': redirectUrlObj.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
      })
    } catch (e) {
      console.error('SSO redirect error:', e)
      return err('Failed to create SSO session', 500)
    }
  }

  // Consumes the one-time token through server-side callback.
  // Supports GET (Open House compatibility path) and POST (Inventory/Listing-Input path).
  if (path === '/api/sso/validate' && (method === 'GET' || method === 'POST')) {
    let token = ''
    let callback = ''
    if (method === 'GET') {
      token = url.searchParams.get('token') || ''
    } else {
      try {
        const body = await request.json<{ token?: string; callback?: string }>()
        token = body?.token || ''
        callback = body?.callback || ''
      } catch (e) {
        return err('Invalid JSON body', 400)
      }
    }

    if (!token) return err('Invalid SSO token', 401)

    // Optional service-to-service authentication via Bearer token matching INTERNAL_API_SECRET or app secret
    const authHeader = request.headers.get('Authorization') || ''
    const hubCredential = Boolean(env.BRAND_HUB_SSO_SECRET && authHeader === `Bearer ${env.BRAND_HUB_SSO_SECRET}` && request.headers.get('X-SSO-App') === 'brand-hub')
    if (authHeader && !hubCredential) {
      const allowedSecrets = [env.INTERNAL_API_SECRET, (env as any).SSO_VALIDATION_SECRET_INVENTORY].filter(Boolean)
      if (allowedSecrets.length > 0 && !allowedSecrets.some((sec) => authHeader === `Bearer ${sec}`)) {
        return err('Unauthorized SSO validation request', 401)
      }
    }

    const row = await env.DB.prepare(`
      SELECT s.token, s.tenant_id, s.target_app, s.return_to, s.used_at, s.expires_at,
             u.id AS user_id, u.email AS user_email, u.name AS user_name, u.role AS user_role
      FROM sso_tokens s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND u.is_active = 1 AND u.tenant_id = s.tenant_id
    `).bind(token).first<{
      token: string
      tenant_id: string
      target_app: string
      return_to: string
      used_at: string | null
      expires_at: string
      user_id: string
      user_email: string
      user_name: string
      user_role: string
    }>()

    const audience = request.headers.get('X-SSO-App')
    const canonicalApp = (app: string) => app === 'branding-hub' ? 'brand-hub' : app === 'listing-input' ? 'inventory' : app
    if (audience && row && canonicalApp(audience) !== canonicalApp(row.target_app)) return err('SSO audience mismatch',401)
    const validApps = ['openhouse', 'inventory', 'listing-input', 'brand-hub', 'branding-hub']
    if (!row || !validApps.includes(row.target_app) || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      return err('Invalid SSO token', 401)
    }

    const hubToken = canonicalApp(row.target_app) === 'brand-hub'
    if (hubCredential && !hubToken) return err('SSO audience mismatch', 401)
    if (hubToken && (!hubCredential || method !== 'POST' || row.tenant_id !== env.BRAND_HUB_TENANT_ID || !callback || callback !== row.return_to)) return err('Unauthorized hub handoff', 403)

    const consumed = await env.DB.prepare(
      'UPDATE sso_tokens SET used_at = ? WHERE token = ? AND used_at IS NULL'
    ).bind(new Date().toISOString(), token).run()
    const changes = Number((consumed.meta as { changes?: unknown } | undefined)?.changes ?? 0)
    if (changes !== 1) return err('Invalid SSO token', 401)

    return ok({
      user: { id: row.user_id, email: row.user_email, name: row.user_name, role: row.user_role },
      tenant: { id: row.tenant_id },
    })
  }

  // ── Public Lead Submission ────────────────────────────────────────────────
  if (path === '/api/public/lead' && method === 'POST') {
    const body = await request.json<{
      listingId: string
      inquiryId?: string
      sharedBy?: string
      first_name: string
      last_name: string
      email: string
      phone: string
      notes?: string
      marketingConsent?: boolean
    }>()

    if (!body.listingId || !body.first_name?.trim() || !body.last_name?.trim() || !body.email?.trim()) {
      return err('Listing, name, and email are required', 400)
    }
    const publicTenant = await resolveTenantForHostname(url.hostname,env.DB)
    if(!publicTenant)return err('Unknown workspace tenant',404)
    const listing = await fetchInternalListing(body.listingId, publicTenant.id, env)
    const tenantId = typeof listing?.tenantId === 'string' ? listing.tenantId : ''
    const agentId = typeof listing?.data?.listAgentUserId === 'string'
      ? listing.data.listAgentUserId
      : typeof listing?.createdBy === 'string' ? listing.createdBy : ''
    if (!tenantId || tenantId !== publicTenant.id || !agentId) return err('Listing attribution is incomplete', 409)

    const sharedBy = typeof body.sharedBy === 'string' ? body.sharedBy : ''
    const assignee = sharedBy || agentId
    const member = await env.DB.prepare("SELECT id FROM users WHERE id=? AND tenant_id=? AND is_active=1 AND role IN ('salesperson','broker','admin')").bind(assignee,tenantId).first()
    if (!member) return err('This agent link is no longer available. Please contact the brokerage.',409)
    if(body.inquiryId && !/^[a-zA-Z0-9_-]{1,80}$/.test(body.inquiryId)) return err('Invalid inquiry reference')
    if(body.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || (body.notes?.length || 0)>4000 || body.first_name.length>100 || body.last_name.length>100) return err('Please check your contact details')
    const inquiryId = body.inquiryId || crypto.randomUUID()
    const consentCapturedAt = new Date().toISOString()
    const payload = {sourceId:inquiryId,listingId:body.listingId,assignedTo:assignee,firstName:body.first_name.trim(),lastName:body.last_name.trim(),email:body.email.trim(),phone:body.phone?.trim() || null,notes:body.notes || 'Public listing inquiry',consentStatus:body.marketingConsent?'property_and_marketing':'property_contact_only',consentCapturedAt,occurredAt:consentCapturedAt,metadata:{channel:'public_listing_page',sharedBy:sharedBy || null}}
    await env.DB.prepare(`INSERT OR IGNORE INTO listing_lead_intakes(tenant_id,id,listing_id,assigned_to,payload_json) VALUES(?,?,?,?,?)`).bind(tenantId,inquiryId,body.listingId,assignee,JSON.stringify(payload)).run()
    const intake = await env.DB.prepare('SELECT * FROM listing_lead_intakes WHERE tenant_id=? AND id=?').bind(tenantId,inquiryId).first<Intake>()
    if(!intake || intake.assigned_to!==assignee || intake.listing_id!==body.listingId) return err('Inquiry reference is already in use',409)
    try { await processIntake(env,intake,url.origin) } catch {
      await env.DB.prepare("UPDATE listing_lead_intakes SET status='failed',updated_at=datetime('now') WHERE tenant_id=? AND id=? AND status!='delivered'").bind(tenantId,inquiryId).run()
    }
    ctx.waitUntil(deliverNotificationEmails(env))
    // Never disclose whether this prospect exists in another agent's CRM.
    return ok({success:true,inquiryId,message:'Your inquiry was received. Our team will follow up.'})
  }

  // GET /api/public/listings
  if (path === '/api/public/listings' && method === 'GET') {
    try {
      const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/external/listings`, {
        headers: { Authorization: `Bearer ${env.INTERNAL_API_SECRET}` },
      })
      if (!response.ok) {
        throw new Error(`Inventory returned status ${response.status}`)
      }
      const data: any = await response.json()
      const listings = data.listings || data.data || data || []
      const normalized = Array.isArray(listings)
        ? listings.map(normalizeInventoryListing).filter(Boolean)
        : []
      return ok(normalized.map(toPublicListingDto).filter(Boolean))
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
      const inviteToken = url.searchParams.get('inviteToken') || ''
      const listing = inviteToken
        ? await fetchInviteListing(listingId, inviteToken, env)
        : await fetchPublicListing(listingId, env)
      if (listing) {
        return ok(listing)
      }
      return err('Listing not found', 404)
    } catch (e: any) {
      console.error('Failed to load public listing:', e)
      return err(e.message || 'Failed to load listing', 500)
    }
  }

  // ── Media Proxy — /api/media/* ──────────────────────────────────────────────
  if (path.startsWith('/api/media/')) {
    try {
      const targetUrl = new URL(path + (url.search || ''), env.INVENTORY_WORKER_URL)
      const proxyRes = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: {
          Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
        },
      })
      const headers = new Headers(proxyRes.headers)
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(proxyRes.body, {
        status: proxyRes.status,
        headers,
      })
    } catch (e: any) {
      return err('Media not found', 404)
    }
  }

  // ── Hyper-Local Amenities Edge Proxy with Cache — GET /api/amenities ────────
  if ((path === '/api/amenities' || path === '/api/public/amenities') && method === 'GET') {
    const lat = parseFloat(url.searchParams.get('lat') || '')
    const lng = parseFloat(url.searchParams.get('lng') || '')
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return err('Invalid coordinates', 400)
    }

    const radius = Math.min(2000, Math.max(300, parseInt(url.searchParams.get('radius') || '1000', 10)))

    const cacheKeyUrl = new URL(request.url)
    cacheKeyUrl.search = `?lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}&r=${radius}`
    const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' })
    const cache = typeof caches !== 'undefined' ? (caches as any).default : null

    if (cache) {
      try {
        const cachedRes = await cache.match(cacheKey)
        if (cachedRes) return cachedRes
      } catch (_) {}
    }

    const query = `[out:json][timeout:8];(
      nwr(around:${radius},${lat},${lng})[amenity][name];
      nwr(around:${radius},${lat},${lng})[shop][name];
      nwr(around:${radius},${lat},${lng})[leisure][name];
      nwr(around:${radius},${lat},${lng})[railway=station];
      nwr(around:${radius},${lat},${lng})[railway=subway_entrance];
      nwr(around:${radius},${lat},${lng})[public_transport=station];
      nwr(around:${radius},${lat},${lng})[highway=bus_stop];
    );out center 60;`

    const mirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ]

    let elements: any[] = []
    let providerAvailable = false
    const overpassController = new AbortController()
    const overpassTimeoutId = setTimeout(() => overpassController.abort(), 4500)
    try {
      elements = await Promise.any(mirrors.map(async (mirror) => {
        const mirrorRes = await fetch(`${mirror}?data=${encodeURIComponent(query)}`, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'PrimeAmericaRealEstate/1.0',
          },
          signal: overpassController.signal,
        })
        if (!mirrorRes.ok) throw new Error('Amenity provider unavailable')
        const data: any = await mirrorRes.json()
        if (!Array.isArray(data?.elements)) throw new Error('Invalid amenity provider response')
        return data.elements
      }))
      providerAvailable = true
    } catch (_) {
      // The official NYC source below keeps local property pages useful when
      // public Overpass mirrors reject traffic from the Worker network.
    } finally {
      clearTimeout(overpassTimeoutId)
      overpassController.abort()
    }

    const isNycCoordinate = lat >= 40.45 && lat <= 40.95 && lng >= -74.30 && lng <= -73.65
    if (!providerAvailable && isNycCoordinate) {
      const latDelta = radius / 111_320
      const lngDelta = radius / (111_320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))
      const facilitiesUrl = new URL('https://data.cityofnewyork.us/resource/ji82-xba5.json')
      facilitiesUrl.searchParams.set('$select', 'uid,facname,facdomain,facgroup,facsubgrp,factype,latitude,longitude')
      facilitiesUrl.searchParams.set(
        '$where',
        `latitude between ${lat - latDelta} and ${lat + latDelta} AND longitude between ${lng - lngDelta} and ${lng + lngDelta}`,
      )
      facilitiesUrl.searchParams.set('$limit', '1000')

      const facilitiesController = new AbortController()
      const facilitiesTimeoutId = setTimeout(() => facilitiesController.abort(), 6000)
      try {
        const facilitiesRes = await fetch(facilitiesUrl.toString(), {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'PrimeAmericaRealEstate/1.0',
          },
          signal: facilitiesController.signal,
        })
        if (facilitiesRes.ok) {
          const rows: any = await facilitiesRes.json()
          if (Array.isArray(rows)) {
            elements = rows.flatMap((row: any, index: number) => {
              const facilityLat = Number(row?.latitude)
              const facilityLng = Number(row?.longitude)
              const facilityName = String(row?.facname || '').trim()
              if (!Number.isFinite(facilityLat) || !Number.isFinite(facilityLng) || !facilityName) return []

              const description = [row.facdomain, row.facgroup, row.facsubgrp, row.factype, row.facname]
                .filter(Boolean)
                .join(' ')
                .toUpperCase()
              const tags: Record<string, string> = {
                name: facilityName,
                facility_type: String(row?.factype || row?.facsubgrp || row?.facgroup || 'Public facility'),
                source: 'NYC Department of City Planning Facilities Database',
              }

              if (description.includes('LIBRAR')) tags.amenity = 'library'
              else if (description.includes('UNIVERSIT') || description.includes('COLLEGE')) tags.amenity = 'college'
              else if (description.includes('SCHOOL') || description.includes('EDUCATION')) tags.amenity = 'school'
              else if (description.includes('PLAYGROUND')) tags.leisure = 'playground'
              else if (description.includes('PARK')) tags.leisure = 'park'
              else if (description.includes('RECREATION') || description.includes('SPORT')) tags.leisure = 'sports_centre'
              else if (description.includes('SUBWAY') || description.includes('RAIL STATION') || description.includes('BUS STATION')) tags.public_transport = 'station'
              else return []

              return [{
                type: 'nyc_facility',
                id: String(row?.uid || index),
                lat: facilityLat,
                lon: facilityLng,
                tags,
              }]
            })
            providerAvailable = true
          }
        }
      } catch (_) {
        // Public responses intentionally expose only whether any provider worked.
      } finally {
        clearTimeout(facilitiesTimeoutId)
      }
    }

    const response = new Response(JSON.stringify({ elements, available: providerAvailable }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })

    if (cache && elements.length > 0) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()))
    }

    return response
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
            const parsed = JSON.parse(settings.categories)
            parsedCats = Array.isArray(parsed) && parsed.length > 0 ? parsed : null
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
    const publicAgentTenant = await resolveTenantForHostname(url.hostname, env.DB)
    if (!publicAgentTenant) return err("Unknown workspace",404)
    const agent = await env.DB
      .prepare(`
         SELECT u.id, u.tenant_id, u.name, u.email, u.role, u.avatar_url, u.phone, u.license_number,
               t.name as company_name, t.logo_url as company_logo_url, t.primary_color, t.accent_color,
               t.company_address, t.company_telephone, t.company_fax
        FROM users u
        LEFT JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = ? AND u.tenant_id = ? AND u.is_active = 1
      `)
      .bind(agentId, publicAgentTenant.id)
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
      tenantId: agent.tenant_id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
      avatarUrl: resolveAvatarUrl(agent.avatar_url),
      phone: agent.phone,
      licenseNumber: agent.license_number,
      companyName: agent.company_name || 'Prime America Real Estate',
      companyAddress: agent.company_address || null,
      companyTelephone: agent.company_telephone || null,
      companyFax: agent.company_fax || null,
      companyLogoUrl: agent.company_logo_url || '/prime-america-seal.png',
      companyLogoPublicUrl: agent.company_logo_url ? `/api/public/tenants/${encodeURIComponent(agent.tenant_id)}/logo` : '/prime-america-seal.png',
      primaryColor: agent.primary_color || '#0F2040',
      accentColor: agent.accent_color || '#C9A84C',
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
    const tenant = await resolveTenantForHostname(url.hostname,env.DB)
    if (!tenant) return err('Unknown workspace tenant',404)
    const openHouseHeaders = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
      'X-Tenant-Id': tenant.id,
    }
    try {
      const openHouseUrl = `${env.OPENHOUSE_WORKER_URL}/api/events/list`
      const res = await fetch(openHouseUrl, { headers: openHouseHeaders, signal: AbortSignal.timeout(10000) })
      if (!res.ok) {
        const altUrl = 'https://openhouse.primeamericarealestate.com/api/events/list'
        const altRes = await fetch(altUrl, { headers: openHouseHeaders, signal: AbortSignal.timeout(10000) })
        if (altRes.ok) {
          const data: any = await altRes.json()
          return ok(data.events || [])
        }
        return err('Open House is temporarily unavailable',503)
      }
      const data: any = await res.json()
      return ok(data.events || [])
    } catch (e: any) {
      try {
        const altUrl = 'https://openhouse.primeamericarealestate.com/api/events/list'
        const altRes = await fetch(altUrl, { headers: openHouseHeaders, signal: AbortSignal.timeout(10000) })
        if (altRes.ok) {
          const data: any = await altRes.json()
          return ok(data.events || [])
        }
      } catch (e2) {}
      return err('Open House is temporarily unavailable',503)
    }
  }

  // GET /api/public/openhouses/search
  if (path === '/api/public/openhouses/search' && method === 'GET') {
    const searchAddress = (url.searchParams.get('address') || '').toLowerCase().trim()
    const searchCity = (url.searchParams.get('city') || '').toLowerCase().trim()
    const searchState = (url.searchParams.get('state') || '').toLowerCase().trim()
    const searchZip = (url.searchParams.get('zip') || '').toLowerCase().trim()
    const listingId = url.searchParams.get('listingId') || ''
    const tenant = await resolveTenantForHostname(url.hostname,env.DB)
    if (!tenant) return err('Unknown workspace tenant',404)
    const openHouseHeaders = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
      'X-Tenant-Id': tenant.id,
    }

    try {
      const openHouseUrl = `${env.OPENHOUSE_WORKER_URL}/api/events/list`
      const res = await fetch(openHouseUrl, { headers: openHouseHeaders, signal: AbortSignal.timeout(10000) })
      let events: any[] = []

      if (res.ok) {
        const data: any = await res.json()
        events = data.events || []
      } else {
        const altUrl = 'https://openhouse.primeamericarealestate.com/api/events/list'
        const altRes = await fetch(altUrl, { headers: openHouseHeaders, signal: AbortSignal.timeout(10000) })
        if (altRes.ok) {
          const data: any = await altRes.json()
          events = data.events || []
        } else throw Error('Open House source unavailable')
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
      return err('Open House is temporarily unavailable',503)
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
      await sendWelcomeEmail(env.EMAIL, user.email, user.name, env.APP_BASE_URL)
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
      .bind(email.trim().toLowerCase())
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

    const tenant = await env.DB
      .prepare('SELECT * FROM tenants WHERE id = ?')
      .bind(user.tenant_id)
      .first()

    return json(
      { success: true, data: { user: safeUser(user), permissions, tenant: tenant ?? null } },
      200,
      { 'Set-Cookie': setSessionCookie(jwt) },
    )
  }

  // POST or GET /api/auth/logout
  if (path === '/api/auth/logout') {
    const session = await getSession(request, env.JWT_SECRET, env.DB)
    // If currently impersonating, log the end
    if (session?.impersonationLogId) {
      await env.DB
        .prepare('UPDATE impersonation_audit_log SET ended_at = datetime(\'now\') WHERE id = ?')
        .bind(session.impersonationLogId)
        .run()
    }
    const responseHeaders = new Headers({ 'Content-Type': 'application/json' })
    for (const c of clearAllSessionCookies(url.hostname)) {
      responseHeaders.append('Set-Cookie', c)
    }

    const returnTo = url.searchParams.get('return_to')
    if (returnTo) {
      responseHeaders.set('Location', returnTo)
      return new Response(null, { status: 302, headers: responseHeaders })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: responseHeaders })
  }

  // GET /api/auth/me
  if (path === '/api/auth/me' && method === 'GET') {
    const session = await getSession(request, env.JWT_SECRET, env.DB)
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
    const session = await getSession(request, env.JWT_SECRET, env.DB)
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
    const session = await getSession(request, env.JWT_SECRET, env.DB)
    if (!session) return authError()
    const body = await request.json<{
      name?: string
      phone?: string
      title?: string
      licenseNumber?: string | null
      licenseState?: string | null
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
          license_state = COALESCE(?, license_state),
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
        body.licenseState ?? null,
        body.avatarUrl ?? null,
        body.license_expiration_date || null,
        session.userId,
      )
      .run()

    return ok({ success: true })
  }

  // GET /api/user/quick-links — fetch personal quick links from user_settings
  if (path === '/api/user/quick-links' && method === 'GET') {
    const session = await getSession(request, env.JWT_SECRET, env.DB)
    if (!session) return authError()

    const row = await env.DB
      .prepare('SELECT display_prefs FROM user_settings WHERE user_id = ?')
      .bind(session.userId)
      .first<{ display_prefs: string }>()

    let quickLinks: any[] | null = null
    if (row && row.display_prefs) {
      try {
        const parsed = JSON.parse(row.display_prefs)
        if (Array.isArray(parsed.quickLinks)) {
          quickLinks = parsed.quickLinks
        }
      } catch (e) {
        console.error('Error parsing display_prefs:', e)
      }
    }
    return ok({ quickLinks })
  }

  // PUT /api/user/quick-links — update personal quick links in user_settings
  if (path === '/api/user/quick-links' && method === 'PUT') {
    const session = await getSession(request, env.JWT_SECRET, env.DB)
    if (!session) return authError()

    const body = await request.json<{ quickLinks: any[] }>()
    const quickLinks = body.quickLinks || []

    const row = await env.DB
      .prepare('SELECT display_prefs FROM user_settings WHERE user_id = ?')
      .bind(session.userId)
      .first<{ display_prefs: string }>()

    let displayPrefsObj: any = {}
    if (row && row.display_prefs) {
      try {
        displayPrefsObj = JSON.parse(row.display_prefs)
      } catch (e) {
        console.error('Error parsing existing display_prefs:', e)
      }
    }

    displayPrefsObj.quickLinks = quickLinks
    const updatedPrefs = JSON.stringify(displayPrefsObj)

    await env.DB
      .prepare(`
        INSERT INTO user_settings (user_id, display_prefs, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          display_prefs = excluded.display_prefs,
          updated_at = datetime('now')
      `)
      .bind(session.userId, updatedPrefs)
      .run()

    return ok({ success: true })
  }


  // POST /api/auth/avatar
  if (path === '/api/auth/avatar' && method === 'POST') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) return err('Missing avatar file', 400)
    const extensions: Record<string,string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}
    if (!extensions[file.type] || file.size === 0 || file.size > 5 * 1024 * 1024) return err('Choose a JPG, PNG or WebP image up to 5 MB',400)

    const ext = extensions[file.type]
    const key = `${session.tenantId}/avatars/${session.userId}/${newId()}.${ext}`

    await env.ASSETS_BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' }
    })

    await env.DB
      .prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
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
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Cache-Control', 'public, max-age=86400')
    return new Response(object.body, { headers })
  }

  // POST /api/auth/delete-account
  if (path === '/api/auth/delete-account' && method === 'POST') {
    const session = await getSession(request, env.JWT_SECRET, env.DB)
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
      await storePasswordResetToken(env.EMAIL_TOKENS_KV, token, user, TOKEN_TTL.password_reset)
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

    const updated = await completePasswordReset(env.DB, env.EMAIL_TOKENS_KV, token, password)
    if (!updated) return err('Invalid or expired reset link. Please request a new password reset.', 400)

    return ok({ message: 'Password updated successfully. You can now log in.' })
  }

  // POST /api/auth/change-password — authenticated user changes their own password
  if (path === '/api/auth/change-password' && method === 'POST') {
    if (!session) return err('Authentication required', 401)
    const { currentPassword, newPassword } = await request.json<{ currentPassword: string; newPassword: string }>()
    if (!currentPassword || !newPassword) return err('Current and new passwords are required')
    if (newPassword.length < 8) return err('New password must be at least 8 characters')

    const userRecord = await env.DB
      .prepare('SELECT id, password_hash FROM users WHERE id = ?')
      .bind(session.userId)
      .first<{ id: string; password_hash: string }>()
    if (!userRecord) return err('User not found', 404)

    const valid = await verifyPassword(currentPassword, userRecord.password_hash)
    if (!valid) return err('Current password is incorrect', 401)

    const newHash = await hashPassword(newPassword)
    await env.DB
      .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(newHash, session.userId)
      .run()
    return ok({ message: 'Password changed successfully' })
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

  if (path === '/api/internal/app-membership' && method === 'POST') {
    const credential = request.headers.get('Authorization') || ''
    const hubCredential = Boolean(env.BRAND_HUB_SSO_SECRET && credential === `Bearer ${env.BRAND_HUB_SSO_SECRET}` && request.headers.get('X-SSO-App') === 'brand-hub')
    if (!hubCredential && (!env.INTERNAL_API_SECRET || credential !== `Bearer ${env.INTERNAL_API_SECRET}`)) return err('Unauthorized',401)
    const body = await request.json<{tenantId:string;email?:string;userId?:string}>()
    if (hubCredential && (body.tenantId !== env.BRAND_HUB_TENANT_ID || !body.userId)) return err('Invalid hub membership request',403)
    const user = hubCredential
      ? await env.DB.prepare('SELECT id,email,name,role FROM users WHERE tenant_id=? AND id=? AND is_active=1').bind(body.tenantId,body.userId).first()
      : await env.DB.prepare('SELECT id,email,name,role FROM users WHERE tenant_id=? AND lower(email)=lower(?) AND is_active=1').bind(body.tenantId,body.email).first()
    return user ? ok({user,tenantId:body.tenantId}) : err('Membership revoked',403)
  }

  if (path === '/api/offline-attendance' && method === 'POST') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const user = await env.DB.prepare('SELECT role FROM users WHERE id=? AND tenant_id=? AND is_active=1')
      .bind(session.userId,session.tenantId).first<{role:string}>()
    if (!user || !(await can(session.userId,user.role,'openhouse.attendance','write',env.DB))) return err('Attendance capture access revoked',403)
    if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin) return err('Invalid origin',403)
    const body: any = await request.json()
    if (body.actorId !== session.userId || body.tenantId !== session.tenantId) return err('Sign in to the original account',403)
    return fetch(`${env.OPENHOUSE_WORKER_URL}/api/attendance-capture`, {
      method:'POST', signal:AbortSignal.timeout(15000), headers:{'Content-Type':'application/json',
        Authorization:`Bearer ${env.INTERNAL_API_SECRET}`, 'X-User-Id':session.userId,'X-Tenant-Id':session.tenantId},
      body:JSON.stringify({...body.attendance,commandId:body.commandId,occurredAt:body.occurredAt}),
    })
  }
  if (path === '/api/offline-preparation' && method === 'GET') {
    const session = await requireAuth(request,env.JWT_SECRET,env.DB)
    const user = await env.DB.prepare('SELECT role FROM users WHERE id=? AND tenant_id=? AND is_active=1')
      .bind(session.userId,session.tenantId).first<{role:string}>()
    if (!user) return err('Account access revoked',403)
    const contacts = await can(session.userId,user.role,'crm','read',env.DB) ? await env.DB.prepare(`SELECT id,first_name,last_name,email,phone,updated_at FROM contacts
      WHERE tenant_id=? AND assigned_to=? AND is_active=1 ORDER BY updated_at DESC LIMIT 30`).bind(session.tenantId,session.userId).all() : {results:[]}
    const tasks = await can(session.userId,user.role,'transactions','read',env.DB) ? await env.DB.prepare(`SELECT tt.id,tt.title,tt.due_date,tt.status FROM transaction_tasks tt
      JOIN transactions t ON t.id=tt.transaction_id AND t.tenant_id=tt.tenant_id WHERE tt.tenant_id=? AND t.assigned_to=?
      ORDER BY tt.due_date DESC LIMIT 30`).bind(session.tenantId,session.userId).all() : {results:[]}
    let events: unknown[] = [], eventsState = 'unavailable'
    if (await can(session.userId,user.role,'marketing','read',env.DB)) {
      try {
        const response = await fetch(`${env.OPENHOUSE_WORKER_URL}/api/events/list`,{signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.INTERNAL_API_SECRET}`,'X-Tenant-Id':session.tenantId}})
        if(response.ok){ const data:any=await response.json(); events=(data.events||[]).filter((event:any)=>event.agent_user_id===session.userId)
          .map((event:any)=>({id:event.id,title:event.title,address:event.property_address,start:event.start_time,end:event.end_time,version:event.updated_at})); eventsState='current' }
      } catch { /* Explicit unavailable state below. */ }
    }
    return ok({tenantId:session.tenantId,actorId:session.userId,fetchedAt:new Date().toISOString(),contacts:contacts.results,tasks:tasks.results,events,eventsState})
  }

  if (path.startsWith('/api/next/') || path === '/api/contact-relationships') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const currentUser = await env.DB.prepare('SELECT role FROM users WHERE id=? AND tenant_id=? AND is_active=1')
      .bind(session.userId, session.tenantId).first<{ role: string }>()
    if (!currentUser) return err('Account access revoked', 403)
    const role = currentUser.role
    const assignment = role === 'assistant' ? await resolveAssistantAssignment(env.DB, session.userId, session.tenantId) : null
    if (role === 'assistant' && !assignment?.canAccessContacts) return err('Assistant has no active contacts assignment', 403)
    if (!(await can(session.userId, role, 'crm', 'read', env.DB))) return err('No CRM access', 403)
    const write = await can(session.userId, role, 'crm', 'write', env.DB)
    const txAction = request.method === 'GET' ? 'read' : 'write'
    const actor = { ...session, role, principalId: assignment?.principalId, canWrite: write,
      canTransactions: (role !== 'assistant' || !!assignment?.canAccessTransactions) && await can(session.userId, role, 'transactions', txAction, env.DB) }
    if (path === '/api/contact-relationships') return handleContactRelationships(request, env.DB, actor)
    return handleNext(request, env.DB, actor, async id => {
      const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings/${encodeURIComponent(id)}`, {
        signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${env.INTERNAL_API_SECRET}`, 'X-Tenant-Id': session.tenantId,
          'X-User-Id': assignment?.principalId || session.userId, 'X-User-Role': role, 'X-User-Email': session.email || '' },
      })
      if (!response.ok) return false
      const listing = await response.json<{ id?: string }>()
      return listing.id === id
    })
  }

  if (path === '/api/offline-notes') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const active = await env.DB.prepare('SELECT id FROM users WHERE id=? AND tenant_id=? AND is_active=1')
      .bind(session.userId, session.tenantId).first()
    if (!active) return err('Account access revoked', 403)
    if (method === 'POST') {
      const origin = request.headers.get('Origin')
      if (origin && origin !== url.origin) return err('Invalid origin', 403)
      return saveOfflineNote(env.DB, session.tenantId, session.userId, await request.json())
    }
    if (method === 'GET') {
      const notes = await env.DB.prepare('SELECT * FROM personal_notes WHERE tenant_id=? AND user_id=? ORDER BY saved_at DESC LIMIT 100')
        .bind(session.tenantId,session.userId).all()
      return ok(notes.results)
    }
    return err('Method not allowed', 405)
  }

  // GET /api/admin/system — system health status & plan usage
  if (path === '/api/admin/system' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    if (session.role !== 'admin' && session.role !== 'broker') {
      throw forbiddenError('Access denied')
    }

    // 1. Verify D1 SQLite DB
    let dbStatus = 'ok'
    try {
      await env.DB.prepare('SELECT 1').run()
    } catch (e) {
      console.error('System health DB verification failed:', e)
      dbStatus = 'degraded'
    }

    // 2. Verify KV
    const kvStatus = env.EMAIL_TOKENS_KV ? 'ok' : 'degraded'

    // 3. Verify R2
    const r2Status = env.ASSETS_BUCKET ? 'ok' : 'degraded'

    // 4. Load Tenant Plan
    const tenantRow = await env.DB
      .prepare('SELECT plan FROM tenants WHERE id = ?')
      .bind(session.tenantId)
      .first<{ plan: string }>()
    const planName = tenantRow?.plan || 'starter'

    // Define plan limits
    const planLimits: Record<string, { users: number; transactions: number; contacts: number }> = {
      starter: { users: 15, transactions: 50, contacts: 500 },
      growth: { users: 50, transactions: 200, contacts: 2500 },
      enterprise: { users: 999999, transactions: 999999, contacts: 999999 },
    }
    const limits = planLimits[planName] || planLimits.starter

    // Count current usages
    const usersCount = (await env.DB
      .prepare('SELECT COUNT(*) as count FROM users WHERE tenant_id = ? AND is_active = 1')
      .bind(session.tenantId)
      .first<{ count: number }>())?.count || 0

    // Count transactions (deals)
    let transactionsCount = 0
    try {
      const txnRes = await env.TRANSACTIONS.fetch(new Request(`${url.origin}/api/transactions/stats`, {
        headers: {
          'X-User-Id': session.userId,
          'X-Tenant-Id': session.tenantId,
          'X-User-Role': session.role,
        }
      }))
      if (txnRes.ok) {
        const txnData: any = await txnRes.json()
        if (txnData.success && txnData.data) {
          transactionsCount = (txnData.data.active || 0) + (txnData.data.offer_received || 0) + (txnData.data.under_contract || 0) + (txnData.data.lead || 0)
        }
      }
    } catch (e) {
      console.error('Failed to fetch stats for system status:', e)
    }

    // Count CRM contacts
    let contactsCount = 0
    try {
      const crmRes = await env.CRM.fetch(new Request(`${url.origin}/api/contacts/stats`, {
        headers: {
          'X-User-Id': session.userId,
          'X-Tenant-Id': session.tenantId,
          'X-User-Role': session.role,
        }
      }))
      if (crmRes.ok) {
        const crmData: any = await crmRes.json()
        if (crmData.success && crmData.data) {
          contactsCount = crmData.data.total || 0
        }
      }
    } catch (e) {
      console.error('Failed to fetch contacts for system status:', e)
    }

    return ok({
      services: {
        db: dbStatus,
        kv: kvStatus,
        r2: r2Status,
      },
      plan: {
        name: planName,
        users: {
          current: usersCount,
          limit: limits.users,
        },
        transactions: {
          current: transactionsCount,
          limit: limits.transactions,
        },
        contacts: {
          current: contactsCount,
          limit: limits.contacts,
        }
      }
    })
  }

  // ════════════════════════════════════════════════════════════════════════
  // PLATFORM ADMIN ROUTES — manage tenants (platform root admin only)
  // ════════════════════════════════════════════════════════════════════════

  if (path.startsWith('/api/platform/')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const PLATFORM_TENANT_ID = 'tenant_primeamerica'
    if (session.role !== 'admin' || session.tenantId !== PLATFORM_TENANT_ID) {
      throw forbiddenError('Platform admin access required')
    }

    // GET /api/platform/tenants — list all tenants with user counts
    if (path === '/api/platform/tenants' && method === 'GET') {
      const tenants = await env.DB.prepare(`
        SELECT t.id, t.name, t.slug, t.plan, t.logo_url, t.created_at,
               COUNT(u.id) as user_count,
               (SELECT name FROM users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1) as admin_name,
               (SELECT email FROM users WHERE tenant_id = t.id AND role = 'admin' LIMIT 1) as admin_email,
               (SELECT license_number FROM users WHERE tenant_id = t.id AND role IN ('admin','broker') LIMIT 1) as broker_license
        FROM tenants t
        LEFT JOIN users u ON u.tenant_id = t.id AND u.is_active = 1
        GROUP BY t.id
        ORDER BY t.created_at ASC
      `).all<{
        id: string; name: string; slug: string; plan: string
        logo_url: string | null; created_at: string; user_count: number
        admin_name: string | null; admin_email: string | null; broker_license: string | null
      }>()
      return ok({ tenants: tenants.results })
    }

    // POST /api/platform/tenants — create a new tenant + seed broker admin user
    if (path === '/api/platform/tenants' && method === 'POST') {
      const body = await request.json<{
        name: string
        slug: string
        plan?: string
        brokerName: string
        brokerEmail: string
        brokerLicense?: string
        workspaceDomain?: string
      }>()
      if (!body.name || !body.slug || !body.brokerName || !body.brokerEmail) {
        return err('name, slug, brokerName, and brokerEmail are required')
      }
      const slugClean = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-')

      // Check slug uniqueness
      const existing = await env.DB
        .prepare('SELECT id FROM tenants WHERE slug = ?')
        .bind(slugClean)
        .first<{ id: string }>()
      if (existing) return err('A tenant with this slug already exists', 409)

      const tenantId = 'tenant_' + slugClean.replace(/-/g, '_') + '_' + Date.now()
      const brokerId = 'user_' + crypto.randomUUID().replace(/-/g, '')
      const tempPassword = 'Welcome' + Math.floor(1000 + Math.random() * 9000) + '!'
      const passwordHash = await hashPassword(tempPassword)

      // Create tenant row
      await env.DB.prepare(
        `INSERT INTO tenants (id, name, slug, plan, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
      ).bind(tenantId, body.name, slugClean, body.plan ?? 'starter').run()

      // Set workspace domain if provided
      if (body.workspaceDomain) {
        await env.DB.prepare("UPDATE tenants SET custom_workspace_domain = ? WHERE id = ?")
          .bind(body.workspaceDomain, tenantId).run()
      }

      // Seed broker admin user
      await env.DB.prepare(`
        INSERT INTO users (id, tenant_id, name, email, password_hash, role, license_number, is_active, email_verified, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'admin', ?, 1, 0, datetime('now'), datetime('now'))
      `).bind(brokerId, tenantId, body.brokerName, body.brokerEmail.toLowerCase(), passwordHash, body.brokerLicense ?? null).run()

      // Send welcome email to broker (non-blocking)
      try {
        await sendManualUserWelcomeEmail(env.EMAIL, body.brokerEmail, body.brokerName, tempPassword, body.name, env.APP_BASE_URL)
      } catch (e) {
        console.error('Welcome email failed for new tenant broker:', e)
      }

      return ok({ tenantId, brokerId, message: `Tenant "${body.name}" created. Welcome email sent to ${body.brokerEmail}.` })
    }

    // PATCH /api/platform/tenants/:id — update tenant name, plan, or branding
    const tenantUpdateMatch = path.match(/^\/api\/platform\/tenants\/([^/]+)$/)
    if (tenantUpdateMatch && method === 'PATCH') {
      const tenantId = tenantUpdateMatch[1]
      const body = await request.json<{
        name?: string; plan?: string; workspaceDomain?: string; leadAppDomain?: string
      }>()
      const fields: string[] = []
      const values: (string | null)[] = []
      if (body.name) { fields.push('name = ?'); values.push(body.name) }
      if (body.plan) { fields.push('plan = ?'); values.push(body.plan) }
      if (body.workspaceDomain !== undefined) { fields.push('custom_workspace_domain = ?'); values.push(body.workspaceDomain || null) }
      if (body.leadAppDomain !== undefined) { fields.push('lead_app_domain = ?'); values.push(body.leadAppDomain || null) }
      if (fields.length === 0) return err('No fields to update')
      values.push(tenantId)
      await env.DB.prepare(`UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run()
      return ok({ message: 'Tenant updated' })
    }

    return err('Platform endpoint not found', 404)
  }

  // ════════════════════════════════════════════════════════════════════════
  // HR ROUTES (admin + broker only)
  // ════════════════════════════════════════════════════════════════════════

  if (path.startsWith('/api/hr/')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    // Most HR routes require admin/broker, EXCEPT stopping impersonation (since you might be impersonating a salesperson)
    if (path !== '/api/hr/impersonate/stop') {
      if (!roleAtLeast(session.role, 'broker') || !(await can(session.userId, session.role, 'hr', 'read', env.DB))) {
        throw forbiddenError('HR access requires broker or admin role with HR permissions')
      }
    }

    // GET /api/hr/commission-plans — latest active plan per agent
    if (path === '/api/hr/commission-plans' && method === 'GET') {
      const rows = await env.DB.prepare(`
        SELECT cp.* FROM commission_plans cp
        WHERE cp.tenant_id = ? AND cp.is_active = 1
        ORDER BY cp.agent_id, cp.effective_from DESC, cp.created_at DESC
      `).bind(session.tenantId).all()
      const latest = new Map<string, Record<string, unknown>>()
      for (const row of rows.results as Record<string, unknown>[]) {
        const agentId = String(row.agent_id)
        if (!latest.has(agentId)) latest.set(agentId, row)
      }
      return ok({ plans: Array.from(latest.values()) })
    }

    // PUT /api/hr/commission-plans/:agentId — effective-date a shared commission plan
    const commissionPlanMatch = path.match(/^\/api\/hr\/commission-plans\/([^/]+)$/)
    if (commissionPlanMatch && method === 'PUT') {
      const agentId = commissionPlanMatch[1]
      const body = await request.json<{
        planType: 'percentage' | 'flat_payout'
        agentPercent?: number | null
        flatPayout?: number | null
        brokerageFee?: number | null
        franchiseFeePercent?: number | null
        cap?: number | null
        effectiveFrom?: string
      }>()
      if (!['percentage', 'flat_payout'].includes(body.planType)) return err('Invalid commission plan type', 400)
      if (body.planType === 'percentage' && (!Number.isFinite(body.agentPercent) || Number(body.agentPercent) < 0 || Number(body.agentPercent) > 100)) {
        return err('Agent percentage must be between 0 and 100', 400)
      }
      if (body.planType === 'flat_payout' && (!Number.isFinite(body.flatPayout) || Number(body.flatPayout) < 0)) {
        return err('Flat payout must be zero or greater', 400)
      }
      const agent = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1')
        .bind(agentId, session.tenantId).first()
      if (!agent) return err('Agent not found', 404)

      const effectiveFrom = body.effectiveFrom || new Date().toISOString().slice(0, 10)
      await env.DB.prepare(`UPDATE commission_plans SET is_active = 0, effective_to = date(?, '-1 day'), updated_at = datetime('now')
        WHERE tenant_id = ? AND agent_id = ? AND is_active = 1`)
        .bind(effectiveFrom, session.tenantId, agentId).run()
      const id = newId()
      await env.DB.prepare(`INSERT INTO commission_plans (
        id, tenant_id, agent_id, plan_type, agent_percent, flat_payout_cents,
        brokerage_fee_cents, franchise_fee_percent, cap_cents, effective_from, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          id, session.tenantId, agentId, body.planType,
          body.planType === 'percentage' ? Number(body.agentPercent) : null,
          body.planType === 'flat_payout' ? dollarsToCents(body.flatPayout) : null,
          dollarsToCents(body.brokerageFee), Number(body.franchiseFeePercent || 0),
          body.cap === null || body.cap === undefined ? null : dollarsToCents(body.cap),
          effectiveFrom, session.userId,
        ).run()
      return ok({ id })
    }

    // POST /api/hr/commission-ledger — record actual payments, advances, and corrections
    if (path === '/api/hr/commission-ledger' && method === 'POST') {
      const body = await request.json<{
        agentId: string
        transactionId?: string | null
        entryType: 'payment' | 'advance' | 'adjustment' | 'repayment' | 'chargeback'
        amount: number
        taxableAmount?: number
        effectiveDate?: string
        paidAt?: string | null
        memo?: string
      }>()
      if (!body.agentId || !['payment', 'advance', 'adjustment', 'repayment', 'chargeback'].includes(body.entryType)) {
        return err('Agent and a valid ledger entry type are required', 400)
      }
      if (!Number.isFinite(body.amount) || Number(body.amount) === 0) return err('Amount must be non-zero', 400)
      const paymentLike = body.entryType === 'payment' || body.entryType === 'advance'
      if (paymentLike && !body.paidAt) return err('Payment date is required for payments and advances', 400)
      const agent = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ?').bind(body.agentId, session.tenantId).first()
      if (!agent) return err('Agent not found', 404)
      if (body.transactionId) {
        const transaction = await env.DB.prepare('SELECT id FROM transactions WHERE id = ? AND tenant_id = ?').bind(body.transactionId, session.tenantId).first()
        if (!transaction) return err('Transaction not found', 404)
      }

      const direction = ['repayment', 'chargeback'].includes(body.entryType) ? -1 : 1
      const amountCents = Math.abs(dollarsToCents(body.amount)) * direction
      const taxableAmountCents = body.taxableAmount !== undefined
        ? dollarsToCents(body.taxableAmount)
        : (paymentLike ? amountCents : 0)
      const id = newId()
      await env.DB.prepare(`INSERT INTO commission_ledger_entries (
        id, tenant_id, agent_id, transaction_id, entry_type, status, amount_cents,
        taxable_amount_cents, effective_date, paid_at, memo, created_by
      ) VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, ?, ?)`)
        .bind(
          id, session.tenantId, body.agentId, body.transactionId || null, body.entryType,
          amountCents, taxableAmountCents, body.effectiveDate || body.paidAt || new Date().toISOString().slice(0, 10),
          body.paidAt || null, body.memo || null, session.userId,
        ).run()
      return ok({ id })
    }

    if (path === '/api/hr/commission-ledger' && method === 'GET') {
      const agentId = url.searchParams.get('agent_id')
      if (!agentId) return err('agent_id is required', 400)
      const rows = await env.DB.prepare(`SELECT cle.*, t.name AS transaction_name
        FROM commission_ledger_entries cle
        LEFT JOIN transactions t ON t.id = cle.transaction_id AND t.tenant_id = cle.tenant_id
        WHERE cle.tenant_id = ? AND cle.agent_id = ?
        ORDER BY cle.effective_date DESC, cle.created_at DESC`)
        .bind(session.tenantId, agentId).all()
      return ok({ entries: rows.results })
    }

    // PUT /api/hr/tax-profiles/:agentId — W-9 readiness without storing a full TIN
    const taxProfileMatch = path.match(/^\/api\/hr\/tax-profiles\/([^/]+)$/)
    if (taxProfileMatch && method === 'PUT') {
      const body = await request.json<{
        legalName?: string; businessName?: string; taxClassification?: string
        tinLastFour?: string; w9Status?: 'missing' | 'requested' | 'received' | 'needs_update'; w9ReceivedAt?: string | null
      }>()
      if (body.tinLastFour && !/^\d{4}$/.test(body.tinLastFour)) return err('TIN last four must contain four digits', 400)
      await env.DB.prepare(`INSERT INTO contractor_tax_profiles (
        tenant_id, user_id, legal_name, business_name, tax_classification, tin_last_four, w9_status, w9_received_at, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET
        legal_name = excluded.legal_name, business_name = excluded.business_name,
        tax_classification = excluded.tax_classification, tin_last_four = excluded.tin_last_four,
        w9_status = excluded.w9_status, w9_received_at = excluded.w9_received_at,
        updated_by = excluded.updated_by, updated_at = datetime('now')`)
        .bind(session.tenantId, taxProfileMatch[1], body.legalName || null, body.businessName || null,
          body.taxClassification || null, body.tinLastFour || null, body.w9Status || 'missing',
          body.w9ReceivedAt || null, session.userId).run()
      return ok({ updated: true })
    }

    // GET /api/hr/1099-report — payment-date report, never a closed-deal estimate
    if (path === '/api/hr/1099-report' && method === 'GET') {
      const agentId = url.searchParams.get('agent_id') || ''
      const taxYear = Number(url.searchParams.get('tax_year'))
      if (!agentId || !Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2200) return err('Valid agent_id and tax_year are required', 400)
      const [agent, tenant, taxProfile, payments, earnings] = await Promise.all([
        env.DB.prepare('SELECT id, name, email, role FROM users WHERE id = ? AND tenant_id = ?').bind(agentId, session.tenantId).first(),
        env.DB.prepare(`SELECT t.name, t.company_address, t.company_telephone, tp.legal_name, tp.tax_id_last_four
          FROM tenants t LEFT JOIN tenant_tax_profiles tp ON tp.tenant_id = t.id WHERE t.id = ?`).bind(session.tenantId).first(),
        env.DB.prepare('SELECT * FROM contractor_tax_profiles WHERE tenant_id = ? AND user_id = ?').bind(session.tenantId, agentId).first(),
        env.DB.prepare(`SELECT cle.*, t.name AS transaction_name FROM commission_ledger_entries cle
          LEFT JOIN transactions t ON t.id = cle.transaction_id AND t.tenant_id = cle.tenant_id
          WHERE cle.tenant_id = ? AND cle.agent_id = ? AND cle.status = 'posted'
            AND cle.paid_at IS NOT NULL AND CAST(strftime('%Y', cle.paid_at) AS INTEGER) = ?
          ORDER BY cle.paid_at ASC, cle.created_at ASC`).bind(session.tenantId, agentId, taxYear).all(),
        env.DB.prepare(`SELECT cle.*, t.name AS transaction_name FROM commission_ledger_entries cle
          LEFT JOIN transactions t ON t.id = cle.transaction_id AND t.tenant_id = cle.tenant_id
          WHERE cle.tenant_id = ? AND cle.agent_id = ? AND (cle.entry_type = 'earned' OR (cle.entry_type = 'adjustment' AND cle.corrects_entry_id IS NOT NULL)) AND cle.status = 'posted'
            AND CAST(strftime('%Y', cle.effective_date) AS INTEGER) = ?
          ORDER BY cle.effective_date ASC`).bind(session.tenantId, agentId, taxYear).all(),
      ])
      if (!agent) return err('Agent not found', 404)
      const taxableTotalCents = (payments.results as Array<{ taxable_amount_cents?: number }>).reduce((sum, entry) => sum + Number(entry.taxable_amount_cents || 0), 0)
      const paidTotalCents = (payments.results as Array<{ amount_cents?: number }>).reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0)
      const earnedTotalCents = (earnings.results as Array<{ amount_cents?: number }>).reduce((sum, entry) => sum + Number(entry.amount_cents || 0), 0)
      const thresholdCents = necFilingThresholdCents(taxYear)
      const issues: string[] = []
      if (!taxProfile || (taxProfile as { w9_status?: string }).w9_status !== 'received') issues.push('Recipient W-9 is not marked received.')
      if (!tenant || !(tenant as { legal_name?: string }).legal_name) issues.push('Payer legal name is not configured.')
      if (!tenant || !(tenant as { tax_id_last_four?: string }).tax_id_last_four) issues.push('Payer tax ID confirmation is not configured.')
      return ok({
        taxYear, agent, payer: tenant, taxProfile,
        payments: payments.results, earnings: earnings.results,
        totals: { earnedCents: earnedTotalCents, paidCents: paidTotalCents, taxableCents: taxableTotalCents },
        thresholdCents, filingThresholdMet: taxableTotalCents >= thresholdCents, issues,
      })
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
        name?: string; email?: string; role?: string; title?: string; phone?: string
        licenseNumber?: string; licenseState?: string; licenseExpirationDate?: string
      }>()

      const user = await env.DB
        .prepare('SELECT id, role, email FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; role: string; email: string }>()
      if (!user) return err('User not found', 404)

      // Email validation and uniqueness check
      let normalizedEmail: string | null = null
      if (body.email !== undefined) {
        const trimmed = body.email.trim().toLowerCase()
        if (trimmed && trimmed !== user.email) {
          // Basic email format validation
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
            return err('Invalid email address format', 400)
          }
          // Check no other user in this tenant already has this email
          const conflict = await env.DB
            .prepare('SELECT id FROM users WHERE email = ? AND tenant_id = ? AND id != ?')
            .bind(trimmed, session.tenantId, targetId)
            .first<{ id: string }>()
          if (conflict) {
            return err('An account with this email address already exists in this workspace', 409)
          }
          normalizedEmail = trimmed
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
          body.name ?? null, normalizedEmail,
          body.role ?? null, body.title ?? null,
          body.phone ?? null, body.licenseNumber ?? null, body.licenseState ?? null,
          body.licenseExpirationDate ?? null,
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
      await storePasswordResetToken(env.EMAIL_TOKENS_KV, token, user, TOKEN_TTL.password_reset)
      await sendPasswordResetEmail(env.EMAIL, user.email, user.name, token, env.APP_BASE_URL)
      return ok({ message: 'Password reset email sent' })
    }

    // POST /api/hr/users/:id/set-password — admin directly sets a new password (no email needed)
    const setPasswordMatch = path.match(/^\/api\/hr\/users\/([^/]+)\/set-password$/)
    if (setPasswordMatch && method === 'POST') {
      if (session.role !== 'admin') throw forbiddenError('Only admins can set user passwords')
      const targetId = setPasswordMatch[1]
      const { password } = await request.json<{ password: string }>()
      if (!password || password.length < 8) return err('Password must be at least 8 characters')
      const targetUser = await env.DB
        .prepare('SELECT id FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string }>()
      if (!targetUser) return err('User not found', 404)
      const passwordHash = await hashPassword(password)
      await env.DB
        .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(passwordHash, targetId)
        .run()
      return ok({ message: 'Password updated successfully' })
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
        .prepare('SELECT id, name, email, role, email_verified FROM users WHERE id = ? AND tenant_id = ?')
        .bind(targetId, session.tenantId)
        .first<{ id: string; name: string; email: string; role: string; email_verified: number }>()

      if (!targetUser) return err('User not found', 404)

      // Role check: broker cannot manage admins/brokers
      if (session.role === 'broker' && !roleAtLeast(targetUser.role, 'broker')) {
        throw forbiddenError('Brokers can only manage salesperson, assistant, vendor, or partner roles')
      }

      // Generate a fresh temporary password
      workspaceEmailUrl(env.APP_BASE_URL, '/login')
      const tempPassword = generateToken().slice(0, 24) + '!aA1'
      const passwordHash = await hashPassword(tempPassword)
      const tenant = await getTenant(env.DB, session.tenantId)
      const tenantName = tenant ? tenant.name : 'Prime America'

      await env.DB
        .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?")
        .bind(passwordHash, targetId, session.tenantId)
        .run()

      let verificationToken: string | undefined
      if (!targetUser.email_verified) {
        verificationToken = generateToken()
        await storeToken(env.EMAIL_TOKENS_KV, 'verify', verificationToken, targetId, TOKEN_TTL.email_verify)
      }
      await sendManualUserWelcomeEmail(env.EMAIL, targetUser.email, targetUser.name, tempPassword, tenantName, env.APP_BASE_URL, verificationToken)

      return ok({ success: true, tempPassword })
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

    // GET /api/search — Command Palette search for all authenticated users.
    // This was accidentally nested inside the /api/hr/ block, making it unreachable
    // because /api/search does not start with /api/hr/. It is a general feature,
    // not an HR endpoint, and searches only tenant-scoped contacts, transactions,
    // and listings with standard getSession authentication.
    if (path === '/api/search' && method === 'GET') {
      const session = await getSession(request, env.JWT_SECRET, env.DB)
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
        const res = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`, {
          headers: {
            Authorization: `Bearer ${env.INTERNAL_API_SECRET}`,
            'X-User-Id': session.userId,
            'X-Tenant-Id': session.tenantId,
            'X-User-Role': session.role,
          },
        })
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

    if (path.startsWith('/api/operations')) return handleOperations(request, env)

    // ── Tenant Branding & Dashboard Settings — /api/tenant/* ─────────────────────────
  if (path.startsWith('/api/tenant/')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

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
        companyAddress?: string
        companyTelephone?: string
        companyFax?: string
        companyLicenseNumber?: string
        syncCompanyLicense?: boolean
        customWorkspaceDomain?: string
        leadAppDomain?: string
      }>()

      const existingTenant = await env.DB
        .prepare('SELECT company_license_number FROM tenants WHERE id = ?')
        .bind(session.tenantId)
        .first<{ company_license_number: string | null }>()

      const hasCompanyLicenseField = body.companyLicenseNumber !== undefined
      const normalizedCompanyLicense = hasCompanyLicenseField
        ? (body.companyLicenseNumber || '').trim().toUpperCase()
        : null

      const fields: string[] = [
        "name = COALESCE(?, name)",
        "primary_color = COALESCE(?, primary_color)",
        "accent_color = COALESCE(?, accent_color)",
        "tagline = ?",
        "website_url = ?",
        "logo_url = COALESCE(?, logo_url)",
        "company_address = ?",
        "company_telephone = ?",
        "company_fax = ?",
        "company_license_number = CASE WHEN ? = 1 THEN ? ELSE company_license_number END"
      ]
      const values: any[] = [
        body.companyName ?? null,
        body.primaryColor ?? null,
        body.accentColor ?? null,
        body.tagline ?? null,
        body.websiteUrl ?? null,
        body.logoUrl ?? null,
        body.companyAddress ?? null,
        body.companyTelephone ?? null,
        body.companyFax ?? null,
        hasCompanyLicenseField ? 1 : 0,
        normalizedCompanyLicense
      ]

      if (body.customWorkspaceDomain !== undefined) {
        fields.push("custom_workspace_domain = ?")
        values.push(body.customWorkspaceDomain || null)
      }
      if (body.leadAppDomain !== undefined) {
        fields.push("lead_app_domain = ?")
        values.push(body.leadAppDomain || null)
      }

      values.push(session.tenantId)

      await env.DB
        .prepare(`UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`)
        .bind(...values)
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

    // POST /api/tenant/sync-ny-license
    if (path === '/api/tenant/sync-ny-license' && method === 'POST') {
      if (!['admin', 'broker'].includes(session.role)) {
        return forbiddenError('Only admins or brokers can sync company license roster')
      }

      const tenant = await env.DB
        .prepare('SELECT company_license_number FROM tenants WHERE id = ?')
        .bind(session.tenantId)
        .first<{ company_license_number: string | null }>()

      const companyLicense = (tenant?.company_license_number || '').trim().toUpperCase()
      if (!companyLicense) {
        return err('Brokerage company license number is not configured in Tenant Branding settings', 400)
      }

      const licenseSync = await syncCompanyLicenseDataFromNY(env.DB, session.tenantId, companyLicense)

      return ok({ message: 'Roster synced successfully from NY DOS dataset', licenseSync })
    }

    return err('Tenant endpoint not found', 404)
  }

  // ── CRM proxy — /api/contacts/* ─────────────────────────────────────────────
  // Validates auth + permissions, injects context headers, proxies to re-crm service binding
  if (path.startsWith('/api/contacts') || path === '/api/contacts/stats') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

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
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

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
        const invRes = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings`, {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
            'X-User-Id': session.userId,
            'X-User-Role': session.role,
            'X-Tenant-Id': session.tenantId || '',
          },
        })

        if (!invRes.ok) {
          console.error(`Inventory stats: upstream returned ${invRes.status}`)
        } else {
          const contentType = invRes.headers.get('content-type') || ''
          if (!contentType.includes('application/json')) {
            const text = await invRes.text().catch(() => '')
            console.error(`Inventory stats: upstream returned non-JSON (${contentType}): ${text.slice(0, 200)}`)
          } else {
            const invData: any = await invRes.json().catch(() => null)
            if (!invData) {
              console.error('Inventory stats: failed to parse upstream JSON')
            } else {
              const listings = invData.listings || invData.data || invData || []
              // Dashboard "Active Listings" counts only records whose
              // normalized status is 'active'. The Inventory taxonomy defines
              // 'active' as the sole publicly visible, marketable state;
              // 'draft', 'hold', and 'pending' are non-display statuses.
              activeListingsCount = (Array.isArray(listings) ? listings : [])
                .map(normalizeInventoryListing)
                .filter((l: any) => l && l.status === 'active')
                .length
            }
          }
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
    }, { 'Cache-Control': 'no-store, private, max-age=0' })
  }

  // ── Open Houses Proxy — /api/openhouses ──────────────────────────────────
  if (path === '/api/openhouses' && method === 'GET') {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    if (!(await can(session.userId, session.role, 'marketing', 'read', env.DB))) {
      throw forbiddenError('No access to Open Houses')
    }
    const urls = [
      `${env.OPENHOUSE_WORKER_URL}/api/events/list`,
      'https://openhouse.primeamericarealestate.com/api/events/list',
    ]
    // Use service-to-service authentication via INTERNAL_API_SECRET
    const fetchHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
      'X-Tenant-Id': session.tenantId,
    }

    /** Normalize an event from the upstream open house service.
     *  - Exposes rsvp_token as a dedicated field (separate from public_token / sign-in token).
     *  - Normalizes status values so downstream filters work consistently.
     */
    function normalizeOpenHouseEvent(e: any): any {
      const statusRaw = (e.status || '').toLowerCase()
      // Map 'active' → 'scheduled' for uniform filtering in the frontend
      const status = statusRaw === 'active' ? 'scheduled' : statusRaw

      return {
        ...e,
        status,
        // rsvp_token is the RSVP-specific token; public_token is the sign-in portal token.
        // The upstream may expose rsvp_token, rsvp_url, or embed it in rsvp_link.
        rsvp_token: e.rsvp_token
          || e.rsvp_public_token
          || (e.rsvp_url ? e.rsvp_url.split('/').pop() : undefined)
          || undefined,
        // Ensure public_token is always the sign-in token
        public_token: e.public_token || e.token || e.event_token || '',
      }
    }

    for (const url of urls) {
      try {
        const res = await fetch(url, { headers: fetchHeaders })
        if (res.ok) {
          const data: any = await res.json()
          const events: any[] = (data.events || []).map(normalizeOpenHouseEvent)
          return ok(events)
        }
      } catch (e) {
        continue
      }
    }
    // All upstream services unavailable
    return err('Open House service is temporarily unavailable', 503)
  }


  // ── Transactions proxy — /api/transactions/* ─────────────────────────────────────────────
  if (path.startsWith('/api/transactions')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

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

    if (/^\/api\/transactions\/financial-(plans|accounts)(?:\/|$)/.test(path) && !(await can(session.userId, session.role, 'hr', action, env.DB))) throw forbiddenError('HR permission required for agent financial settings')

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
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

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
              const parsed = JSON.parse(settings.categories)
              parsedCats = Array.isArray(parsed) && parsed.length > 0 ? parsed : null
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
    const evidenceRead = method === 'GET' && /^\/api\/listings\/[^/]+\/business-evidence$/.test(path)
    if(evidenceRead && !['admin','broker'].includes(session.role)) return err('Broker verification required',403)
    const upstreamPath = evidenceRead ? targetUrl.pathname.replace(/\/business-evidence$/, '') : targetUrl.pathname
    const proxyUrl = `${env.INVENTORY_WORKER_URL}${upstreamPath}${targetUrl.search}`

    try {
      const licenseIdentity = await env.DB.prepare(
        'SELECT professional_license_id FROM users WHERE id = ? AND tenant_id = ?'
      ).bind(session.userId, session.tenantId).first<{ professional_license_id: string | null }>()
      // Use service-to-service authentication via INTERNAL_API_SECRET
      // Also forward the authenticated user's identity so listing-input can
      // apply role-based filtering and write-access enforcement.
      const proxyHeaders: Record<string, string> = {
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
        'Authorization': `Bearer ${env.INTERNAL_API_SECRET}`,
        'X-User-Id': session.userId,
        'X-User-Role': session.role,
        'X-Tenant-Id': session.tenantId || '',
        'X-User-Email': session.email || '',
        'X-User-Name': session.name || '',
        'X-User-License-Id': licenseIdentity?.professional_license_id || '',
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
        return err('Listing service is temporarily unavailable', 503)
      }

      const data = await response.json().catch(() => null)
      if (!data) {
        return err('Listing service returned invalid response', 502)
      }

      if(evidenceRead) {
        if(!response.ok) return err('Listing evidence unavailable',response.status)
        const listing = data.project || data
        if(!listing.updatedAt || !Array.isArray(listing.documents))return err('Listing evidence incomplete',502)
        return json({updatedAt:listing.updatedAt,documents:listing.documents.map((document:any)=>({id:document.id,originalFilename:document.originalFilename}))})
      }

      const agreementMatch = method === 'POST' && path.match(/^\/api\/listings\/([^/]+)\/business-events$/)
      if (agreementMatch && response.ok && data.event?.event_type === 'agreement_executed') {
        try {
          const operationsProject = await startOperationsAgreement(env, data.event,
            decodeURIComponent(agreementMatch[1]), session, proxyHeaders)
          return json({ ...data, operationsProject }, response.status)
        } catch (error) {
          console.error('Verified agreement project kickoff failed:', error)
          return json({ ...data, error: 'Agreement verified. Project kickoff failed; retry verification to finish without duplicating the event.' }, 503)
        }
      }

      // Normalize GET responses so the Workspace frontend receives
      // field names it expects (address, price, status, etc.)
      if (request.method === 'GET' || request.method === 'HEAD') {
        if (path === '/api/listings') {
          const listings = data.listings || data.data || data || []
          const normalized = Array.isArray(listings)
            ? listings.map(normalizeInventoryListing).filter(Boolean)
            : []
          return new Response(
            JSON.stringify({ listings: normalized.map(toWorkspaceListingDto).filter(Boolean) }),
            {
              status: response.status,
              headers: { 'Content-Type': 'application/json' },
            }
          )
        }
        const detailMatch = path.match(/^\/api\/listings\/([^/]+)$/)
        if (detailMatch) {
          const project = (data.project?.id ? data.project : null) || (data.id ? data : null) || data.project || data.data || data
          if (!project || (!project.id && !project.name && !project.address)) {
            return err('Listing not found', 404)
          }
          const dto = toWorkspaceListingDto(normalizeInventoryListing(project))
          return json(dto)
        }
      }

      // Non-GET / unhandled path – pass raw response through
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (proxyErr) {
      console.error('Listings proxy error:', proxyErr)
      return err('Failed to connect to listing service', 503)
    }
  }

  if (path.startsWith('/api/listing-inquiries') || path.startsWith('/api/inquiry-showings')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const action = method === 'GET' ? 'read' : 'write'
    if (!(await can(session.userId, session.role, 'crm', action, env.DB))) throw forbiddenError('No access to CRM')
    let principalId = session.userId
    if (session.role === 'assistant') {
      const assignment = await resolveAssistantAssignment(env.DB, session.userId, session.tenantId)
      if (!assignment?.canAccessContacts) throw forbiddenError('Assistant has no contacts scope')
      principalId = assignment.principalId
    }
    return handleListingInquiries(request, env.DB, { ...session, userId: principalId }, async (id) => {
      const response = await fetch(`${env.INVENTORY_WORKER_URL}/api/listings/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${env.INTERNAL_API_SECRET}`, 'X-Tenant-Id': session.tenantId,
          'X-User-Id': principalId, 'X-User-Role': session.role, 'X-User-Email': session.email || '' },
      })
      if (!response.ok) return null
      return response.json<{ id: string; name?: string; address?: string }>()
    })
  }

  // ── Showings — /api/showings/* ─────────────────────────────────────────────
  if (path.startsWith('/api/showings')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

    // GET /api/showings
    if (path === '/api/showings' && method === 'GET') {
      const listingId = url.searchParams.get('listingId') || url.searchParams.get('listing_id') || ''
      const agentId = url.searchParams.get('agentId') || url.searchParams.get('agent_id') || ''
      const dateFrom = url.searchParams.get('dateFrom') || url.searchParams.get('from') || ''
      const dateTo = url.searchParams.get('dateTo') || url.searchParams.get('to') || ''

      let query = `
        SELECT s.id, s.tenant_id, s.listing_id, s.inquiry_id, s.status, s.agent_id, s.buyer_name, s.shown_at, s.feedback, s.listing_address, s.created_at,
               u.name as agent_name, u.email as agent_email
        FROM showings s
        LEFT JOIN users u ON u.id = s.agent_id
        WHERE s.tenant_id = ?
      `
      const bindings: any[] = [session.tenantId]

      if (!['admin', 'broker'].includes(session.role)) {
        query += ' AND (s.agent_id = ? OR s.agent_id IS NULL)'
        bindings.push(session.userId)
      } else if (agentId) {
        query += ' AND s.agent_id = ?'
        bindings.push(agentId)
      }

      if (listingId) {
        query += ' AND s.listing_id = ?'
        bindings.push(listingId)
      }
      if (dateFrom) {
        query += ' AND s.shown_at >= ?'
        bindings.push(dateFrom)
      }
      if (dateTo) {
        query += ' AND s.shown_at <= ?'
        bindings.push(dateTo)
      }

      query += ' ORDER BY s.shown_at DESC'

      const rows = await env.DB.prepare(query).bind(...bindings).all()
      return ok(rows.results || [])
    }

    // POST /api/showings
    if (path === '/api/showings' && method === 'POST') {
      return err('Please refresh and use the contact-linked showing form.', 400)
    }

    // PUT /api/showings/:id
    const showingMatch = path.match(/^\/api\/showings\/([^/]+)$/)
    if (showingMatch && method === 'PUT') {
      const showingId = showingMatch[1]
      const body = await request.json<{
        buyerName?: string
        shownAt?: string
        feedback?: string
        listingAddress?: string
      }>()

      const existing = await env.DB.prepare('SELECT id, agent_id, inquiry_id FROM showings WHERE id = ? AND tenant_id = ?')
        .bind(showingId, session.tenantId)
        .first<{ id: string; agent_id: string; inquiry_id?: string }>()

      if (!existing) return err('Showing not found', 404)
      if (existing.inquiry_id) return err('Use the inquiry showing controls to update this appointment.', 400)
      if (!['admin', 'broker'].includes(session.role) && existing.agent_id !== session.userId) {
        throw forbiddenError('Cannot edit showing created by another agent')
      }

      const updates: string[] = []
      const bindings: any[] = []

      if (body.buyerName !== undefined) {
        updates.push('buyer_name = ?')
        bindings.push(body.buyerName.trim())
      }
      if (body.shownAt !== undefined) {
        updates.push('shown_at = ?')
        bindings.push(body.shownAt)
      }
      if (body.feedback !== undefined) {
        updates.push('feedback = ?')
        bindings.push(body.feedback.trim() || null)
      }
      if (body.listingAddress !== undefined) {
        updates.push('listing_address = ?')
        bindings.push(body.listingAddress.trim() || null)
      }

      if (updates.length > 0) {
        bindings.push(showingId, session.tenantId)
        await env.DB.prepare(`
          UPDATE showings SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?
        `).bind(...bindings).run()
      }

      return ok({ success: true })
    }

    // DELETE /api/showings/:id
    if (showingMatch && method === 'DELETE') {
      const showingId = showingMatch[1]
      const existing = await env.DB.prepare('SELECT id, agent_id, inquiry_id FROM showings WHERE id = ? AND tenant_id = ?')
        .bind(showingId, session.tenantId)
        .first<{ id: string; agent_id: string; inquiry_id?: string }>()

      if (!existing) return err('Showing not found', 404)
      if (existing.inquiry_id) return err('Use the inquiry showing controls to update this appointment.', 400)
      if (!['admin', 'broker'].includes(session.role) && existing.agent_id !== session.userId) {
        throw forbiddenError('Cannot delete showing created by another agent')
      }

      await env.DB.prepare('DELETE FROM showings WHERE id = ? AND tenant_id = ?')
        .bind(showingId, session.tenantId)
        .run()

      return ok({ success: true })
    }
  }

  // ── Documents (R2 Storage & Folders) — /api/documents/* ───────────────────
  if (path.startsWith('/api/documents')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'storage', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Documents`)
    }

    // Upload a document or create a folder (POST /api/documents or POST /api/documents/upload)
    if ((path === '/api/documents' || path === '/api/documents/upload') && request.method === 'POST') {
      const contentType = request.headers.get('content-type') || ''

      // 1. JSON Payload: Create Folder or metadata record
      if (contentType.includes('application/json')) {
        const body: any = await request.json()
        const { is_folder, entity_type, entity_id, file_name, parent_id } = body

        if (!entity_type || !entity_id || !file_name) {
          return err('Missing required fields (entity_type, entity_id, file_name)', 400)
        }

        const id = newId()
        try {
          await env.DB.prepare(`
            INSERT INTO documents (id, tenant_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, uploaded_by, is_folder, parent_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(id, session.tenantId, entity_type, entity_id, file_name, '', 'folder', 0, session.userId, is_folder ? 1 : 0, parent_id || null).run()
        } catch (e: any) {
          // If is_folder/parent_id columns not yet in schema, fallback to standard columns
          await env.DB.prepare(`
            INSERT INTO documents (id, tenant_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(id, session.tenantId, entity_type, entity_id, file_name, '', 'folder', 0, session.userId).run()
        }

        return ok({ id, file_name, is_folder: 1, parent_id })
      }

      // 2. Multipart Form: Upload File to R2
      const formData = await request.formData()
      const entity_type = formData.get('entity_type') as string
      const entity_id = formData.get('entity_id') as string
      const parent_id = formData.get('parent_id') as string | null
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

      try {
        await env.DB.prepare(`
          INSERT INTO documents (id, tenant_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, uploaded_by, is_folder, parent_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
        `).bind(id, session.tenantId, entity_type, entity_id, file.name, fileKey, file.type, file.size, session.userId, parent_id || null).run()
      } catch (e: any) {
        await env.DB.prepare(`
          INSERT INTO documents (id, tenant_id, entity_type, entity_id, file_name, file_key, content_type, size_bytes, uploaded_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, session.tenantId, entity_type, entity_id, file.name, fileKey, file.type, file.size, session.userId).run()
      }

      // Trigger notification
      await createNotification(
        env.DB,
        session.tenantId,
        `New document "${file.name}" uploaded to ${entity_type === 'transaction' ? 'deal' : entity_type} by ${session.role}`
      )

      return ok({ id, file_name: file.name, size: file.size, key: fileKey, file_key: fileKey })
    }

    // List documents for an entity (GET /api/documents)
    if (path === '/api/documents' && request.method === 'GET') {
      const urlParams = new URL(request.url).searchParams
      const entity_type = urlParams.get('entity_type')
      const entity_id = urlParams.get('entity_id')
      if (!entity_type || !entity_id) return err('Missing entity filters', 400)

      try {
        const { results } = await env.DB.prepare(`
          SELECT d.*, u.name as uploaded_by_name
          FROM documents d
          LEFT JOIN users u ON u.id = d.uploaded_by
          WHERE d.tenant_id = ? AND d.entity_type = ? AND d.entity_id = ?
          ORDER BY d.created_at DESC
        `).bind(session.tenantId, entity_type, entity_id).all()
        return ok(results || [])
      } catch (e) {
        const { results } = await env.DB.prepare(`
          SELECT d.*
          FROM documents d
          WHERE d.tenant_id = ? AND d.entity_type = ? AND d.entity_id = ?
          ORDER BY d.created_at DESC
        `).bind(session.tenantId, entity_type, entity_id).all()
        return ok(results || [])
      }
    }

    // Download document by query param key (GET /api/documents/download?key=...)
    if (path === '/api/documents/download' && request.method === 'GET') {
      const urlParams = new URL(request.url).searchParams
      const key = urlParams.get('key')
      if (!key) return err('Missing file key', 400)

      const document = await env.DB.prepare('SELECT id FROM documents WHERE file_key=? AND tenant_id=? AND COALESCE(is_folder,0)=0').bind(key,session.tenantId).first()
      if (!document) return err('Document not found',404)
      const object = await env.ASSETS_BUCKET.get(key)
      if (!object) return err('File not found in storage', 404)

      const fileName = key.split('/').pop() || 'document'
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set('Content-Disposition', `inline; filename="${fileName}"`)
      return new Response(object.body, { headers })
    }

    // Download document by ID (GET /api/documents/:id/download)
    const docMatch = path.match(/^\/api\/documents\/([^/]+)\/download$/)
    if (docMatch && request.method === 'GET') {
      const docId = docMatch[1]
      const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').bind(docId, session.tenantId).first<any>()
      if (!doc) return err('Not found', 404)

      const object = await env.ASSETS_BUCKET.get(doc.file_key as string)
      if (!object) return err('File not found in storage', 404)

      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set('etag', object.httpEtag)
      headers.set('Content-Disposition', `attachment; filename="${doc.file_name}"`)

      return new Response(object.body, { headers })
    }

    // Update document / folder (PUT /api/documents/:id) - Rename or Move
    const updateMatch = path.match(/^\/api\/documents\/([^/]+)$/)
    if (updateMatch && request.method === 'PUT') {
      const docId = updateMatch[1]
      const body: any = await request.json()

      const existing = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').bind(docId, session.tenantId).first<any>()
      if (!existing) return err('Document not found', 404)

      const nextFileName = body.file_name ?? existing.file_name
      const nextParentId = body.parent_id !== undefined ? body.parent_id : existing.parent_id

      try {
        await env.DB.prepare(`
          UPDATE documents
          SET file_name = ?, parent_id = ?
          WHERE id = ? AND tenant_id = ?
        `).bind(nextFileName, nextParentId, docId, session.tenantId).run()
      } catch (e) {
        await env.DB.prepare(`
          UPDATE documents
          SET file_name = ?
          WHERE id = ? AND tenant_id = ?
        `).bind(nextFileName, docId, session.tenantId).run()
      }

      return ok({ success: true, file_name: nextFileName, parent_id: nextParentId })
    }

    // Delete a document or folder (DELETE /api/documents/:id)
    const deleteMatch = path.match(/^\/api\/documents\/([^/]+)$/)
    if (deleteMatch && request.method === 'DELETE') {
      const docId = deleteMatch[1]
      const doc = await env.DB.prepare('SELECT * FROM documents WHERE id = ? AND tenant_id = ?').bind(docId, session.tenantId).first<any>()
      if (!doc) return err('Not found', 404)

      if (doc.file_key) {
        await env.ASSETS_BUCKET.delete(doc.file_key as string)
      }
      await env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(docId).run()
      return ok({ success: true })
    }

    return err('Documents endpoint not found', 404)
  }

  if (path.startsWith('/api/notifications')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const privileged = ['broker','admin'].includes(session.role) ? 1 : 0
    const scope = `n.tenant_id=? AND (n.user_id=? OR (n.user_id IS NULL AND ?=1))`
    if(path==='/api/notifications' && method==='GET') {
      const rows=await env.DB.prepare(`SELECT n.*,COALESCE(st.is_read,0) AS is_read FROM notifications n LEFT JOIN notification_states st ON st.notification_id=n.id AND st.tenant_id=n.tenant_id AND st.user_id=? WHERE ${scope} AND COALESCE(st.dismissed,0)=0 ORDER BY n.created_at DESC,n.id DESC LIMIT 100`).bind(session.userId,session.tenantId,session.userId,privileged).all()
      return ok(rows.results || [],{'Cache-Control':'no-store'})
    }
    const match=path.match(/^\/api\/notifications\/([^/]+)(\/read)?$/)
    if((path==='/api/notifications/read-all' && method==='POST') || (match && (method==='DELETE' || method==='POST' && match[2]))) {
      const all=path==='/api/notifications/read-all', dismissed=method==='DELETE'?1:0
      const sql=`INSERT INTO notification_states(tenant_id,notification_id,user_id,is_read,dismissed) SELECT n.tenant_id,n.id,?,1,? FROM notifications n WHERE ${scope} ${all?'':'AND n.id=?'} ON CONFLICT(tenant_id,notification_id,user_id) DO UPDATE SET is_read=1,dismissed=MAX(notification_states.dismissed,excluded.dismissed)`
      await env.DB.prepare(sql).bind(session.userId,dismissed,session.tenantId,session.userId,privileged,...(all?[]:[match![1]])).run()
      return ok({success:true})
    }
    return err('Not found',404)
  }

  // ── Network (Phase 5) — /api/network/* ──────────────────────────────────
  // ── Network (Phase 5) — /api/network/* ──────────────────────────────────
  if (path.startsWith('/api/network')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)

    const action = ['GET', 'HEAD'].includes(method) ? 'read' : (method === 'DELETE' ? 'delete' : 'write')
    if (!(await can(session.userId, session.role, 'network', action, env.DB))) {
      throw forbiddenError(`No ${action} access to Network`)
    }

    // Extract structured contact fields from a business-card image. The image is
    // processed transiently by the tenant's Workers AI binding and is not logged.
    if (path === '/api/network/business-card-ocr' && request.method === 'POST') {
      const contentLength = Number(request.headers.get('content-length') || 0)
      const maxBytes = 6 * 1024 * 1024
      if (contentLength > maxBytes + 64 * 1024) return err('Business card image must be 6 MB or smaller', 413)

      const formData = await request.formData()
      const file = formData.get('file')
      if (!(file instanceof File) || !file.type.startsWith('image/')) {
        return err('Upload a JPG, PNG, WEBP, or other supported image', 400)
      }
      if (file.size > maxBytes) return err('Business card image must be 6 MB or smaller', 413)

      const imageDataUrl = imageBytesToDataUrl(new Uint8Array(await file.arrayBuffer()), file.type)
      try {
        const result = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
          image: imageDataUrl,
          prompt: [
            'Read this business card carefully and return JSON only.',
            'Use exactly these string keys: name, title, company, email, phone, website, address.',
            'Use an empty string when a field is absent. Do not guess or invent values.',
          ].join(' '),
          max_tokens: 500,
          temperature: 0,
        })
        const fields = parseBusinessCardOcrResponse(result.response || '')
        if (!Object.values(fields).some(Boolean)) return err('No contact details were detected. Try a clearer photo.', 422)
        return ok(fields)
      } catch (error: any) {
        console.error(JSON.stringify({ event: 'network_business_card_ocr_failed', message: error?.message || String(error) }))
        return err('The card could not be read. Try a clearer, well-lit photo.', 502)
      }
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
      const binds = [session.userId, session.tenantId]
      if (!['admin', 'broker'].includes(session.role)) {
        queryStr += ' AND r.sender_id = ?'
        binds.push(session.userId)
      } else if (['admin', 'broker'].includes(session.role)) {
        const sender = url.searchParams.get('sender') || 'me'
        if (sender === 'me') {
          queryStr += ' AND r.sender_id = ?'
          binds.push(session.userId)
        } else if (sender !== 'all') {
          queryStr += ' AND r.sender_id = ?'
          binds.push(sender)
        }
      }
      queryStr += ' ORDER BY r.created_at DESC'
      const { results } = await env.DB.prepare(queryStr).bind(...binds).all()
      return ok(results)
    }

    // Create Referral
    if (path === '/api/network/referrals' && request.method === 'POST') {
      const body: any = await request.json()
      const referralType = body.referral_type === 'sell' ? 'sell' : 'buy'
      if (!body.crm_contact_id) return err('Select a CRM contact for this introduction', 400)

      let contactQuery = 'SELECT id, first_name, last_name, email, phone FROM contacts WHERE id = ? AND tenant_id = ? AND is_active = 1'
      const contactBinds = [body.crm_contact_id, session.tenantId]
      if (!['admin', 'broker'].includes(session.role)) {
        contactQuery += ' AND assigned_to = ?'
        contactBinds.push(session.userId)
      }
      const contact = await env.DB.prepare(contactQuery).bind(...contactBinds).first<any>()
      if (!contact) return err('CRM contact not found or unavailable', 404)
      const clientName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
      if (!clientName) return err('The selected CRM contact needs a name', 422)

      let connectionQuery = 'SELECT id FROM network_connections WHERE id = ? AND tenant_id = ?'
      const connectionBinds = [body.recipient_connection_id, session.tenantId]
      if (!['admin', 'broker'].includes(session.role)) {
        connectionQuery += ' AND (created_by = ? OR is_private = 0)'
        connectionBinds.push(session.userId)
      }
      const recipient = await env.DB.prepare(connectionQuery).bind(...connectionBinds).first()
      if (!recipient) return err('Network connection not found or unavailable', 404)

      const id = newId()
      await env.DB.prepare(`
        INSERT INTO network_referrals (id, tenant_id, sender_id, recipient_connection_id, crm_contact_id, client_name, client_email, client_phone, referral_type, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, session.tenantId, session.userId, body.recipient_connection_id, contact.id,
        clientName, contact.email || null, contact.phone || null,
        referralType, body.notes || null
      ).run()

      await createNotification(
        env.DB,
        session.tenantId,
        `New client introduction for "${clientName}" created by ${session.role}`
      )
      return ok({ id })
    }

    // Update Referral Status
    const statusMatch = path.match(/^\/api\/network\/referrals\/([^/]+)\/status$/)
    if (statusMatch && request.method === 'PUT') {
      const referralId = statusMatch[1]
      const { status, experience_rating, experience_notes } = await request.json<{ status: string; experience_rating?: number; experience_notes?: string }>()
      if (!['pending', 'accepted', 'completed', 'rejected'].includes(status)) {
        return err('Invalid introduction status', 400)
      }
      if (!['admin', 'broker'].includes(session.role)) {
        const owned = await env.DB.prepare('SELECT id FROM network_referrals WHERE id = ? AND tenant_id = ? AND sender_id = ?')
          .bind(referralId, session.tenantId, session.userId).first()
        if (!owned) throw forbiddenError('Only the sender or brokerage management can update this introduction')
      }
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

      let queryStr = `
        SELECT c.*, u.name AS owner_name,
          EXISTS (SELECT 1 FROM network_memberships m WHERE m.tenant_id = c.tenant_id AND m.connection_id = c.id AND m.user_id = ?) AS in_my_network
        FROM network_connections c
        LEFT JOIN users u ON u.id = c.created_by
        WHERE c.tenant_id = ?
      `
      const binds = [session.userId, session.tenantId]
      if (!['admin', 'broker'].includes(session.role)) {
        queryStr += ' AND (c.created_by = ? OR c.is_private = 0)'
        binds.push(session.userId)
      } else if (['admin', 'broker'].includes(session.role)) {
        const owner = url.searchParams.get('owner') || 'me'
        if (owner === 'me') {
          queryStr += ' AND c.created_by = ?'
          binds.push(session.userId)
        } else if (owner !== 'all') {
          queryStr += ' AND c.created_by = ?'
          binds.push(owner)
        }
      }
      queryStr += ' ORDER BY c.connected_at DESC'
      const { results } = await env.DB.prepare(queryStr).bind(...binds).all()
      return ok(results)
    }

    // Save the canonical contact without creating another connection.
    const networkActionMatch = path.match(/^\/api\/network\/([^/]+)\/(save|share)$/)
    if (networkActionMatch && method === 'POST') {
      const [, id, action] = networkActionMatch
      const manager = ['admin', 'broker'].includes(session.role)
      if (action === 'share' && !manager) throw forbiddenError('Only brokerage management can share this contact')
      const connection = await env.DB.prepare('SELECT id, created_by, is_private FROM network_connections WHERE id = ? AND tenant_id = ?')
        .bind(id, session.tenantId).first<any>()
      if (!connection || (!manager && connection.is_private && connection.created_by !== session.userId)) return err('Connection not found', 404)
      if (action === 'share') {
        await env.DB.prepare('UPDATE network_connections SET is_private = 0 WHERE id = ? AND tenant_id = ?').bind(id, session.tenantId).run()
      } else {
        await env.DB.prepare('INSERT OR IGNORE INTO network_memberships (tenant_id, user_id, connection_id) VALUES (?, ?, ?)')
          .bind(session.tenantId, session.userId, id).run()
      }
      return ok({ success: true })
    }

    // Create Connection
    if (path === '/api/network' && request.method === 'POST') {
      const body: any = await request.json()
      const connectionName = String(body.name || '').trim()
      if (!connectionName) return err('Connection name is required', 400)
      const id = newId()

      await env.DB.prepare(`
        INSERT INTO network_connections (id, tenant_id, created_by, name, title, company, email, phone, telephone, fax, website, poi, address, picture_url, type, notes, experience_rating, experience_notes, is_private, business_card_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, session.tenantId, session.userId, connectionName, body.title || null, body.company || null,
        body.email || null, body.phone || null, body.telephone || body.phone || null, body.fax || null,
        body.website || null, body.poi || null, body.address || null, body.picture_url || null,
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

      if (!['admin', 'broker'].includes(session.role)) {
        const owned = await env.DB.prepare('SELECT id FROM network_connections WHERE id = ? AND tenant_id = ? AND created_by = ?')
          .bind(id, session.tenantId, session.userId).first()
        if (!owned) throw forbiddenError('Only the connection owner or brokerage management can edit this card')
      }

      await env.DB.prepare(`
        UPDATE network_connections
        SET name = ?, title = ?, company = ?, email = ?, phone = ?, telephone = ?, fax = ?, website = ?, poi = ?, address = ?, picture_url = ?,
            type = ?, notes = ?, experience_rating = ?, experience_notes = ?, is_private = ?, business_card_key = ?
        WHERE id = ? AND tenant_id = ?
      `).bind(
        body.name, body.title || null, body.company || null, body.email || null, body.phone || null,
        body.telephone || body.phone || null, body.fax || null, body.website || null, body.poi || null, body.address || null, body.picture_url || null,
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

  // ── DIRECTOR.EXE — /api/director/* ────────────────────────────────────────
  if (path.startsWith('/api/director/')) {
    const session = await requireAuth(request, env.JWT_SECRET, env.DB)
    const response = await handleDirectorRequest(
      request,
      env as any,
      path,
      session,
    )
    if (response) return response
  }

  // ── 404 for unmatched /api/* ─────────────────────────────────────────────
  return err('Not found', 404)
}
