export const CONTACT_LIFECYCLE_STAGES = ['inquiry', 'lead', 'active_client', 'past_client'] as const
export const CONTACT_QUALIFICATION_STATUSES = [
  'unqualified', 'attempted_contact', 'engaged', 'qualified', 'disqualified',
] as const

export type ContactLifecycleStage = (typeof CONTACT_LIFECYCLE_STAGES)[number]
export type ContactQualificationStatus = (typeof CONTACT_QUALIFICATION_STATUSES)[number]

export function normalizeLifecycleStage(value: unknown): ContactLifecycleStage | null {
  if (value === 'listing_inquiry') return 'inquiry'
  return CONTACT_LIFECYCLE_STAGES.includes(value as ContactLifecycleStage)
    ? value as ContactLifecycleStage : null
}

export function normalizeQualificationStatus(value: unknown): ContactQualificationStatus | null {
  const aliases: Record<string, ContactQualificationStatus> = {
    new: 'unqualified', needs_follow_up: 'engaged', overdue: 'engaged', nurture: 'engaged',
    converted: 'qualified', closed_lost: 'disqualified',
  }
  if (typeof value !== 'string') return null
  return aliases[value] ?? (CONTACT_QUALIFICATION_STATUSES.includes(value as ContactQualificationStatus)
    ? value as ContactQualificationStatus : null)
}
