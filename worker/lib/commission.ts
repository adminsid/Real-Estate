export type CommissionPlanType = 'percentage' | 'flat_payout'

export interface CommissionPlanCalculation {
  plan_type: CommissionPlanType
  agent_percent: number | null
  flat_payout_cents: number | null
  brokerage_fee_cents: number
  franchise_fee_percent: number
  cap_cents: number | null
}

export interface CommissionCalculation {
  grossCents: number
  franchiseFeeCents: number
  brokerageFeeCents: number
  agentEarnedCents: number
}

export function dollarsToCents(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

export function calculateAgentCommission(
  grossCommissionCents: number,
  plan: CommissionPlanCalculation,
): CommissionCalculation {
  const grossCents = Math.max(0, Math.round(grossCommissionCents))
  const franchiseFeeCents = Math.round(grossCents * Math.max(0, plan.franchise_fee_percent) / 100)
  const afterFranchise = Math.max(0, grossCents - franchiseFeeCents)
  const basePayout = plan.plan_type === 'flat_payout'
    ? Math.max(0, plan.flat_payout_cents || 0)
    : Math.round(afterFranchise * Math.max(0, Math.min(100, plan.agent_percent || 0)) / 100)
  const brokerageFeeCents = Math.max(0, plan.brokerage_fee_cents || 0)
  const afterFees = Math.max(0, basePayout - brokerageFeeCents)
  const agentEarnedCents = plan.cap_cents === null
    ? afterFees
    : Math.min(afterFees, Math.max(0, plan.cap_cents))

  return { grossCents, franchiseFeeCents, brokerageFeeCents, agentEarnedCents }
}

export function necFilingThresholdCents(taxYear: number): number {
  return taxYear >= 2026 ? 200_000 : 60_000
}
