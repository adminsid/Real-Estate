/**
 * stageGate.ts
 * Pure stage-transition validation extracted from the transactions route handler.
 * Having it as a standalone function makes it unit-testable without a real DB.
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
 *
 * Rules:
 *  - under_contract  requires escrowDate + inspectionDeadline
 *  - closed          requires all 3 dates + all compliance tasks have docs/approval
 *  - any other status or no status change → always allowed
 */
export function validateStageTransition(
  targetStatus: string,
  fields: StageGateFields,
  complianceTasks: ComplianceTask[] = [],
): StageGateResult {
  const missing: string[] = []

  if (targetStatus === 'under_contract') {
    if (!fields.escrowDate) missing.push('Escrow Deposit Date')
    if (!fields.inspectionDeadline) missing.push('Inspection Contingency Deadline')
  } else if (targetStatus === 'closed') {
    if (!fields.escrowDate) missing.push('Escrow Deposit Date')
    if (!fields.inspectionDeadline) missing.push('Inspection Contingency Deadline')
    if (!fields.appraisalDate) missing.push('Appraisal Contingency Date')

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
      missing.push(`Required Documents missing for: ${missingDocs.join(', ')}`)
    }
    if (unapprovedTasks.length > 0) {
      missing.push(`Broker Approval required for: ${unapprovedTasks.join(', ')}`)
    }
  }

  return { allowed: missing.length === 0, missing }
}
