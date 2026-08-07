// ── Pipeline Stage Definitions ──────────────────────────────────────────────
// Single source of truth for transaction statuses, labels, colors, and order.
// Every pipeline UI file should import from here instead of duplicating definitions.

export interface PipelineStage {
  /** API status value — matches TransactionStatus in src/types/index.ts */
  value: string
  /** Human-readable label for UI display */
  label: string
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
    label: 'Lead',
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
    dotClass: 'bg-gray-400',
    order: 0,
  },
  {
    value: 'active',
    label: 'Active',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    dotClass: 'bg-indigo-500',
    order: 1,
  },
  {
    value: 'offer_received',
    label: 'Offer Received',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
    dotClass: 'bg-purple-500',
    order: 2,
  },
  {
    value: 'under_contract',
    label: 'Under Contract',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
    dotClass: 'bg-amber-500',
    order: 3,
  },
  {
    value: 'closed',
    label: 'Closed',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dotClass: 'bg-emerald-500',
    order: 4,
  },
  {
    value: 'fallen_through',
    label: 'Fallen Through',
    badgeClass: 'bg-red-100 text-red-700 border-red-200',
    dotClass: 'bg-red-500',
    order: 5,
  },
]

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
  return (
    PIPELINE_STAGES.find(s => s.value === status) ?? {
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

/**
 * Sort comparator for pipeline stages by display order.
 * Use with Array.prototype.sort() to order statuses left-to-right.
 */
export function compareStageOrder(a: string, b: string): number {
  return getStageByStatus(a).order - getStageByStatus(b).order
}
