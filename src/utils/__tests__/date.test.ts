import { describe, it, expect } from 'vitest'
import { getLocalDateString, formatDateDisplay, getDaysUntilDate } from '../date'

describe('Timezone-Safe Date Helpers', () => {
  it('formats local date accurately as YYYY-MM-DD', () => {
    const testDate = new Date(2026, 7, 27, 21, 30, 0) // Aug 27, 2026 9:30 PM local
    expect(getLocalDateString(testDate)).toBe('2026-08-27')
  })

  it('formats date display safely without UTC regression', () => {
    const formatted = formatDateDisplay('2026-08-27')
    expect(formatted).toContain('Aug 27, 2026')
  })

  it('handles null/undefined gracefully', () => {
    expect(formatDateDisplay(null)).toBe('')
    expect(formatDateDisplay(undefined)).toBe('')
  })

  it('calculates days until target date safely at any hour', () => {
    const todayStr = getLocalDateString()
    expect(getDaysUntilDate(todayStr)).toBe(0) // Closes today

    // Tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = getLocalDateString(tomorrow)
    expect(getDaysUntilDate(tomorrowStr)).toBe(1) // 1 day to close

    // Yesterday
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = getLocalDateString(yesterday)
    expect(getDaysUntilDate(yesterdayStr)).toBe(-1) // Overdue
  })
})
