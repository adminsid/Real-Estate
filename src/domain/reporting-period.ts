// Calendar dates are business dates, never parsed as local-midnight instants.
export const BROKERAGE_TIMEZONE = 'America/New_York'
export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export function brokerageToday(now = new Date(), timezone = BROKERAGE_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export type PeriodKind = 'ytd' | 'qtd' | 'month' | 'last30' | 'last90' | 'previous_year' | 'custom' | 'all'
export type Period = { start: string | null; end: string | null; basis: 'actual_close_date'; timezone: string }
export function reportingPeriod(kind: PeriodKind, today = brokerageToday(), custom?: { start: string; end: string }): Period {
  if (!isDateOnly(today)) throw new Error('Invalid reporting date')
  const year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7))
  let start: string | null = null, end: string | null = today
  if (kind === 'ytd') start = `${year}-01-01`
  else if (kind === 'qtd') start = `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
  else if (kind === 'month') start = `${today.slice(0, 7)}-01`
  else if (kind === 'last30' || kind === 'last90') {
    const date = new Date(`${today}T12:00:00Z`)
    date.setUTCDate(date.getUTCDate() - (kind === 'last30' ? 29 : 89))
    start = date.toISOString().slice(0, 10)
  } else if (kind === 'previous_year') { start = `${year - 1}-01-01`; end = `${year - 1}-12-31` }
  else if (kind === 'custom') {
    if (!custom || !isDateOnly(custom.start) || !isDateOnly(custom.end) || custom.start > custom.end) throw new Error('Invalid custom period')
    start = custom.start; end = custom.end
  } else if (kind === 'all') end = null
  else throw new Error('Unknown reporting period')
  return { start, end, basis: 'actual_close_date', timezone: BROKERAGE_TIMEZONE }
}
export function inPeriod(date: unknown, period: Period): boolean {
  return isDateOnly(date) && (!period.start || date >= period.start) && (!period.end || date <= period.end)
}
