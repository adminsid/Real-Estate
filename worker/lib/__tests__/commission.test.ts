import { describe, expect, it } from 'vitest'
import { calculateAgentCommission, dollarsToCents, necFilingThresholdCents } from '../commission'

describe('commission accounting', () => {
  it('calculates a percentage payout after franchise fee and brokerage fee', () => {
    expect(calculateAgentCommission(1_000_000, {
      plan_type: 'percentage',
      agent_percent: 70,
      flat_payout_cents: null,
      brokerage_fee_cents: 25_000,
      franchise_fee_percent: 5,
      cap_cents: null,
    })).toEqual({
      grossCents: 1_000_000,
      franchiseFeeCents: 50_000,
      brokerageFeeCents: 25_000,
      agentEarnedCents: 640_000,
    })
  })

  it('supports flat payouts and an optional per-deal payout cap', () => {
    expect(calculateAgentCommission(3_000_000, {
      plan_type: 'flat_payout',
      agent_percent: null,
      flat_payout_cents: 500_000,
      brokerage_fee_cents: 25_000,
      franchise_fee_percent: 0,
      cap_cents: 400_000,
    }).agentEarnedCents).toBe(400_000)
  })

  it('uses payment-year thresholds and integer cents', () => {
    expect(dollarsToCents('123.456')).toBe(12_346)
    expect(necFilingThresholdCents(2025)).toBe(60_000)
    expect(necFilingThresholdCents(2026)).toBe(200_000)
  })
})
