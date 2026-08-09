/**
 * Transaction Status Helpers
 * Single source of truth for transaction status predicates and metrics.
 */

import type { TransactionStatus } from '@/types'

/**
 * All valid transaction statuses in pipeline order.
 */
export const TRANSACTION_STATUSES: TransactionStatus[] = [
  'lead',
  'active',
  'offer_received',
  'under_contract',
  'closed',
  'fallen_through',
]

/**
 * Statuses that represent "open" pipeline deals (non-closed, non-fallen-through).
 * Used for "Active Transactions" / "Open Pipeline Deals" metric.
 */
export const OPEN_PIPELINE_STATUSES: TransactionStatus[] = [
  'lead',
  'active',
  'offer_received',
  'under_contract',
]

/**
 * Statuses that represent active pursuit (excluding lead).
 * Used for "Active Pursuits" goal metric.
 */
export const ACTIVE_PURSUIT_STATUSES: TransactionStatus[] = [
  'active',
  'offer_received',
  'under_contract',
]

/**
 * Closed/completed statuses.
 */
export const CLOSED_STATUSES: TransactionStatus[] = [
  'closed',
]

/**
 * Fallen through / lost statuses.
 */
export const FALLEN_THROUGH_STATUSES: TransactionStatus[] = [
  'fallen_through',
]

/**
 * All non-closed statuses (open pipeline).
 */
export const NON_CLOSED_STATUSES: TransactionStatus[] = [
  'lead',
  'active',
  'offer_received',
  'under_contract',
]

/**
 * Check if a transaction status represents an open pipeline deal.
 */
export function isOpenPipelineDeal(status: string): boolean {
  return OPEN_PIPELINE_STATUSES.includes(status as TransactionStatus)
}

/**
 * Check if a transaction status represents an active pursuit.
 */
export function isActivePursuit(status: string): boolean {
  return ACTIVE_PURSUIT_STATUSES.includes(status as TransactionStatus)
}

/**
 * Check if a transaction is closed.
 */
export function isClosed(status: string): boolean {
  return CLOSED_STATUSES.includes(status as TransactionStatus)
}

/**
 * Check if a transaction has fallen through.
 */
export function isFallenThrough(status: string): boolean {
  return FALLEN_THROUGH_STATUSES.includes(status as TransactionStatus)
}

/**
 * Get all statuses that should be counted as "Active Transactions" (open pipeline deals).
 */
export function getActiveTransactionStatuses(): TransactionStatus[] {
  return OPEN_PIPELINE_STATUSES
}

/**
 * Get all statuses that should be counted as "Active Pursuits" (active pursuit stage).
 */
export function getActivePursuitStatuses(): TransactionStatus[] {
  return ACTIVE_PURSUIT_STATUSES
}

/**
 * SQL fragment for filtering open pipeline deals.
 */
export function getOpenPipelineStatusSql(): string {
  return `'${OPEN_PIPELINE_STATUSES.join("','")}'`
}

/**
 * SQL fragment for filtering active pursuits.
 */
export function getActivePursuitStatusSql(): string {
  return `'${ACTIVE_PURSUIT_STATUSES.join("','")}'`
}