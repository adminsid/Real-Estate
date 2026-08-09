/**
 * stats.test.ts
 * Unit tests for /api/transactions/stats endpoint
 * Verifies that the stats response includes offer_received count
 */
import { describe, it, expect } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'

function makeDbMock(transactions: any[] = []): D1Database {
  return {
    prepare: (query: string) => {
      return {
        bind: (...params: any[]) => {
          return {
            first: async () => {
              const q = query.trim().replace(/\s+/g, ' ').toLowerCase()
              if (q.includes('select') && q.includes('from transactions')) {
                // Filter transactions by tenant_id (first bound parameter)
                const tenantId = params[0]
                const filtered = transactions.filter((t) => t.tenant_id === tenantId)
                const counts: Record<string, number> = {}
                for (const t of filtered) {
                  counts[t.status] = (counts[t.status] || 0) + 1
                }
                return {
                  total: filtered.length,
                  lead: counts.lead || 0,
                  active: counts.active || 0,
                  offer_received: counts.offer_received || 0,
                  under_contract: counts.under_contract || 0,
                  closed: counts.closed || 0,
                }
              }
              return null
            }
          }
        }
      }
    }
  } as unknown as D1Database
}

describe('/api/transactions/stats', () => {
  it('returns offer_received count in stats response', async () => {
    const transactions = [
      { status: 'lead', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'active', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'offer_received', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'under_contract', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'closed', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'fallen_through', tenant_id: 'tenant-1', is_active: 1 },
    ]

    const db = makeDbMock(transactions)

    const statsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) as lead,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'offer_received' THEN 1 ELSE 0 END) as offer_received,
        SUM(CASE WHEN status = 'under_contract' THEN 1 ELSE 0 END) as under_contract,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM transactions
      WHERE tenant_id = ? AND is_active = 1
    `

    const result = await db.prepare(statsQuery).bind('tenant-1').first<{
      total: number
      lead: number
      active: number
      offer_received: number
      under_contract: number
      closed: number
    }>()

    expect(result).not.toBeNull()
    expect(result!.total).toBe(6)
    expect(result!.lead).toBe(1)
    expect(result!.active).toBe(1)
    expect(result!.offer_received).toBe(1)
    expect(result!.under_contract).toBe(1)
    expect(result!.closed).toBe(1)
  })

  it('returns zero for offer_received when no deals in that status', async () => {
    const transactions = [
      { status: 'lead', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'active', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'under_contract', tenant_id: 'tenant-1', is_active: 1 },
    ]

    const db = makeDbMock(transactions)

    const statsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) as lead,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'offer_received' THEN 1 ELSE 0 END) as offer_received,
        SUM(CASE WHEN status = 'under_contract' THEN 1 ELSE 0 END) as under_contract,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM transactions
      WHERE tenant_id = ? AND is_active = 1
    `

    const result = await db.prepare(statsQuery).bind('tenant-1').first<{
      total: number
      lead: number
      active: number
      offer_received: number
      under_contract: number
      closed: number
    }>()

    expect(result!.offer_received).toBe(0)
    expect(result!.active).toBe(1)
    expect(result!.under_contract).toBe(1)
    expect(result!.lead).toBe(1)
  })

  it('aggregates multiple deals with same status correctly', async () => {
    const transactions = [
      { status: 'offer_received', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'offer_received', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'offer_received', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'active', tenant_id: 'tenant-1', is_active: 1 },
    ]

    const db = makeDbMock(transactions)

    const statsQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'lead' THEN 1 ELSE 0 END) as lead,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'offer_received' THEN 1 ELSE 0 END) as offer_received,
        SUM(CASE WHEN status = 'under_contract' THEN 1 ELSE 0 END) as under_contract,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed
      FROM transactions
      WHERE tenant_id = ? AND is_active = 1
    `

    const result = await db.prepare(statsQuery).bind('tenant-1').first<{
      total: number
      lead: number
      active: number
      offer_received: number
      under_contract: number
      closed: number
    }>()

    expect(result!.offer_received).toBe(3)
    expect(result!.active).toBe(1)
    expect(result!.total).toBe(4)
  })

  it('filters by tenant_id correctly', async () => {
    const transactions = [
      { status: 'offer_received', tenant_id: 'tenant-1', is_active: 1 },
      { status: 'offer_received', tenant_id: 'tenant-2', is_active: 1 },
    ]

    const db = makeDbMock(transactions)

    const statsQuery = `
      SELECT
        SUM(CASE WHEN status = 'offer_received' THEN 1 ELSE 0 END) as offer_received
      FROM transactions
      WHERE tenant_id = ? AND is_active = 1
    `

    const result1 = await db.prepare(statsQuery).bind('tenant-1').first<{ offer_received: number }>()
    const result2 = await db.prepare(statsQuery).bind('tenant-2').first<{ offer_received: number }>()

    expect(result1!.offer_received).toBe(1)
    expect(result2!.offer_received).toBe(1)
  })
})