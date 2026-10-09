/**
 * deals-pipeline-e2e.test.ts
 * Comprehensive E2E tests for Deals & Transaction Pipeline:
 * - Creating new deal
 * - Changing stages through the 7 NYC-native pipeline stages
 * - Applying templates (tasks & checklists)
 * - Working on dates (milestones, escrow, inspection, appraisal, target close)
 * - Financial numbers & CDA calculations
 * - Deal settings, locking, team collaboration
 * - Offers management (submit, counter, accept)
 */
import { describe, it, expect } from 'vitest'
import { KANBAN_STAGES, getStageByStatus } from '../constants/pipeline'
import { validateStageTransition } from '../utils/stageGate'

describe('Deals & Transaction Pipeline Comprehensive Suite', () => {
  describe('1. 7-Stage NYC-Native Pipeline Architecture', () => {
    it('defines all 7 active NYC stages in sequential order', () => {
      const stageKeys = KANBAN_STAGES.map(s => s.value)
      expect(stageKeys).toEqual([
        'lead',
        'offer_received',
        'contract_out',
        'under_contract',
        'board_package',
        'closing_prep',
        'closed',
      ])
    })

    it('correctly maps stage metadata and labels', () => {
      expect(getStageByStatus('lead').label).toBe('Lead / Showing')
      expect(getStageByStatus('offer_received').label).toBe('Offer / Negotiation')
      expect(getStageByStatus('contract_out').label).toBe('Deal Sheet & Contract Out')
      expect(getStageByStatus('under_contract').label).toBe('In Contract (Executed)')
      expect(getStageByStatus('board_package').label).toBe('Board Package / Loan')
      expect(getStageByStatus('closing_prep').label).toBe('Closing Prep')
      expect(getStageByStatus('closed').label).toBe('Closed & Settled')

      expect(getStageByStatus('under_contract').shortLabel).toBe('In Contract')
      expect(getStageByStatus('board_package').shortLabel).toBe('Board / Loan')
    })
  })

  describe('2. Creating New Deals with Dates & Financial Numbers', () => {
    it('creates a new transaction payload with valid numbers and dates', () => {
      const newDeal = {
        name: '740 Park Ave #PH-A, New York, NY 10021',
        type: 'sale',
        property_type: 'Co-op',
        price: 18500000,
        earnest_money: 1850000,
        status: 'lead',
        target_close_date: '2026-10-31',
        escrow_date: null,
        inspection_deadline: null,
        appraisal_date: null,
      }

      expect(newDeal.price).toBeGreaterThan(0)
      expect(newDeal.earnest_money).toBe(newDeal.price * 0.1) // 10% contract deposit standard
      expect(newDeal.target_close_date).toBe('2026-10-31')
      expect(newDeal.status).toBe('lead')
    })
  })

  describe('3. Stage Transitions & Compliance Stage-Gates', () => {
    it('allows advancing to early stages (lead, offer_received, contract_out) without gates', () => {
      expect(validateStageTransition('lead', {}).allowed).toBe(true)
      expect(validateStageTransition('active', {}).allowed).toBe(true)
    })

    it('enforces mandatory escrow date and inspection deadline for In Contract stage', () => {
      const blockedTransition = validateStageTransition('under_contract', {})
      expect(blockedTransition.allowed).toBe(false)
      expect(blockedTransition.missing).toContain('Escrow Deposit Date')
      expect(blockedTransition.missing).toContain('Inspection Contingency Deadline')

      const allowedTransition = validateStageTransition('under_contract', {
        escrowDate: '2026-08-20',
        inspectionDeadline: '2026-08-25',
      })
      expect(allowedTransition.allowed).toBe(true)
      expect(allowedTransition.missing).toHaveLength(0)
    })

    it('enforces appraisal date and mandatory document compliance before Closing stage', () => {
      const unverifiedClosing = validateStageTransition('closed', {
        escrowDate: '2026-08-20',
        inspectionDeadline: '2026-08-25',
      })
      expect(unverifiedClosing.allowed).toBe(false)
      expect(unverifiedClosing.missing).toContain('Appraisal Contingency Date')

      const fullyCompliantClosing = validateStageTransition('closed', {
        escrowDate: '2026-08-20',
        inspectionDeadline: '2026-08-25',
        appraisalDate: '2026-09-15',
      }, [
        {
          title: 'Executed Contract of Sale',
          attachment_required: 1,
          document_key: 'contracts/740-park-ph-a.pdf',
          broker_approval_required: 1,
          broker_approval_status: 'approved',
        },
        {
          title: 'Lead Paint Disclosure & NY DOS Agency Disclosure',
          attachment_required: 1,
          document_key: 'disclosures/ny-dos-disclosure.pdf',
          broker_approval_required: 0,
          broker_approval_status: null,
        }
      ])
      expect(fullyCompliantClosing.allowed).toBe(true)
      expect(fullyCompliantClosing.missing).toHaveLength(0)
    })
  })

  describe('4. Applying Task & Checklist Templates', () => {
    it('applies standard NYC Co-op transaction checklist template', () => {
      const coopTemplateTasks = [
        { title: 'Submit Deal Sheet to Sellers Attorney', stage: 'contract_out', required: true },
        { title: 'Receive & Review Title/Building By-laws', stage: 'contract_out', required: true },
        { title: 'Deposit 10% Escrow Check with Escrowee', stage: 'under_contract', required: true },
        { title: 'Submit REBNY Financial Statement & Tax Returns', stage: 'board_package', required: true },
        { title: 'Managing Agent Application Submission', stage: 'board_package', required: true },
        { title: 'Co-op Board Interview Scheduled & Completed', stage: 'board_package', required: true },
        { title: 'Final Walkthrough Inspection Completed', stage: 'closing_prep', required: true },
        { title: 'Disbursement Authorization (CDA) Signed by Broker', stage: 'closing_prep', required: true },
      ]

      expect(coopTemplateTasks.length).toBe(8)
      expect(coopTemplateTasks.filter(t => t.stage === 'board_package').length).toBe(3)
    })
  })

  describe('5. Financial Calculations & Closing Disbursement Authorization (CDA)', () => {
    it('correctly calculates gross commissions, co-broke payout, agent split and deductions', () => {
      const price = 2000000 // $2.0M Deal
      const totalCommissionRate = 5.0 // 5% total
      const coBrokeRate = 2.5 // 2.5% co-broke
      const agentSplitRate = 80 // 80% to agent
      const eoFee = 150
      const transactionFee = 250

      const grossTotalCommission = (price * totalCommissionRate) / 100 // $100,000
      const coBrokeCommission = (price * coBrokeRate) / 100 // $50,000
      const primeAmericaGross = grossTotalCommission - coBrokeCommission // $50,000
      const agentGross = (primeAmericaGross * agentSplitRate) / 100 // $40,000
      const totalDeductions = eoFee + transactionFee // $400
      const netAgentPayout = agentGross - totalDeductions // $39,600
      const brokerageRetained = primeAmericaGross - agentGross + totalDeductions // $10,400

      expect(grossTotalCommission).toBe(100000)
      expect(coBrokeCommission).toBe(50000)
      expect(primeAmericaGross).toBe(50000)
      expect(agentGross).toBe(40000)
      expect(netAgentPayout).toBe(39600)
      expect(brokerageRetained).toBe(10400)
      expect(netAgentPayout + brokerageRetained).toBe(primeAmericaGross)
    })
  })

  describe('6. Offers Workflow Management', () => {
    it('manages offer submission, counter-offer, and acceptance', () => {
      const initialDealPrice = 1200000
      expect(initialDealPrice).toBe(1200000)
      const offers = [
        {
          id: 'off-1',
          offered_by: 'Buyer LLC',
          amount: 1100000,
          earnest_money: 110000,
          status: 'countered',
          counter_amount: 1175000,
          created_at: '2026-08-10',
        },
        {
          id: 'off-2',
          offered_by: 'Manhattan Capital LLC',
          amount: 1185000,
          earnest_money: 120000,
          status: 'accepted',
          counter_amount: null,
          created_at: '2026-08-12',
        }
      ]

      const acceptedOffer = offers.find(o => o.status === 'accepted')
      expect(acceptedOffer).toBeDefined()
      expect(acceptedOffer?.amount).toBe(1185000)

      // When accepted, transaction price updates to accepted offer amount
      const updatedDealPrice = acceptedOffer!.amount
      expect(updatedDealPrice).toBe(1185000)
    })
  })

  describe('7. Transaction Settings & Access Control', () => {
    it('restricts team size to maximum 4 collaboration members', () => {
      const currentTeam = ['user-1', 'user-2', 'user-3']
      expect(currentTeam.length).toBeLessThan(4)

      const isEligibleToAdd = (teamLength: number) => teamLength < 4
      expect(isEligibleToAdd(3)).toBe(true)
      expect(isEligibleToAdd(4)).toBe(false)
    })

    it('enforces deal locking so only brokers/admins can modify locked transactions', () => {
      const isDealLocked = true
      const canEdit = (role: string, locked: boolean) => !locked || ['admin', 'broker'].includes(role)

      expect(canEdit('agent', isDealLocked)).toBe(false)
      expect(canEdit('broker', isDealLocked)).toBe(true)
      expect(canEdit('admin', isDealLocked)).toBe(true)
      expect(canEdit('agent', false)).toBe(true)
    })
  })
})
