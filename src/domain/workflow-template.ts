import { TRANSACTION_STATUSES } from './transaction-status'
export const WORKFLOW_TEMPLATES = {
  legacy_v1: { label: 'Legacy workflow (v1)', phases: [...TRANSACTION_STATUSES] },
  sale_v1: { label: 'Sale (v1)', phases: [...TRANSACTION_STATUSES] },
  lease_v1: { label: 'Lease (v1)', phases: ['lead','offer_received','contract_out','under_contract','closing_prep','closed','fallen_through'] },
} as const
export type WorkflowKey = keyof typeof WORKFLOW_TEMPLATES
export function workflowPhases(key: string | undefined): readonly string[] {
  return key && key in WORKFLOW_TEMPLATES ? WORKFLOW_TEMPLATES[key as WorkflowKey].phases : WORKFLOW_TEMPLATES.legacy_v1.phases
}
export function transactionLifecycle(phase: string): 'open' | 'closed' | 'terminated' {
  if (phase === 'closed') return 'closed'
  return ['fallen_through','cancelled','archived'].includes(phase) ? 'terminated' : 'open'
}
