/**
 * stageGate.ts
 * Pure stage-transition validation logic for deals and transactions.
 */

export interface ComplianceTask {
  title: string
  attachment_required: 0 | 1
  document_key: string | null
  broker_approval_required: 0 | 1
  broker_approval_status: string | null
}

export interface StageGateFields {
  escrowDate?: string | null
  inspectionDeadline?: string | null
  appraisalDate?: string | null
}

export interface StageGateResult {
  /** true = transition is allowed */
  allowed: boolean
  /** list of human-readable missing items (empty when allowed=true) */
  missing: string[]
}

/**
 * Validates whether a stage transition is permitted.
 */
export function validateStageTransition(
  targetStatus: string,
  fields: StageGateFields,
  complianceTasks: ComplianceTask[] = [],
  workflowKey = 'legacy_v1',
): StageGateResult {
  const missing: string[] = []

  if (targetStatus === 'under_contract') {
    if (workflowKey !== 'lease_v1' && !fields.escrowDate) missing.push('Escrow Deposit Date')
    if (workflowKey !== 'lease_v1' && !fields.inspectionDeadline) missing.push('Inspection Contingency Deadline')
  } else if (targetStatus === 'closed') {
    if (workflowKey !== 'lease_v1' && !fields.escrowDate) missing.push('Escrow Deposit Date')
    if (workflowKey !== 'lease_v1' && !fields.inspectionDeadline) missing.push('Inspection Contingency Deadline')
    if (workflowKey !== 'lease_v1' && !fields.appraisalDate) missing.push('Appraisal Contingency Date')

    const missingDocs: string[] = []
    const unapprovedTasks: string[] = []

    for (const t of complianceTasks) {
      if (t.attachment_required === 1 && !t.document_key) {
        missingDocs.push(t.title)
      }
      if (t.broker_approval_required === 1 && t.broker_approval_status !== 'approved') {
        unapprovedTasks.push(t.title)
      }
    }

    if (missingDocs.length > 0) {
      missing.push(`Document required for: ${missingDocs.join(', ')}`)
    }
    if (unapprovedTasks.length > 0) {
      missing.push(`Broker approval required for: ${unapprovedTasks.join(', ')}`)
    }
  }

  return {
    allowed: missing.length === 0,
    missing,
  }
}
