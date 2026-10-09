// ── Pipeline Stage Definitions ──────────────────────────────────────────────
// Single source of truth for transaction statuses, labels, colors, and order.
// NYC-Native Real Estate Transaction Pipeline

import { TRANSACTION_STATUSES } from '../domain/transaction-status'

export interface PipelineStage {
  /** API status value — matches TransactionStatus in src/types/index.ts */
  value: string
  /** Human-readable label for UI display */
  label: string
  /** Short label for compact cards & badges */
  shortLabel?: string
  /** Tailwind classes for status badge (pill) rendering */
  badgeClass: string
  /** Tailwind classes for kanban column dot color */
  dotClass: string
  /** Display order in the pipeline (left-to-right, ascending) */
  order: number
}

export const PIPELINE_STAGES: PipelineStage[] = [
  {
    value: 'lead',
    label: 'Lead / Showing',
    shortLabel: 'Lead',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-400',
    order: 0,
  },
  {
    value: 'offer_received',
    label: 'Offer / Negotiation',
    shortLabel: 'Offer',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    dotClass: 'bg-blue-500',
    order: 1,
  },
  {
    value: 'contract_out',
    label: 'Deal Sheet & Contract Out',
    shortLabel: 'Contract Out',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
    order: 2,
  },
  {
    value: 'under_contract',
    label: 'In Contract (Executed)',
    shortLabel: 'In Contract',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    dotClass: 'bg-indigo-500',
    order: 3,
  },
  {
    value: 'board_package',
    label: 'Board Package / Loan',
    shortLabel: 'Board / Loan',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    dotClass: 'bg-purple-500',
    order: 4,
  },
  {
    value: 'closing_prep',
    label: 'Closing Prep',
    shortLabel: 'Closing Prep',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200',
    dotClass: 'bg-teal-500',
    order: 5,
  },
  {
    value: 'closed',
    label: 'Closed & Settled',
    shortLabel: 'Closed',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
    order: 6,
  },
  {
    value: 'fallen_through',
    label: 'Fallen Through',
    shortLabel: 'Lost',
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
    order: 7,
  },
]

if (PIPELINE_STAGES.some((stage, index) => stage.value !== TRANSACTION_STATUSES[index])) {
  throw new Error('Pipeline display metadata is out of sync with the transaction status contract')
}

/**
 * Pipeline stages visible as columns on the kanban board.
 * fallen_through is excluded — it appears only in the list view filter.
 */
export const KANBAN_STAGES = PIPELINE_STAGES.filter(s => s.value !== 'fallen_through')

/** Ordered status values for the status filter dropdown (includes all statuses). */
export const STATUS_FILTER_OPTIONS = PIPELINE_STAGES.map(s => ({ value: s.value, label: s.label }))

/** Ordered status values for the stage-change <select> (includes all statuses). */
export const STATUS_SELECT_OPTIONS = PIPELINE_STAGES.map(s => ({ value: s.value, label: s.label }))

/**
 * Lookup a pipeline stage by its API status value.
 * Returns a fallback object for unknown statuses so the UI never breaks.
 */
export function getStageByStatus(status: string): PipelineStage {
  // Legacy alias mappings
  let normalized = status
  if (status === 'active') normalized = 'offer_received'

  return (
    PIPELINE_STAGES.find(s => s.value === normalized) ?? {
      value: status,
      label: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
      dotClass: 'bg-gray-400',
      order: PIPELINE_STAGES.length,
    }
  )
}

/**
 * Get badge Tailwind classes for a given status.
 * Shorthand for components that only need the badge styling.
 */
export function getStatusBadgeClass(status: string): string {
  return getStageByStatus(status).badgeClass
}

/**
 * Get the kanban column dot color class for a given status.
 */
export function getStatusDotClass(status: string): string {
  return getStageByStatus(status).dotClass
}
