import clsx from 'clsx'
import type { AppModule } from '@/types'

interface BadgeProps {
  status: AppModule['status']
  className?: string
}

const CONFIG: Record<AppModule['status'], { label: string; classes: string }> = {
  active: { label: 'Active', classes: 'bg-emerald-100 text-emerald-700' },
  under_construction: { label: 'In Progress', classes: 'bg-amber-100 text-amber-700' },
  external: { label: 'External', classes: 'bg-sky-100 text-sky-700' },
  coming_soon: { label: 'Coming Soon', classes: 'bg-purple-100 text-purple-700' },
}

export function StatusBadge({ status, className }: BadgeProps) {
  const cfg = CONFIG[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        cfg.classes,
        className,
      )}
    >
      {cfg.label}
    </span>
  )
}
