/**
 * Timezone-safe date helpers.
 *
 * The critical problem this solves:
 *   `new Date().toISOString().split('T')[0]` returns a UTC date string.
 *   In Eastern Time (EDT, UTC-4), anything after 8 PM local time is already
 *   past midnight in UTC, making `toISOString` return *tomorrow's* date.
 *
 *   These helpers always work in the browser's local calendar so dates are
 *   always correct regardless of what hour or timezone the user is in.
 */

/**
 * Returns today's date (or any given Date) as a local-timezone `YYYY-MM-DD` string.
 * Safe to use as the default value for `<input type="date">` and as a
 * comparison key against calendar cells.
 *
 * @example
 *   getLocalDateString()           // "2026-08-27" (always local today)
 *   getLocalDateString(new Date()) // "2026-08-27"
 */
export function getLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Safely formats a stored `YYYY-MM-DD` date string for display without
 * causing a UTC timezone regression.
 *
 * Background: `new Date("2026-08-27")` parses ISO date-only strings as UTC
 * midnight, which shifts the display date back 1 day in US timezones when
 * converted via `.toLocaleDateString()`. Appending `T00:00:00` (no Z) forces
 * local-time parsing instead.
 *
 * @returns Human-readable date string, e.g. "Aug 27, 2026"
 *          Returns empty string for null / undefined / empty input.
 */
export function formatDateDisplay(
  dateStr: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  if (!dateStr) return ''
  // Append local midnight so JS treats it as local time, not UTC
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', options)
}

/**
 * Calculates calendar days between today and a target date string (YYYY-MM-DD).
 * Compares local calendar days at midnight (00:00:00) so there is zero UTC offset error.
 *
 * @returns
 *   - `0` if target date is today ("Closes Today")
 *   - `> 0` if target date is in the future (e.g. `1` for tomorrow)
 *   - `< 0` if target date is in the past (overdue)
 *   - `null` if target date is missing or invalid
 */
export function getDaysUntilDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const cleanDate = dateStr.slice(0, 10)
  const parts = cleanDate.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null

  const [year, month, day] = parts
  const target = new Date(year, month - 1, day, 0, 0, 0, 0)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)

  const diffMs = target.getTime() - today.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}
