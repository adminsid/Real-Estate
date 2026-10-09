import { inPeriod, isDateOnly, reportingPeriod, type PeriodKind } from '../../src/domain/reporting-period'
export interface ResultDeal { id: string; name: string; assigned_to: string | null; type: string; status: string;
  financials_version?: number; financials_state?: string; actual_close_date?: string | null; commission_amount?: number | null }
export function transactionResults(deals: ResultDeal[], params: URLSearchParams) {
  const period = reportingPeriod((params.get('period') || 'ytd') as PeriodKind, undefined,
    { start: params.get('start') || '', end: params.get('end') || '' })
  const closed = deals.filter(deal => deal.status === 'closed')
  const repair = closed.filter(deal => !isDateOnly(deal.actual_close_date)).map(deal => ({ id: deal.id, name: deal.name }))
  const rows = closed.filter(deal => inPeriod(deal.actual_close_date, period)).map(deal => ({
    id: deal.id, name: deal.name, agent: deal.assigned_to || 'Unassigned', type: deal.type,
    actualCloseDate: deal.actual_close_date!,
    grossCommissionCents: deal.financials_version && deal.financials_state !== 'approved' ? null : typeof deal.commission_amount === 'number' && Number.isFinite(deal.commission_amount)
      ? Math.round(deal.commission_amount * 100) : null,
  })).sort((a, b) => a.actualCloseDate.localeCompare(b.actualCloseDate) || a.id.localeCompare(b.id))
  return { period, rows, repair, count: rows.length,
    grossCommissionCents: rows.reduce((total, row) => total + (row.grossCommissionCents || 0), 0),
    missingCommissionCount: rows.filter(row => row.grossCommissionCents === null).length }
}
export function resultsCsv(report: ReturnType<typeof transactionResults>): string {
  const escape = (value: string | number | null) => `"${String(value ?? '').replace(/^[=+\-@\t\r]/, "'$&").replace(/"/g, '""')}"`
  return [['Deal ID','Name','Agent ID','Type','Actual close date','Gross commission cents'],
    ...report.rows.map(row => [row.id,row.name,row.agent,row.type,row.actualCloseDate,row.grossCommissionCents])]
    .map(row => row.map(escape).join(',')).join('\r\n')
}
