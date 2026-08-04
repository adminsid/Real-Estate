/**
 * RE Workspace — Auth Middleware
 * Handles JWT session cookies and impersonation.
 *
 * Cookie strategy for cross-app SSO:
 *   - SameSite=Lax (was Strict) — allows navigation redirects to carry the cookie
 *   - Domain=.primeamericarealestate.com — shared across *.primeamericarealestate.com subdomains
 *   - For workspace.primeamericany.com (different apex domain), the cookie is scoped
 *     to that domain only — cross-domain SSO uses the /api/sso/* redirect flow instead
 */

import { verifyJWT, signJWT, newId, type JWTPayload } from './crypto'
import { canImpersonate } from './permissions'
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'

export type { JWTPayload }

const COOKIE_NAME = 're_session'
export const SESSION_TTL = 60 * 60 * 24 * 7  // 7 days
const IMPERSONATION_TTL = 60 * 60 * 8         // 8 hours max

// ── Cookie Domain Detection ──────────────────────────────────────────────────

/**
 * Determine the appropriate cookie Domain attribute for a given hostname.
 *
 * For *.primeamericarealestate.com: set Domain=.primeamericarealestate.com
 *   so the session cookie is shared across all our subdomains on that apex.
 *
 * For workspace.primeamericany.com: no Domain attribute (scoped to exact hostname).
 *   Cross-domain SSO to primeamericarealestate.com apps uses the /api/sso/token flow.
 *
 * For localhost / workers.dev: no Domain attribute.
 */
export function cookieDomainForHost(hostname: string): string {
  const clean = (hostname || '').split(':')[0].toLowerCase()
  if (clean.endsWith('.primeamericarealestate.com') || clean === 'primeamericarealestate.com') {
    return '; Domain=.primeamericarealestate.com'
  }
  // workspace.primeamericany.com — scoped to that exact host, no Domain attribute
  // SSO across to primeamericarealestate.com apps goes via /api/sso token flow
  return ''
}

// ── Cookie Helpers ───────────────────────────────────────────────────────────

export function setSessionCookie(jwt: string, ttl = SESSION_TTL, hostname = ''): string {
  const domain = cookieDomainForHost(hostname)
  return `${COOKIE_NAME}=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/${domain}; Max-Age=${ttl}`
}

export function clearSessionCookie(hostname = ''): string {
  const domain = cookieDomainForHost(hostname)
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/${domain}; Max-Age=0`
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get('Cookie') ?? ''
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match ? decodeURIComponent(match[1]) : null
}

// ── Auth Middleware ──────────────────────────────────────────────────────────

export interface AuthSession {
  userId: string
  tenantId: string
  role: string
  impersonatedBy?: string
  impersonationLogId?: string
}

/** Extract and verify the session cookie. Returns null if invalid/missing. */
export async function getSession(request: Request, jwtSecret: string, db?: D1Database): Promise<AuthSession | null> {
  const token = getCookieValue(request, COOKIE_NAME)
  if (token) {
    const payload = await verifyJWT(token, jwtSecret)
    if (payload) {
      return {
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
        impersonatedBy: payload.impersonatedBy,
        impersonationLogId: payload.impersonationLogId,
      }
    }
  }

  return null
}

/** Require auth — returns session or throws 401 Response */
export async function requireAuth(request: Request, jwtSecret: string, db?: D1Database): Promise<AuthSession> {
  const session = await getSession(request, jwtSecret, db)
  if (!session) throw authError()
  return session
}

export function authError(): Response {
  return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function forbiddenError(msg = 'Forbidden'): Response {
  return new Response(JSON.stringify({ success: false, error: msg }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Impersonation ────────────────────────────────────────────────────────────

interface UserRow {
  id: string
  role: string
  name: string
  tenant_id: string
  is_active: number
}

/**
 * Start an impersonation session.
 * Admin/broker takes on the identity of a target user within the same tenant.
 */
export async function startImpersonation(
  session: AuthSession,
  targetUserId: string,
  reason: string | null,
  db: D1Database,
  jwtSecret: string,
  hostname = '',
): Promise<{ jwt: string; cookieHeader: string }> {
  // Fetch target user
  const target = await db
    .prepare('SELECT id, role, name, tenant_id, is_active FROM users WHERE id = ? AND tenant_id = ?')
    .bind(targetUserId, session.tenantId)
    .first<UserRow>()

  if (!target) throw forbiddenError('Target user not found in your tenant')
  if (!target.is_active) throw forbiddenError('Target user is deactivated')
  if (target.id === session.userId) throw forbiddenError('Cannot impersonate yourself')
  if (!canImpersonate(session.role, target.role)) {
    throw forbiddenError('Your role cannot impersonate this user')
  }
  // Prevent impersonating someone who is impersonating (no chains)
  if (session.impersonatedBy) throw forbiddenError('Cannot impersonate while already impersonating')

  // Log to audit table
  const logId = newId()
  await db
    .prepare(
      'INSERT INTO impersonation_audit_log (id, tenant_id, impersonator_id, target_user_id, reason) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(logId, session.tenantId, session.userId, targetUserId, reason)
    .run()

  const jwt = await signJWT(
    {
      userId: target.id,
      tenantId: target.tenant_id,
      role: target.role,
      impersonatedBy: session.userId,
      impersonationLogId: logId,
    },
    jwtSecret,
    IMPERSONATION_TTL,
  )

  return { jwt, cookieHeader: setSessionCookie(jwt, IMPERSONATION_TTL, hostname) }
}

/**
 * Stop an impersonation session — restores the original admin/broker session.
 */
export async function stopImpersonation(
  session: AuthSession,
  db: D1Database,
  jwtSecret: string,
  hostname = '',
): Promise<{ jwt: string; cookieHeader: string }> {
  if (!session.impersonatedBy || !session.impersonationLogId) {
    throw forbiddenError('No active impersonation session')
  }

  // Update audit log end time
  await db
    .prepare('UPDATE impersonation_audit_log SET ended_at = datetime(\'now\') WHERE id = ?')
    .bind(session.impersonationLogId)
    .run()

  // Restore original user
  const original = await db
    .prepare('SELECT id, role, tenant_id FROM users WHERE id = ?')
    .bind(session.impersonatedBy)
    .first<{ id: string; role: string; tenant_id: string }>()

  if (!original) throw forbiddenError('Original user not found')

  const jwt = await signJWT(
    { userId: original.id, tenantId: original.tenant_id, role: original.role },
    jwtSecret,
  )

  return { jwt, cookieHeader: setSessionCookie(jwt, SESSION_TTL, hostname) }
}
