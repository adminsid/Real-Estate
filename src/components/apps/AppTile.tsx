import { ExternalLink, Lock } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import type { AppModule } from '@/types'
import { StatusBadge } from '@/components/common/Badge'
import * as Icons from 'lucide-react'

interface AppTileProps {
  module: AppModule
  size?: 'sm' | 'md' | 'lg'
}

export function AppTile({ module, size = 'md' }: AppTileProps) {
  const isLocked = module.status === 'coming_soon'
  const isExternal = !!module.externalUrl && module.status === 'active'

  // Dynamically resolve lucide icon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (Icons as Record<string, any>)[module.icon] as
    | React.ComponentType<{ className?: string }>
    | undefined

  const tileContent = (
    <div
      className={clsx(
        'group relative flex flex-col rounded-2xl bg-white shadow-card border border-gray-100',
        'transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5',
        isLocked && 'opacity-60 cursor-not-allowed',
        size === 'sm' && 'p-4',
        size === 'md' && 'p-5',
        size === 'lg' && 'p-6',
      )}
    >
      {/* Icon */}
      <div
        className="mb-3 rounded-xl p-3 w-fit"
        style={{ backgroundColor: module.color + '18' }}
      >
        {IconComponent ? (
          <IconComponent
            className="h-6 w-6"
            // @ts-expect-error inline style on svg
            style={{ color: module.color }}
          />
        ) : (
          <span className="h-6 w-6 block rounded bg-gray-200" />
        )}
      </div>

      {/* Name */}
      <h3 className="font-semibold text-gray-800 mb-1 leading-tight">{module.name}</h3>

      {/* Description */}
      {size !== 'sm' && (
        <p className="text-xs text-gray-500 leading-relaxed flex-1">{module.description}</p>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={module.status} />
        <div className="flex items-center gap-1">
          {isLocked && <Lock className="h-3.5 w-3.5 text-gray-400" />}
          {isExternal && <ExternalLink className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600" />}
        </div>
      </div>
    </div>
  )

  if (isLocked) return tileContent

  if (isExternal) {
    return (
      <a href={module.externalUrl} target="_blank" rel="noopener noreferrer">
        {tileContent}
      </a>
    )
  }

  return <Link to={module.path}>{tileContent}</Link>
}
