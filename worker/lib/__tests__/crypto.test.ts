/**
 * crypto.test.ts
 * Unit tests for worker/lib/crypto.ts
 *
 * Tests run in Node 20+ (vitest/node) which provides globalThis.crypto.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import {
  hashPassword,
  verifyPassword,
  signJWT,
  verifyJWT,
  generateToken,
  newId,
} from '../crypto'

// ── hashPassword / verifyPassword ────────────────────────────────────────────

describe('hashPassword', () => {
  it('produces a non-empty salt:hash string', async () => {
    const hash = await hashPassword('mySecret123')
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)
  })

  it('is non-deterministic — two hashes of the same password differ', async () => {
    const h1 = await hashPassword('samePassword')
    const h2 = await hashPassword('samePassword')
    expect(h1).not.toBe(h2)
  })
})

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple')
    expect(await verifyPassword('CorrectHorseBatteryStaple', hash)).toBe(true)
  })

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('returns false for malformed stored hash', async () => {
    expect(await verifyPassword('any', 'not-a-valid-hash')).toBe(false)
    expect(await verifyPassword('any', '')).toBe(false)
    expect(await verifyPassword('any', 'onlyonepart')).toBe(false)
  })

  it('is case-sensitive', async () => {
    const hash = await hashPassword('CaseSensitive')
    expect(await verifyPassword('casesensitive', hash)).toBe(false)
    expect(await verifyPassword('CASESENSITIVE', hash)).toBe(false)
  })
})

// ── signJWT / verifyJWT ──────────────────────────────────────────────────────

const TEST_SECRET = 'test-secret-that-is-at-least-32-chars-long!!'
const TEST_PAYLOAD = { userId: 'u-1', tenantId: 't-1', role: 'salesperson' }

describe('signJWT', () => {
  it('produces a three-part JWT string', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET)
    expect(token.split('.')).toHaveLength(3)
  })

  it('two tokens for the same payload differ (different iat)', async () => {
    const t1 = await signJWT(TEST_PAYLOAD, TEST_SECRET)
    await new Promise(r => setTimeout(r, 1100)) // wait >1 second so iat differs
    const t2 = await signJWT(TEST_PAYLOAD, TEST_SECRET)
    expect(t1).not.toBe(t2)
  })
})

describe('verifyJWT', () => {
  it('returns decoded payload for a valid token', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET)
    const result = await verifyJWT(token, TEST_SECRET)
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('u-1')
    expect(result!.tenantId).toBe('t-1')
    expect(result!.role).toBe('salesperson')
  })

  it('returns null for wrong secret', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET)
    expect(await verifyJWT(token, 'wrong-secret')).toBeNull()
  })

  it('returns null for expired token', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET, -1) // already expired
    expect(await verifyJWT(token, TEST_SECRET)).toBeNull()
  })

  it('returns null for malformed token', async () => {
    expect(await verifyJWT('not.a.jwt', TEST_SECRET)).toBeNull()
    expect(await verifyJWT('', TEST_SECRET)).toBeNull()
    expect(await verifyJWT('a.b', TEST_SECRET)).toBeNull()
  })
})

// ── generateToken / newId ────────────────────────────────────────────────────

describe('generateToken', () => {
  it('generates a 64-character hex string by default (32 bytes)', () => {
    const token = generateToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('respects the bytes parameter', () => {
    expect(generateToken(16)).toMatch(/^[0-9a-f]{32}$/)
    expect(generateToken(64)).toMatch(/^[0-9a-f]{128}$/)
  })

  it('produces unique values each call', () => {
    const tokens = Array.from({ length: 10 }, () => generateToken())
    const unique = new Set(tokens)
    expect(unique.size).toBe(10)
  })
})

describe('newId', () => {
  it('produces a valid UUID v4 format', () => {
    const id = newId()
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })
})
