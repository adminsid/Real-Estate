/**
 * RE Workspace — Cloudflare Worker API
 *
 * This worker acts as the backend for the RE Workspace PWA.
 * All worker routes are prefixed with /api/*
 *
 * Bindings (configure in wrangler.toml or Cloudflare Dashboard):
 *   - WORKSPACE_KV:  KV Namespace  — session / user preferences storage
 *   - DB:            D1 Database   — relational data (contacts, listings, etc.)
 *   - ASSETS:        R2 Bucket     — file uploads, documents, images
 */

export interface Env {
  // Uncomment after creating bindings:
  // WORKSPACE_KV: KVNamespace
  // DB: D1Database
  // ASSETS: R2Bucket
  APP_NAME: string
  APP_ENV: string
}

// ── CORS helper ─────────────────────────────────────────────────────────────
function corsHeaders(origin: string): HeadersInit {
  const allowed = [
    'https://workspace.primeamericany.com',
    'https://primeamericany.com',
    'http://localhost:5173',
    'http://localhost:4173',
  ]
  const allow = allowed.includes(origin) ? origin : allowed[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

function json<T>(data: T, status = 200, origin = ''): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  })
}

// ── Router ──────────────────────────────────────────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') ?? ''

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const path = url.pathname

    // ── Health ──────────────────────────────────────────────────────
    if (path === '/api/health') {
      return json({ status: 'ok', app: env.APP_NAME, env: env.APP_ENV, ts: Date.now() }, 200, origin)
    }

    // ── Auth ────────────────────────────────────────────────────────
    if (path === '/api/auth/login' && request.method === 'POST') {
      return handleLogin(request, env, origin)
    }

    if (path === '/api/auth/signup' && request.method === 'POST') {
      return handleSignup(request, env, origin)
    }

    // ── Contacts / CRM ──────────────────────────────────────────────
    if (path === '/api/contacts' && request.method === 'GET') {
      return json({ data: [], total: 0, success: true }, 200, origin)
    }

    if (path === '/api/contacts' && request.method === 'POST') {
      const body = await request.json()
      return json({ data: body, success: true, message: 'Contact created' }, 201, origin)
    }

    // ── Listings ────────────────────────────────────────────────────
    if (path === '/api/listings' && request.method === 'GET') {
      return json({ data: [], total: 0, success: true }, 200, origin)
    }

    // ── Network ─────────────────────────────────────────────────────
    if (path === '/api/network' && request.method === 'GET') {
      return json({ data: [], total: 0, success: true }, 200, origin)
    }

    // ── Storage (R2) ────────────────────────────────────────────────
    if (path.startsWith('/api/storage/') && request.method === 'PUT') {
      // Example: PUT /api/storage/documents/contract.pdf
      // const key = path.replace('/api/storage/', '')
      // await env.ASSETS.put(key, request.body)
      return json({ success: true, message: 'File upload endpoint (R2 binding required)' }, 200, origin)
    }

    // ── 404 ─────────────────────────────────────────────────────────
    return json({ success: false, error: 'Not found' }, 404, origin)
  },
}

// ── Handlers ────────────────────────────────────────────────────────────────

async function handleLogin(request: Request, _env: Env, origin: string): Promise<Response> {
  try {
    const { email, password } = (await request.json()) as { email: string; password: string }

    if (!email || !password) {
      return json({ success: false, error: 'Email and password are required' }, 400, origin)
    }

    // TODO: Validate credentials against D1 database and compare hashed password.
    // This is a placeholder — replace with real auth logic using D1 + bcrypt or similar.
    return json(
      {
        success: true,
        data: {
          token: 'placeholder_jwt_token',
          user: { id: 'usr_placeholder', email, name: email.split('@')[0], role: 'salesperson' },
        },
      },
      200,
      origin,
    )
  } catch {
    return json({ success: false, error: 'Invalid request body' }, 400, origin)
  }
}

async function handleSignup(request: Request, _env: Env, origin: string): Promise<Response> {
  try {
    const body = (await request.json()) as {
      name: string
      email: string
      password: string
      role: string
      licenseNumber?: string
      companyName?: string
    }

    if (!body.name || !body.email || !body.password) {
      return json({ success: false, error: 'Name, email, and password are required' }, 400, origin)
    }

    if (body.password.length < 8) {
      return json({ success: false, error: 'Password must be at least 8 characters' }, 400, origin)
    }

    // TODO: Hash the password (e.g., using SHA-256 via Web Crypto API) and store in D1.
    return json(
      {
        success: true,
        data: {
          token: 'placeholder_jwt_token',
          user: {
            id: 'usr_' + crypto.randomUUID().slice(0, 8),
            email: body.email,
            name: body.name,
            role: body.role,
          },
        },
      },
      201,
      origin,
    )
  } catch {
    return json({ success: false, error: 'Invalid request body' }, 400, origin)
  }
}
