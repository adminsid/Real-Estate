import type { D1Database } from '@cloudflare/workers-types'

export interface PlanLimits {
  maxUsers: number
  maxTransactions: number
  maxContacts: number
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  starter: {
    maxUsers: 5,
    maxTransactions: 10,
    maxContacts: 50
  },
  professional: {
    maxUsers: 25,
    maxTransactions: 100,
    maxContacts: 1000
  },
  enterprise: {
    maxUsers: 999999,
    maxTransactions: 999999,
    maxContacts: 999999
  }
}

export async function checkPlanLimit(
  db: D1Database,
  tenantId: string,
  resource: 'users' | 'transactions' | 'contacts'
): Promise<{ allowed: boolean; message?: string }> {
  // Get tenant's plan
  const tenant = await db
    .prepare('SELECT plan FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ plan: string }>()

  const plan = tenant?.plan || 'starter'
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter

  let count = 0
  if (resource === 'users') {
    const res = await db
      .prepare('SELECT COUNT(*) as total FROM users WHERE tenant_id = ?')
      .bind(tenantId)
      .first<{ total: number }>()
    count = res?.total || 0
    if (count >= limits.maxUsers) {
      return {
        allowed: false,
        message: `Plan Limit Exceeded: Your ${plan.toUpperCase()} plan is limited to ${limits.maxUsers} team members. Please upgrade to a higher tier plan.`
      }
    }
  } else if (resource === 'transactions') {
    const res = await db
      .prepare('SELECT COUNT(*) as total FROM transactions WHERE tenant_id = ? AND is_active = 1')
      .bind(tenantId)
      .first<{ total: number }>()
    count = res?.total || 0
    if (count >= limits.maxTransactions) {
      return {
        allowed: false,
        message: `Plan Limit Exceeded: Your ${plan.toUpperCase()} plan is limited to ${limits.maxTransactions} active transactions. Please upgrade to a higher tier plan.`
      }
    }
  } else if (resource === 'contacts') {
    const res = await db
      .prepare('SELECT COUNT(*) as total FROM contacts WHERE tenant_id = ?')
      .bind(tenantId)
      .first<{ total: number }>()
    count = res?.total || 0
    if (count >= limits.maxContacts) {
      return {
        allowed: false,
        message: `Plan Limit Exceeded: Your ${plan.toUpperCase()} plan is limited to ${limits.maxContacts} CRM contacts. Please upgrade to a higher tier plan.`
      }
    }
  }

  return { allowed: true }
}
