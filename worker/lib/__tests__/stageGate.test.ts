/**
 * stageGate.test.ts
 * Unit tests for stage transition validation logic.
 */
import { describe, it, expect } from 'vitest'
import { validateStageTransition, type ComplianceTask } from '../stageGate'

describe('validateStageTransition', () => {
  it('allows transition to active or lead stages without dates', () => {
    const result = validateStageTransition('active', {})
    expect(result.allowed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  describe('transition to under_contract', () => {
    it('blocks if escrowDate and inspectionDeadline are missing', () => {
      const result = validateStageTransition('under_contract', {})
      expect(result.allowed).toBe(false)
      expect(result.missing).toContain('Escrow Deposit Date')
      expect(result.missing).toContain('Inspection Contingency Deadline')
    })

    it('blocks if only escrowDate is missing', () => {
      const result = validateStageTransition('under_contract', {
        inspectionDeadline: '2026-08-10'
      })
      expect(result.allowed).toBe(false)
      expect(result.missing).toContain('Escrow Deposit Date')
      expect(result.missing).not.toContain('Inspection Contingency Deadline')
    })

    it('allows if both escrowDate and inspectionDeadline are present', () => {
      const result = validateStageTransition('under_contract', {
        escrowDate: '2026-08-05',
        inspectionDeadline: '2026-08-10'
      })
      expect(result.allowed).toBe(true)
      expect(result.missing).toHaveLength(0)
    })
  })

  describe('transition to closed', () => {
    it('blocks if milestone dates are missing', () => {
      const result = validateStageTransition('closed', {})
      expect(result.allowed).toBe(false)
      expect(result.missing).toContain('Escrow Deposit Date')
      expect(result.missing).toContain('Inspection Contingency Deadline')
      expect(result.missing).toContain('Appraisal Contingency Date')
    })

    it('blocks if compliance tasks are missing attachments', () => {
      const tasks: ComplianceTask[] = [
        {
          title: 'Signed Contract',
          attachment_required: 1,
          document_key: null,
          broker_approval_required: 0,
          broker_approval_status: null
        }
      ]
      const result = validateStageTransition('closed', {
        escrowDate: '2026-08-05',
        inspectionDeadline: '2026-08-10',
        appraisalDate: '2026-08-15'
      }, tasks)
      expect(result.allowed).toBe(false)
      expect(result.missing[0]).toContain('Required Documents missing for: Signed Contract')
    })

    it('blocks if broker approval is pending', () => {
      const tasks: ComplianceTask[] = [
        {
          title: 'Broker Sign-off',
          attachment_required: 0,
          document_key: null,
          broker_approval_required: 1,
          broker_approval_status: 'pending'
        }
      ]
      const result = validateStageTransition('closed', {
        escrowDate: '2026-08-05',
        inspectionDeadline: '2026-08-10',
        appraisalDate: '2026-08-15'
      }, tasks)
      expect(result.allowed).toBe(false)
      expect(result.missing[0]).toContain('Broker Approval required for: Broker Sign-off')
    })

    it('allows if all dates are present and compliance tasks are fully satisfied', () => {
      const tasks: ComplianceTask[] = [
        {
          title: 'Signed Contract',
          attachment_required: 1,
          document_key: 'doc_key_123',
          broker_approval_required: 1,
          broker_approval_status: 'approved'
        }
      ]
      const result = validateStageTransition('closed', {
        escrowDate: '2026-08-05',
        inspectionDeadline: '2026-08-10',
        appraisalDate: '2026-08-15'
      }, tasks)
      expect(result.allowed).toBe(true)
      expect(result.missing).toHaveLength(0)
    })
  })
})
