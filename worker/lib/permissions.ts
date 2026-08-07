/**
 * RE Workspace — Permission System
 *
 * Two-layer model:
 *   1. Role defaults  — every role gets a base set of module:action grants
 *   2. DB overrides   — admin can grant/deny specific module:action per user
 *
 * Deny (granted=0) always wins over allow.
 */

import type { D1Database } from '@cloudflare/workers-types'

export type Module =
  | 'crm'
  | 'listings'
  | 'transactions'
  | 'network'
  | 'learning'
  | 'marketing'
  | 'storage'
  | 'reports'
  | 'hr'
  | 'settings.tenant'
  | 'settings.user'

export type Action = 'read' | 'write' | 'delete' | 'export'

// ── Role Default Permissions ─────────────────────────────────────────────────

type PermSet = Partial<Record<Module, Action[]>>

const ROLE_DEFAULTS: Record<string, PermSet | '*'> = {
  admin: '*',
  broker: {
    crm:              ['read', 'write', 'delete', 'export'],
    listings:         ['read', 'export'],
    transactions:     ['read', 'write', 'delete', 'export'],
    network:          ['read', 'write', 'delete'],
    learning:         ['read'],
    marketing:        ['read', 'write'],
    storage:          ['read', 'write', 'delete'],
    reports:          ['read', 'export'],
    hr:               ['read', 'write'],
    'settings.tenant': ['read', 'write'],
    'settings.user':  ['read', 'write'],
  },
  salesperson: {
    crm:              ['read', 'write'],
    listings:         ['read'],
    transactions:     ['read', 'write'],
    network:          ['read', 'write'],
    learning:         ['read'],
    marketing:        ['read'],
    storage:          ['read', 'write'],
    'settings.user':  ['read', 'write'],
  },
  assistant: {
    crm:              ['read'],
    listings:         ['read'],
    network:          ['read'],
    learning:         ['read'],
    'settings.user':  ['read', 'write'],
  },
  vendor: {
    network:          ['read'],
    'settings.user':  ['read', 'write'],
  },
  partner: {
    listings:         ['read'],
    network:          ['read'],
    'settings.user':  ['read', 'write'],
  },
}

// ── Effective Permission Resolver ────────────────────────────────────────────

export interface PermissionOverride {
  module: string
  action: string
  granted: number // 1=allow, 0=deny
}

/** Load effective permissions for a user (role defaults merged with DB overrides) */
export async function getEffectivePermissions(
  userId: string,
  role: string,
  db: D1Database,
): Promise<Map<string, boolean>> {
  const perms = new Map<string, boolean>()

  // Apply role defaults
  const defaults = ROLE_DEFAULTS[role]
  if (defaults === '*') {
    // Admin: wildcard — we return a special sentinel, check via can()
    perms.set('*', true)
    return perms
  }

  if (defaults) {
    for (const [mod, actions] of Object.entries(defaults)) {
      for (const action of actions as Action[]) {
        perms.set(`${mod}:${action}`, true)
      }
    }
  }

  // Apply DB overrides (explicit grants/denies override role defaults)
  const rows = await db
    .prepare('SELECT module, action, granted FROM user_permissions WHERE user_id = ?')
    .bind(userId)
    .all<PermissionOverride>()

  for (const row of rows.results) {
    perms.set(`${row.module}:${row.action}`, row.granted === 1)
  }

  return perms
}

/** Check if a user has a specific permission */
export async function can(
  userId: string,
  role: string,
  module: Module,
  action: Action,
  db: D1Database,
): Promise<boolean> {
  if (role === 'admin') return true
  const perms = await getEffectivePermissions(userId, role, db)
  if (perms.get('*') === true) return true
  // Explicit deny wins
  const explicit = perms.get(`${module}:${action}`)
  if (explicit === false) return false
  return explicit === true
}

import { type UserRole, ROLE_HIERARCHY, roleAtLeast, assertRole } from '../../src/types/roles'
export { type UserRole, ROLE_HIERARCHY, roleAtLeast, assertRole }



/** Check if impersonator role can impersonate target role */
export function canImpersonate(impersonatorRole: string, targetRole: string): boolean {
  if (impersonatorRole === 'admin') return true
  if (impersonatorRole === 'broker') {
    return ['salesperson', 'assistant', 'vendor', 'partner'].includes(targetRole)
  }
  return false
}

/** Serialize effective permissions for API response (for frontend) */
export async function serializePermissions(
  userId: string,
  role: string,
  db: D1Database,
): Promise<Record<string, boolean>> {
  if (role === 'admin') {
    // Return all possible permissions as true
    const all: Record<string, boolean> = {}
    const modules: Module[] = ['crm', 'listings', 'transactions', 'network', 'learning', 'marketing', 'storage', 'reports', 'hr', 'settings.tenant', 'settings.user']
    const actions: Action[] = ['read', 'write', 'delete', 'export']
    for (const m of modules) for (const a of actions) all[`${m}:${a}`] = true
    return all
  }
  const perms = await getEffectivePermissions(userId, role, db)
  return Object.fromEntries(perms)
}
