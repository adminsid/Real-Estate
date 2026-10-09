import { describe, expect, it } from 'vitest'
import { normalizeLifecycleStage, normalizeQualificationStatus } from '../domain'

describe('CRM domain vocabulary', () => {
  it('keeps lifecycle independent from qualification and follow-up timing', () => {
    expect(normalizeLifecycleStage('listing_inquiry')).toBe('inquiry')
    expect(normalizeLifecycleStage('qualified')).toBeNull()
    expect(normalizeQualificationStatus('converted')).toBe('qualified')
    expect(normalizeQualificationStatus('overdue')).toBe('engaged')
  })
})
