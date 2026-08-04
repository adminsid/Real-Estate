/**
 * RE Workspace — Cryptography Library
 * All operations use the Web Crypto API (native in Cloudflare Workers, no npm deps).
 */

// ── Password Hashing (PBKDF2-SHA256) ────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000
const SALT_BYTES = 16
const KEY_BYTES = 32

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const keyMaterial = await importPlain(plain)
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BYTES * 8,
  )
  return `${toHex(salt)}:${toHex(new Uint8Array(derived))}`
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const salt = fromHex(saltHex)
  const keyMaterial = await importPlain(plain)
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_BYTES * 8,
  )
  return toHex(new Uint8Array(derived)) === hashHex
}

async function importPlain(plain: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(plain), 'PBKDF2', false, [
    'deriveBits',
  ])
}

// ── JWT (HS256) ──────────────────────────────────────────────────────────────

export interface JWTPayload {
  userId: string
  tenantId: string
  role: string
  impersonatedBy?: string
  impersonationLogId?: string
  iat: number
  exp: number
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>, secret: string, expiresInSec = 604_800): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claims: JWTPayload = { ...payload, iat: now, exp: now + expiresInSec }
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(claims))
  const signingInput = `${header}.${body}`
  const key = await importSecret(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${toB64url(new Uint8Array(sig))}`
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, sigB64] = parts
    const key = await importSecret(secret)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromB64url(sigB64),
      new TextEncoder().encode(`${header}.${body}`),
    )
    if (!valid) return null
    const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as JWTPayload
    if (claims.exp < Math.floor(Date.now() / 1000)) return null
    return claims
  } catch {
    return null
  }
}

async function importSecret(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

// ── Token Generation ─────────────────────────────────────────────────────────

/** Generate a cryptographically secure hex token (for email verification, password reset, invites) */
export function generateToken(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** Generate a UUID v4 */
export function newId(): string {
  return crypto.randomUUID()
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return arr
}

function b64url(str: string): string {
  return toB64url(new TextEncoder().encode(str))
}

function toB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromB64url(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  return new Uint8Array([...bin].map((c) => c.charCodeAt(0)))
}
