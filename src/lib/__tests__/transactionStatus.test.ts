/**
 * transactionStatus.test.ts
 * Unit tests for src/lib/transactionStatus.ts
 */
import { describe, it, expect } from 'vitest'
import {
  OPEN_PIPELINE_STATUSES,
  ACTIVE_PURSUIT_STATUSES,
  NON_CLOSED_STATUSES,
  CLOSED_STATUSES,
  FALLEN_THROUGH_STATUSES,
  TRANSACTION_STATUSES,
  isOpenPipelineDeal,
  isActivePursuit,
  isClosed,
  isFallenThrough,
  getOpenPipelineStatusSql,
  getActivePursuitStatusSql,
} from '../transactionStatus'

describe('Transaction Status Helpers', () => {
  describe('OPEN_PIPELINE_STATUSES', () => {
    it('includes lead', () => {
      expect(OPEN_PIPELINE_STATUSES).toContain('lead')
    })

    it('includes active', () => {
      expect(OPEN_PIPELINE_STATUSES).toContain('active')
    })

    it('includes offer_received', () => {
      expect(OPEN_PIPELINE_STATUSES).toContain('offer_received')
    })

    it('includes under_contract', () => {
      expect(OPEN_PIPELINE_STATUSES).toContain('under_contract')
    })

    it('excludes closed', () => {
      expect(OPEN_PIPELINE_STATUSES).not.toContain('closed')
    })

    it('excludes fallen_through', () => {
      expect(OPEN_PIPELINE_STATUSES).not.toContain('fallen_through')
    })
  })

  describe('ACTIVE_PURSUIT_STATUSES', () => {
    it('includes active', () => {
      expect(ACTIVE_PURSUIT_STATUSES).toContain('active')
    })

    it('includes offer_received', () => {
      expect(ACTIVE_PURSUIT_STATUSES).toContain('offer_received')
    })

    it('includes under_contract', () => {
      expect(ACTIVE_PURSUIT_STATUSES).toContain('under_contract')
    })

    it('excludes lead', () => {
      expect(ACTIVE_PURSUIT_STATUSES).not.toContain('lead')
    })

    it('excludes closed', () => {
      expect(ACTIVE_PURSUIT_STATUSES).not.toContain('closed')
    })

    it('excludes fallen_through', () => {
      expect(ACTIVE_PURSUIT_STATUSES).not.toContain('fallen_through')
    })
  })

  describe('NON_CLOSED_STATUSES', () => {
    it('includes lead, active, offer_received, under_contract', () => {
      expect(NON_CLOSED_STATUSES).toContain('lead')
      expect(NON_CLOSED_STATUSES).toContain('active')
      expect(NON_CLOSED_STATUSES).toContain('offer_received')
      expect(NON_CLOSED_STATUSES).toContain('under_contract')
    })

    it('excludes closed and fallen_through', () => {
      expect(NON_CLOSED_STATUSES).not.toContain('closed')
      expect(NON_CLOSED_STATUSES).not.toContain('fallen_through')
    })
  })

  describe('CLOSED_STATUSES', () => {
    it('includes closed', () => {
      expect(CLOSED_STATUSES).toContain('closed')
    })

    it('excludes all other statuses', () => {
      expect(CLOSED_STATUSES).not.toContain('lead')
      expect(CLOSED_STATUSES).not.toContain('active')
      expect(CLOSED_STATUSES).not.toContain('offer_received')
      expect(CLOSED_STATUSES).not.toContain('under_contract')
      expect(CLOSED_STATUSES).not.toContain('fallen_through')
    })
  })

  describe('FALLEN_THROUGH_STATUSES', () => {
    it('includes fallen_through', () => {
      expect(FALLEN_THROUGH_STATUSES).toContain('fallen_through')
    })

    it('excludes all other statuses', () => {
      expect(FALLEN_THROUGH_STATUSES).not.toContain('lead')
      expect(FALLEN_THROUGH_STATUSES).not.toContain('active')
      expect(FALLEN_THROUGH_STATUSES).not.toContain('offer_received')
      expect(FALLEN_THROUGH_STATUSES).not.toContain('under_contract')
      expect(FALLEN_THROUGH_STATUSES).not.toContain('closed')
    })
  })

  describe('TRANSACTION_STATUSES', () => {
    it('contains all valid statuses', () => {
      expect(TRANSACTION_STATUSES).toEqual([
        'lead',
        'active',
        'offer_received',
        'under_contract',
        'closed',
        'fallen_through',
      ])
    })
  })

  describe('isOpenPipelineDeal', () => {
    it('returns true for open pipeline statuses', () => {
      expect(isOpenPipelineDeal('lead')).toBe(true)
      expect(isOpenPipelineDeal('active')).toBe(true)
      expect(isOpenPipelineDeal('offer_received')).toBe(true)
      expect(isOpenPipelineDeal('under_contract')).toBe(true)
    })

    it('returns false for closed statuses', () => {
      expect(isOpenPipelineDeal('closed')).toBe(false)
      expect(isOpenPipelineDeal('fallen_through')).toBe(false)
    })

    it('returns false for unknown status', () => {
      expect(isOpenPipelineDeal('unknown')).toBe(false)
    })
  })

  describe('isActivePursuit', () => {
    it('returns true for active pursuit statuses', () => {
      expect(isActivePursuit('active')).toBe(true)
      expect(isActivePursuit('offer_received')).toBe(true)
      expect(isActivePursuit('under_contract')).toBe(true)
    })

    it('returns false for non-active-pursuit statuses', () => {
      expect(isActivePursuit('lead')).toBe(false)
      expect(isActivePursuit('closed')).toBe(false)
      expect(isActivePursuit('fallen_through')).toBe(false)
    })
  })

  describe('isClosed', () => {
    it('returns true for closed', () => {
      expect(isClosed('closed')).toBe(true)
    })

    it('returns false for all other statuses', () => {
      expect(isClosed('lead')).toBe(false)
      expect(isClosed('active')).toBe(false)
      expect(isClosed('offer_received')).toBe(false)
      expect(isClosed('under_contract')).toBe(false)
      expect(isClosed('fallen_through')).toBe(false)
    })
  })

  describe('isFallenThrough', () => {
    it('returns true for fallen_through', () => {
      expect(isFallenThrough('fallen_through')).toBe(true)
    })

    it('returns false for all other statuses', () => {
      expect(isFallenThrough('lead')).toBe(false)
      expect(isFallenThrough('active')).toBe(false)
      expect(isFallenThrough('offer_received')).toBe(false)
      expect(isFallenThrough('under_contract')).toBe(false)
      expect(isFallenThrough('closed')).toBe(false)
    })
  })

  describe('getOpenPipelineStatusSql', () => {
    it('returns properly formatted SQL IN clause', () => {
      const sql = getOpenPipelineStatusSql()
      expect(sql).toBe("'lead','active','offer_received','under_contract'")
    })
  })

  describe('getActivePursuitStatusSql', () => {
    it('returns properly formatted SQL IN clause', () => {
      const sql = getActivePursuitStatusSql()
      expect(sql).toBe("'active','offer_received','under_contract'")
    })
  })
})