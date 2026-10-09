export type CommissionDeal = {
  status?: string
  financials_version?: number
  financials_state?: string
  my_compensation?: number | null
  price?: number | null
  commission_amount?: number | null
  commission_rate?: number | null
}

export function dealCommission(deal: CommissionDeal): number {
  if (deal.financials_version && deal.status === 'closed' && deal.financials_state !== 'approved') return 0
  if (deal.commission_amount !== null && deal.commission_amount !== undefined) return deal.commission_amount
  if (!deal.price) return 0
  const rate = deal.commission_rate ?? 0
  return deal.price * (rate / 100)
}

export function commissionTotals(deals: CommissionDeal[]) {
  return deals.reduce((totals, deal) => {
    const amount = dealCommission(deal)
    if (deal.status === 'closed') totals.earned += amount
    else if (!['lead', 'fallen_through', 'cancelled', 'archived'].includes(deal.status || '')) totals.projected += amount
    return totals
  }, { earned: 0, projected: 0 })
}
