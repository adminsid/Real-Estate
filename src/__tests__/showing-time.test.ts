import { describe, expect, it } from 'vitest'
import { newYorkInstant } from '../components/marketing/ListingInquiriesPanel'
describe('showing times in New York', () => {
  it('uses New York summer and winter offsets', () => {
    expect(newYorkInstant('2026-09-08T10:00')).toBe('2026-09-08T14:00:00.000Z')
    expect(newYorkInstant('2027-01-08T10:00')).toBe('2027-01-08T15:00:00.000Z')
  })
  it('rejects nonexistent and ambiguous daylight saving times', () => {
    expect(() => newYorkInstant('2026-03-08T02:30')).toThrow('does not exist')
    expect(() => newYorkInstant('2026-11-01T01:30')).toThrow('occurs twice')
  })
})
