import { describe, it, expect } from 'vitest'
import { brokerageToday, inPeriod, isDateOnly, reportingPeriod } from '../reporting-period'
describe('business reporting periods', () => {
  it('rejects missing, invalid and timestamp close dates instead of assigning a year', () => {
    for (const value of [null, '', '2026-02-30', 'invalid', '2026-01-01T00:00:00Z']) expect(isDateOnly(value)).toBe(false)
    expect(isDateOnly('2024-02-29')).toBe(true)
  })
  it('uses brokerage calendar boundaries even before UTC midnight rolls back locally', () => {
    expect(brokerageToday(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31')
    expect(inPeriod('2025-12-31', reportingPeriod('ytd', '2026-01-01'))).toBe(false)
    expect(inPeriod('2026-01-02', reportingPeriod('ytd', '2026-01-01'))).toBe(false)
  })
  it('defines rolling days inclusively and quarters as calendar quarters', () => {
    expect(reportingPeriod('last30', '2026-03-01').start).toBe('2026-01-31')
    expect(reportingPeriod('qtd', '2026-05-03').start).toBe('2026-04-01')
    expect(() => reportingPeriod('custom', '2026-01-01', { start: '2026-02-01', end: '2026-01-01' })).toThrow()
  })
})
