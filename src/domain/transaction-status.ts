export const TRANSACTION_STATUSES = [
  'lead',
  'offer_received',
  'contract_out',
  'under_contract',
  'board_package',
  'closing_prep',
  'closed',
  'fallen_through',
] as const

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

const LEGACY_STATUS_ALIASES: Record<string, TransactionStatus> = {
  active: 'offer_received',
  cancelled: 'fallen_through',
}

const ALLOWED_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  lead: TRANSACTION_STATUSES,
  offer_received: TRANSACTION_STATUSES,
  contract_out: TRANSACTION_STATUSES,
  under_contract: TRANSACTION_STATUSES,
  board_package: TRANSACTION_STATUSES,
  closing_prep: TRANSACTION_STATUSES,
  closed: TRANSACTION_STATUSES,
  fallen_through: TRANSACTION_STATUSES,
}

export function normalizeTransactionStatus(value: unknown): TransactionStatus | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized in LEGACY_STATUS_ALIASES) return LEGACY_STATUS_ALIASES[normalized]
  return TRANSACTION_STATUSES.includes(normalized as TransactionStatus)
    ? normalized as TransactionStatus
    : null
}

export function canTransitionTransaction(
  currentValue: unknown,
  nextValue: unknown,
  _role?: string,
): boolean {
  const current = normalizeTransactionStatus(currentValue)
  const next = normalizeTransactionStatus(nextValue)
  if (!current || !next) return false
  if (current === next) return true
  return ALLOWED_TRANSITIONS[current].includes(next)
}

export function transactionStageIndex(value: unknown): number {
  const normalized = normalizeTransactionStatus(value)
  return normalized ? TRANSACTION_STATUSES.indexOf(normalized) : -1
}
