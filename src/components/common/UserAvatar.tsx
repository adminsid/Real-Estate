import { useState } from 'react'
import { avatarUrl } from '@/lib/avatar'

interface UserAvatarProps {
  name?: string
  src?: string | null
  className?: string
  shape?: 'circle' | 'square'
}

export function UserAvatar({ name, src, className = 'h-8 w-8', shape = 'circle' }: UserAvatarProps) {
  const url = avatarUrl(src)
  const [failed, setFailed] = useState<string>()
  const initials = (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase() || '?'

  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-brand-navy text-brand-gold font-semibold ${shape === 'circle' ? 'rounded-full' : 'rounded-2xl'} ${className}`}>
      {url && failed !== url ? (
        <img src={url} alt={`${name || 'User'} profile photo`} className="h-full w-full object-cover" onError={() => setFailed(url)} />
      ) : (
        <span aria-label={name || 'User'}>{initials}</span>
      )}
    </span>
  )
}
