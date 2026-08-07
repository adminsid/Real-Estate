/**
 * planLimits.test.ts
 * Unit tests for worker/lib/planLimits.ts
 *
 * Uses a mocked D1Database.
 */
import { describe, it, expect } from 'vitest'
import { checkPlanLimit } from '../planLimits'
import type { D1Database } from '@cloudflare/workers-types'

function makeDbMock({
  plan = 'starter',
  userCount = 0,
  transactionCount = 0,
  contactCount = 0
}: {
  plan?: string
  userCount?: number
  transactionCount?: number
  contactCount?: number
} = {}): D1Database {
  return {
    prepare: (query: string) => {
      return {
        bind: (...params: any[]) => {
          return {
            first: async () => {
              const q = query.trim().replace(/\s+/g, ' ').toLowerCase()
              if (q.includes('select plan')) {
                return { plan }
              }
              if (q.includes('count(*) as total from users')) {
                return { total: userCount }
              }
              if (q.includes('count(*) as total from transactions')) {
                return { total: transactionCount }
              }
              if (q.includes('count(*) as total from contacts')) {
                return { total: contactCount }
              }
              return null
            }
          }
        }
      }
    }
  } as unknown as D1Database
}

describe('checkPlanLimit — Starter Plan Limits', () => {
  it('allows user invite if under limit', async () => {
    const db = makeDbMock({ plan: 'starter', userCount: 3 })
    const res = await checkPlanLimit(db, 'tenant-id', 'users')
    expect(res.allowed).toBe(true)
  })

  it('blocks user invite if at/over limit', async () => {
    const db = makeDbMock({ plan: 'starter', userCount: 5 })
    const res = await checkPlanLimit(db, 'tenant-id', 'users')
    expect(res.allowed).toBe(false)
    expect(res.message).toContain('limited to 5 team members')
  })

  it('allows transaction creation if under limit', async () => {
    const db = makeDbMock({ plan: 'starter', transactionCount: 9 })
    const res = await checkPlanLimit(db, 'tenant-id', 'transactions')
    expect(res.allowed).toBe(true)
  })

  it('blocks transaction creation if at/over limit', async () => {
    const db = makeDbMock({ plan: 'starter', transactionCount: 10 })
    const res = await checkPlanLimit(db, 'tenant-id', 'transactions')
    expect(res.allowed).toBe(false)
    expect(res.message).toContain('limited to 10 active transactions')
  })

  it('allows contact creation if under limit', async () => {
    const db = makeDbMock({ plan: 'starter', contactCount: 49 })
    const res = await checkPlanLimit(db, 'tenant-id', 'contacts')
    expect(res.allowed).toBe(true)
  })

  it('blocks contact creation if at/over limit', async () => {
    const db = makeDbMock({ plan: 'starter', contactCount: 50 })
    const res = await checkPlanLimit(db, 'tenant-id', 'contacts')
    expect(res.allowed).toBe(false)
    expect(res.message).toContain('limited to 50 CRM contacts')
  })
})

describe('checkPlanLimit — Professional Plan Limits', () => {
  it('allows user invite if under limit', async () => {
    const db = makeDbMock({ plan: 'professional', userCount: 20 })
    const res = await checkPlanLimit(db, 'tenant-id', 'users')
    expect(res.allowed).toBe(true)
  })

  it('blocks user invite if at/over limit', async () => {
    const db = makeDbMock({ plan: 'professional', userCount: 25 })
    const res = await checkPlanLimit(db, 'tenant-id', 'users')
    expect(res.allowed).toBe(false)
    expect(res.message).toContain('limited to 25 team members')
  })

  it('allows transaction creation if under limit', async () => {
    const db = makeDbMock({ plan: 'professional', transactionCount: 99 })
    const res = await checkPlanLimit(db, 'tenant-id', 'transactions')
    expect(res.allowed).toBe(true)
  })

  it('blocks transaction creation if at/over limit', async () => {
    const db = makeDbMock({ plan: 'professional', transactionCount: 100 })
    const res = await checkPlanLimit(db, 'tenant-id', 'transactions')
    expect(res.allowed).toBe(false)
    expect(res.message).toContain('limited to 100 active transactions')
  })

  it('allows contact creation if under limit', async () => {
    const db = makeDbMock({ plan: 'professional', contactCount: 999 })
    const res = await checkPlanLimit(db, 'tenant-id', 'contacts')
    expect(res.allowed).toBe(true)
  })

  it('blocks contact creation if at/over limit', async () => {
    const db = makeDbMock({ plan: 'professional', contactCount: 1000 })
    const res = await checkPlanLimit(db, 'tenant-id', 'contacts')
    expect(res.allowed).toBe(false)
    expect(res.message).toContain('limited to 1000 CRM contacts')
  })
})

describe('checkPlanLimit — Enterprise Plan Limits', () => {
  it('allows user invite even with high counts', async () => {
    const db = makeDbMock({ plan: 'enterprise', userCount: 9999 })
    const res = await checkPlanLimit(db, 'tenant-id', 'users')
    expect(res.allowed).toBe(true)
  })

  it('allows transaction creation even with high counts', async () => {
    const db = makeDbMock({ plan: 'enterprise', transactionCount: 9999 })
    const res = await checkPlanLimit(db, 'tenant-id', 'transactions')
    expect(res.allowed).toBe(true)
  })
})
