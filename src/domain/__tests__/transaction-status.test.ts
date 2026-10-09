import { describe, expect, it } from 'vitest'
import {
  canTransitionTransaction,
  normalizeTransactionStatus,
  TRANSACTION_STATUSES,
} from '../transaction-status'

describe('transaction status contract', () => {
  it('normalizes the two historical aliases', () => {
    expect(normalizeTransactionStatus('active')).toBe('offer_received')
    expect(normalizeTransactionStatus('cancelled')).toBe('fallen_through')
  })

  it('rejects unknown statuses', () => {
    expect(normalizeTransactionStatus('archived')).toBeNull()
    expect(TRANSACTION_STATUSES).not.toContain('archived')
  })

  it('allows direct progressions and reopening across pipeline stages', () => {
    expect(canTransitionTransaction('lead', 'under_contract', 'salesperson')).toBe(true)
    expect(canTransitionTransaction('offer_received', 'contract_out', 'salesperson')).toBe(true)
    expect(canTransitionTransaction('closed', 'closing_prep', 'salesperson')).toBe(true)
    expect(canTransitionTransaction('closed', 'under_contract', 'salesperson')).toBe(true)
    expect(canTransitionTransaction('fallen_through', 'under_contract', 'salesperson')).toBe(true)
  })
})
