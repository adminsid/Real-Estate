/**
 * RE Workspace — Tenant Resolution
 * Handles tenant creation, lookup, and hostname-aware resolution.
 *
 * Multi-tenant model:
 *   - Each hostname (custom domain or subdomain) maps to a tenant via tenant_hostnames
 *   - workspace.primeamericany.com → tenant_primeamerica (first tenant, primary)
 *   - Future white-label tenants can be added by inserting rows into tenant_hostnames
 *   - The canonical platform URL (re-workspace.lama-4db.workers.dev) also maps to the prime america tenant for internal use
 */

import { newId } from './crypto'
import type { D1Database } from '@cloudflare/workers-types'

/** Slugify a company name → URL-safe identifier */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export interface TenantRow {
  id: string
  name: string
  slug: string
  plan: string
  company_address?: string | null
  company_telephone?: string | null
  company_fax?: string | null
  logo_url?: string | null
  primary_color?: string | null
  accent_color?: string | null
  tagline?: string | null
  website_url?: string | null
  dashboard_settings?: string | null
  company_license_number?: string | null
  company_license_holder_name?: string | null
  company_license_type?: string | null
  company_license_expiration_date?: string | null
  company_license_synced_at?: string | null
  company_agents_json?: string | null
}

export interface TenantHostnameRow {
  id: string
  tenant_id: string
  hostname: string
  is_primary: number
  verified: number
}

/**
 * Resolve the tenant for an incoming request by reading the Host header.
 *
 * Priority:
 *   1. Look up the hostname in tenant_hostnames table
 *   2. Fall back to tenant_primeamerica for unknown/dev hostnames
 *
 * This makes hostnames data, not hardcoded assumptions.
 */
export async function resolveTenantForHostname(
  hostname: string,
  db: D1Database,
): Promise<TenantRow | null> {
  // Strip port if present (localhost:5173 → localhost)
  const cleanHost = hostname.split(':')[0]

  const row = await db
    .prepare(`
      SELECT t.* FROM tenants t
      JOIN tenant_hostnames th ON th.tenant_id = t.id
      WHERE th.hostname = ? AND th.verified = 1
      LIMIT 1
    `)
    .bind(cleanHost)
    .first<TenantRow>()

  if (row) return row

  // For localhost and workers.dev dev URLs, fall back to the prime america tenant
  if (cleanHost === 'localhost' || cleanHost.endsWith('.workers.dev')) {
    return db
      .prepare('SELECT * FROM tenants WHERE id = ?')
      .bind('tenant_primeamerica')
      .first<TenantRow>()
  }

  return null
}

/**
 * Get all registered tenant hostnames for a given tenant.
 */
export async function getTenantHostnames(
  db: D1Database,
  tenantId: string,
): Promise<TenantHostnameRow[]> {
  const result = await db
    .prepare('SELECT * FROM tenant_hostnames WHERE tenant_id = ? ORDER BY is_primary DESC')
    .bind(tenantId)
    .all<TenantHostnameRow>()
  return result.results
}

/**
 * Add a new hostname to a tenant (for future white-label customers).
 * This is how you onboard a new tenant's custom domain.
 */
export async function addTenantHostname(
  db: D1Database,
  tenantId: string,
  hostname: string,
  isPrimary = false,
): Promise<void> {
  const id = `hn_${newId().replace(/-/g, '').slice(0, 12)}`
  await db
    .prepare('INSERT INTO tenant_hostnames (id, tenant_id, hostname, is_primary) VALUES (?, ?, ?, ?)')
    .bind(id, tenantId, hostname.toLowerCase(), isPrimary ? 1 : 0)
    .run()
}

/** Resolve existing tenant by slug, or create a new one if it doesn't exist. */
export async function resolveOrCreateTenant(
  db: D1Database,
  companyName: string,
): Promise<{ tenantId: string; isNew: boolean }> {
  const slug = slugify(companyName)

  const existing = await db
    .prepare('SELECT id FROM tenants WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>()

  if (existing) {
    return { tenantId: existing.id, isNew: false }
  }

  const id = `tenant_${newId().replace(/-/g, '').slice(0, 12)}`
  await db
    .prepare('INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)')
    .bind(id, companyName, slug)
    .run()

  return { tenantId: id, isNew: true }
}

/** Get tenant by ID */
export async function getTenant(db: D1Database, tenantId: string): Promise<TenantRow | null> {
  return db.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId).first<TenantRow>()
}

/** Check if an email domain matches the prime-america tenant (for auto-join) */
export function isPrimeAmericaEmail(email: string): boolean {
  const lower = email.toLowerCase()
  return lower.endsWith('@primeamericarealestate.com') ||
         lower.endsWith('@primeamericany.com')
}

/**
 * Get the primary hostname for a tenant (used for email links, redirects).
 * Falls back to the workers.dev canonical URL if no primary hostname is set.
 */
export async function getPrimaryHostname(
  db: D1Database,
  tenantId: string,
  fallbackBaseUrl: string,
): Promise<string> {
  const row = await db
    .prepare('SELECT hostname FROM tenant_hostnames WHERE tenant_id = ? AND is_primary = 1 AND verified = 1 LIMIT 1')
    .bind(tenantId)
    .first<{ hostname: string }>()

  if (row) return `https://${row.hostname}`
  return fallbackBaseUrl
}
