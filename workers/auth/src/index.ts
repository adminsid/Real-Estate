import { createAuth, type AuthEnv } from './lib/auth'

export interface Env extends AuthEnv {
  INTERNAL_API_SECRET: string
  WORKSPACE_URL: string
  COOKIE_DOMAIN: string
}

const ALLOWED_ORIGINS = new Set([
  'https://auth.primeamericarealestate.com',
  'https://app.primeamericarealestate.com',
  'https://workspace.primeamericany.com',
  'https://inventory.primeamericarealestate.com',
  'https://openhouse.primeamericarealestate.com',
  'https://inside.primeamericarealestate.com',
  'https://primeamericarealestate.com',
  'http://localhost:5173',
  'http://localhost:8787',
])

function isAllowedOrigin(origin?: string | null): origin is string {
  return Boolean(origin && ALLOWED_ORIGINS.has(origin))
}

function corsHeaders(origin?: string | null): Headers {
  const h = new Headers()
  if (isAllowedOrigin(origin)) {
    h.set('Access-Control-Allow-Origin', origin)
    h.set('Access-Control-Allow-Credentials', 'true')
  }

  h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, set-auth-token')
  h.set('Access-Control-Expose-Headers', 'Set-Cookie, set-auth-token')
  return h
}

function jsonResponse(data: unknown, status = 200, origin?: string | null): Response {
  const h = corsHeaders(origin)
  h.set('Content-Type', 'application/json')
  return new Response(JSON.stringify(data), { status, headers: h })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin')

    // Handle preflight
    if (request.method === 'OPTIONS') {
      if (!isAllowedOrigin(origin)) {
        return jsonResponse({ error: 'Origin not allowed' }, 403)
      }
      return new Response(null, { headers: corsHeaders(origin) })
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return jsonResponse({ status: 'ok', service: 'prime-america-auth', time: new Date().toISOString() }, 200, origin)
    }

    // ── Better-Auth Route Dispatch ───────────────────────────────────────────
    if (url.pathname.startsWith('/api/auth')) {
      if (!env.BETTER_AUTH_SECRET) {
        return jsonResponse({ error: 'Authentication service is not configured' }, 503, origin)
      }
      const auth = createAuth({
        DB: env.DB,
        BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: env.BETTER_AUTH_URL || url.origin,
        COOKIE_DOMAIN: env.COOKIE_DOMAIN,
        GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
      })
      const response = await auth.handler(request)
      const h = new Headers(response.headers)
      const cors = corsHeaders(origin)
      cors.forEach((val, key) => h.set(key, val))
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: h,
      })
    }

    // ── Backward-Compatible SSO Legacy Validation ────────────────────────────
    // GET or POST /api/sso/validate?token=...
    if (url.pathname === '/api/sso/validate') {
      const token = url.searchParams.get('token')
      const authHeader = request.headers.get('Authorization')
      const isInternal = authHeader === `Bearer ${env.INTERNAL_API_SECRET}`

      if (!env.INTERNAL_API_SECRET || !isInternal) {
        return jsonResponse({ error: 'Unauthorized' }, 401, origin)
      }

      if (!token) {
        return jsonResponse({ error: 'Missing token parameter' }, 400, origin)
      }

      // Check session or sso_token in DB
      try {
        const sessionRow = await env.DB.prepare(
          `SELECT s.id, s.userId, u.email, u.name, u.role, u.company
           FROM session s
           JOIN user u ON s.userId = u.id
           WHERE s.token = ? AND s.expiresAt > ?`
        ).bind(token, Date.now()).first()

        if (sessionRow) {
          return jsonResponse({
            valid: true,
            user: {
              id: sessionRow.userId,
              email: sessionRow.email,
              name: sessionRow.name,
              role: sessionRow.role || 'salesperson',
              company: sessionRow.company || 'Prime America Real Estate',
            }
          }, 200, origin)
        }

        return jsonResponse({ valid: false, error: 'Invalid or expired token' }, 401, origin)
      } catch (e: any) {
        return jsonResponse({ valid: false, error: e.message }, 500, origin)
      }
    }

    // Default fallback
    return jsonResponse({ error: 'Not Found' }, 404, origin)
  },
}
