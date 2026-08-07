/**
 * RE Workspace — Canonical Role Contract
 * Single source of truth for user roles, hierarchy, and assertion helpers.
 */

export type UserRole = 'admin' | 'broker' | 'salesperson' | 'assistant' | 'vendor' | 'partner'

export const ROLE_HIERARCHY: readonly UserRole[] = [
  'partner',
  'vendor',
  'assistant',
  'salesperson',
  'broker',
  'admin',
] as const

/**
 * Check if a role meets or exceeds the minimum required role in the hierarchy.
 */
export function roleAtLeast(role: string, minimum: UserRole): boolean {
  const roleIdx = ROLE_HIERARCHY.indexOf(role as UserRole)
  const minIdx = ROLE_HIERARCHY.indexOf(minimum)
  if (roleIdx === -1) return false
  return roleIdx >= minIdx
}

/**
 * Assert that a role meets or exceeds the minimum required role, throwing if not.
 */
export function assertRole(role: string, minimum: UserRole): void {
  if (!roleAtLeast(role, minimum)) {
    throw new Error(`Insufficient privileges: role '${role}' does not meet minimum required role '${minimum}'`)
  }
}
