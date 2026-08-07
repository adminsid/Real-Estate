/**
 * permissions.test.ts
 * Unit tests for worker/lib/permissions.ts
 *
 * Uses a minimal D1Database mock — no real database needed.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  getEffectivePermissions,
  can,
  canImpersonate,
  serializePermissions,
} from '../permissions'
import type { D1Database } from '@cloudflare/workers-types'

// ── D1 Mock ─────────────────────────────────────────────────────────────────
// Returns an empty permission_overrides table by default.
// Override per-test by passing a different mockRows array.

function makeDb(overrides: Array<{ module: string; action: string; granted: number }> = []): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: overrides }),
      }),
    }),
  } as unknown as D1Database
}

// ── Role Defaults ────────────────────────────────────────────────────────────

describe('getEffectivePermissions — admin', () => {
  it('returns wildcard sentinel for admin role', async () => {
    const perms = await getEffectivePermissions('u-admin', 'admin', makeDb())
    expect(perms.get('*')).toBe(true)
  })
})

describe('getEffectivePermissions — broker', () => {
  it('grants crm:read, crm:write, crm:delete, crm:export', async () => {
    const perms = await getEffectivePermissions('u-broker', 'broker', makeDb())
    expect(perms.get('crm:read')).toBe(true)
    expect(perms.get('crm:write')).toBe(true)
    expect(perms.get('crm:delete')).toBe(true)
    expect(perms.get('crm:export')).toBe(true)
  })

  it('does NOT grant crm:delete to salesperson', async () => {
    const perms = await getEffectivePermissions('u-sp', 'salesperson', makeDb())
    expect(perms.get('crm:delete')).toBeUndefined()
  })
})

describe('getEffectivePermissions — salesperson', () => {
  it('grants crm:read and crm:write', async () => {
    const perms = await getEffectivePermissions('u-sp', 'salesperson', makeDb())
    expect(perms.get('crm:read')).toBe(true)
    expect(perms.get('crm:write')).toBe(true)
  })

  it('does not grant reports:read or hr:read', async () => {
    const perms = await getEffectivePermissions('u-sp', 'salesperson', makeDb())
    expect(perms.get('reports:read')).toBeUndefined()
    expect(perms.get('hr:read')).toBeUndefined()
  })
})

describe('getEffectivePermissions — unknown role', () => {
  it('returns empty map for unknown role', async () => {
    const perms = await getEffectivePermissions('u-x', 'unknown_role', makeDb())
    expect(perms.size).toBe(0)
  })
})

// ── DB Overrides ─────────────────────────────────────────────────────────────

describe('getEffectivePermissions — DB overrides', () => {
  it('an explicit deny override beats the role default', async () => {
    // salesperson defaults have crm:read, but we deny it via DB override
    const db = makeDb([{ module: 'crm', action: 'read', granted: 0 }])
    const perms = await getEffectivePermissions('u-sp', 'salesperson', db)
    expect(perms.get('crm:read')).toBe(false)
  })

  it('an explicit allow override can grant beyond role default', async () => {
    // salesperson doesn't normally have reports:export
    const db = makeDb([{ module: 'reports', action: 'export', granted: 1 }])
    const perms = await getEffectivePermissions('u-sp', 'salesperson', db)
    expect(perms.get('reports:export')).toBe(true)
  })
})

// ── can() helper ─────────────────────────────────────────────────────────────

describe('can()', () => {
  it('always returns true for admin role', async () => {
    const db = makeDb()
    expect(await can('u-admin', 'admin', 'crm', 'delete', db)).toBe(true)
    expect(await can('u-admin', 'admin', 'reports', 'export', db)).toBe(true)
  })

  it('returns true for a permitted module:action', async () => {
    const db = makeDb()
    expect(await can('u-sp', 'salesperson', 'crm', 'read', db)).toBe(true)
  })

  it('returns false for an unpermitted module:action', async () => {
    const db = makeDb()
    expect(await can('u-sp', 'salesperson', 'hr', 'read', db)).toBe(false)
  })

  it('deny override wins over role default', async () => {
    const db = makeDb([{ module: 'crm', action: 'read', granted: 0 }])
    expect(await can('u-sp', 'salesperson', 'crm', 'read', db)).toBe(false)
  })
})

// ── canImpersonate() ─────────────────────────────────────────────────────────

describe('canImpersonate()', () => {
  it('admin can impersonate anyone', () => {
    expect(canImpersonate('admin', 'broker')).toBe(true)
    expect(canImpersonate('admin', 'salesperson')).toBe(true)
    expect(canImpersonate('admin', 'admin')).toBe(true)
  })

  it('broker can impersonate salesperson, assistant, vendor, partner', () => {
    expect(canImpersonate('broker', 'salesperson')).toBe(true)
    expect(canImpersonate('broker', 'assistant')).toBe(true)
    expect(canImpersonate('broker', 'vendor')).toBe(true)
    expect(canImpersonate('broker', 'partner')).toBe(true)
  })

  it('broker cannot impersonate broker or admin', () => {
    expect(canImpersonate('broker', 'broker')).toBe(false)
    expect(canImpersonate('broker', 'admin')).toBe(false)
  })

  it('salesperson cannot impersonate anyone', () => {
    expect(canImpersonate('salesperson', 'vendor')).toBe(false)
    expect(canImpersonate('salesperson', 'salesperson')).toBe(false)
  })
})

// ── serializePermissions() ───────────────────────────────────────────────────

describe('serializePermissions()', () => {
  it('returns all permissions as true for admin', async () => {
    const db = makeDb()
    const perms = await serializePermissions('u-admin', 'admin', db)
    // Spot-check several
    expect(perms['crm:read']).toBe(true)
    expect(perms['hr:delete']).toBe(true)
    expect(perms['settings.tenant:write']).toBe(true)
  })

  it('returns a plain object (not a Map)', async () => {
    const db = makeDb()
    const perms = await serializePermissions('u-sp', 'salesperson', db)
    expect(typeof perms).toBe('object')
    expect(perms).not.toBeInstanceOf(Map)
  })
})
