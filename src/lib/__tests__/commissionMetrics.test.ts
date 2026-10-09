import { describe, expect, it } from 'vitest'
import { commissionTotals } from '../commissionMetrics'

describe('commission reporting', () => {
  it('separates projected pipeline commission from earned closed GCI', () => {
    const totals = commissionTotals([
      { status: 'under_contract', commission_amount: 12_000 },
      { status: 'closed', commission_amount: 18_000 },
      { status: 'fallen_through', commission_amount: 9_000 },
    ])
    expect(totals).toEqual({ projected: 12_000, earned: 18_000 })
  })
})
