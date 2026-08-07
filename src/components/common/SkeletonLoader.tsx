/**
 * RE Workspace — Skeleton Loader Components
 *
 * Provides shimmer placeholder UI while data is loading.
 * All variants use a single CSS animation — no dependencies.
 */

const shimmer = `
  bg-gradient-to-r from-white/5 via-white/10 to-white/5
  bg-[length:400%_100%]
  animate-[shimmer_1.4s_ease-in-out_infinite]
`

// Register the animation globally once
if (typeof document !== 'undefined') {
  const id = 're-skeleton-style'
  if (!document.getElementById(id)) {
    const style = document.createElement('style')
    style.id = id
    style.textContent = `
      @keyframes shimmer {
        0%   { background-position: 100% 50%; }
        100% { background-position: 0%   50%; }
      }
    `
    document.head.appendChild(style)
  }
}

// ── Primitives ────────────────────────────────────────────────────────────────

interface BlockProps {
  className?: string
  width?: string
  height?: string
}

/** Single animated bar */
export function SkeletonBlock({ className = '', width = 'w-full', height = 'h-4' }: BlockProps) {
  return (
    <div
      className={`rounded-md ${width} ${height} ${shimmer} ${className}`}
      aria-hidden="true"
    />
  )
}

// ── Composites ────────────────────────────────────────────────────────────────

/** Table rows — for list/grid pages (Transactions, CRM, HR) */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-0 rounded-xl overflow-hidden border border-white/10" aria-busy="true" aria-label="Loading…">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-white/5 border-b border-white/10">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBlock key={i} width="flex-1" height="h-3" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 items-center px-4 py-4 border-b border-white/5">
          {/* Avatar circle */}
          <div className={`rounded-full w-8 h-8 shrink-0 ${shimmer}`} />
          {Array.from({ length: cols - 1 }).map((_, j) => (
            <SkeletonBlock key={j} width="flex-1" height="h-3" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Card with avatar + text lines — for detail pages / dashboards */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3" aria-busy="true" aria-label="Loading…">
      <div className="flex items-center gap-3">
        <div className={`rounded-full w-10 h-10 shrink-0 ${shimmer}`} />
        <div className="flex-1 space-y-2">
          <SkeletonBlock height="h-3" width="w-2/3" />
          <SkeletonBlock height="h-2" width="w-1/3" />
        </div>
      </div>
      <div className="space-y-2 pt-1">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonBlock key={i} height="h-2" width={i === lines - 1 ? 'w-3/4' : 'w-full'} />
        ))}
      </div>
    </div>
  )
}

/** Stacked list rows — for Network, activity feeds */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading…">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <div className={`rounded-full w-9 h-9 shrink-0 ${shimmer}`} />
          <div className="flex-1 space-y-2">
            <SkeletonBlock height="h-3" width="w-1/2" />
            <SkeletonBlock height="h-2" width="w-1/3" />
          </div>
          <SkeletonBlock height="h-6" width="w-16" />
        </div>
      ))}
    </div>
  )
}

/** Dashboard metric cards grid */
export function SkeletonMetricGrid({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-${count} gap-4`} aria-busy="true" aria-label="Loading…">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <SkeletonBlock height="h-3" width="w-1/2" />
          <SkeletonBlock height="h-8" width="w-2/3" />
          <SkeletonBlock height="h-2" width="w-1/3" />
        </div>
      ))}
    </div>
  )
}

/** Full page loading state — centered spinner + skeletons */
export function SkeletonPage({ type = 'table' }: { type?: 'table' | 'cards' | 'list' }) {
  return (
    <div className="flex-1 p-6 space-y-6 animate-pulse">
      {/* Toolbar row */}
      <div className="flex items-center justify-between">
        <SkeletonBlock height="h-8" width="w-48" />
        <SkeletonBlock height="h-9" width="w-28" />
      </div>
      {type === 'table' && <SkeletonTable rows={7} cols={5} />}
      {type === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {type === 'list' && <SkeletonList rows={8} />}
    </div>
  )
}
