import { LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  ctaLabel?: string
  onCTA?: () => void
  className?: string
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  ctaLabel, 
  onCTA,
  className 
}: EmptyStateProps) {
  return (
    <div 
      className={clsx('flex flex-col items-center justify-center p-8 space-y-4', className)}
      role="status"
      aria-live="polite"
    >
      <Icon className="h-16 w-16 text-gray-400" aria-hidden="true" />
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
      <p className="text-gray-500 text-center max-w-md">{description}</p>
      {ctaLabel && onCTA && (
        <button
          type="button"
          onClick={onCTA}
          className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  )
}