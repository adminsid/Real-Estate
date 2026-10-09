import { UserAvatar } from '@/components/common/UserAvatar'
import type { OperationsMember } from '@/domain/operations'
export function MemberIdentity({
  name,
  id,
  members = [],
  compact = false,
}: {
  name?: string
  id?: string
  members?: OperationsMember[]
  compact?: boolean
}) {
  const matches = members.filter((member) => member.name === name)
  const member = id
    ? members.find((member) => member.id === id)
    : matches.length === 1
      ? matches[0]
      : undefined
  const label = member?.name || name || 'Unassigned'
  return (
    <span className="ops-member" title={label}>
      <UserAvatar
        name={label}
        src={member?.avatarUrl}
        className={compact ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'}
      />
      {!compact && <span>{label}</span>}
    </span>
  )
}
