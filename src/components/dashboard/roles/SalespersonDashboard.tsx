import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { TodayActions } from '@/components/layout/TodayActions'
import { SkeletonMetricGrid } from '@/components/common/SkeletonLoader'
import { AppTile } from '@/components/apps/AppTile'
import { WorkflowHabitEngine } from '@/components/dashboard/WorkflowHabitEngine'
import { NAV_CATEGORIES, isCategoryVisible } from '@/utils/constants'
import type { AppModule } from '@/types'
import type { UserRole } from '@/types'

export interface QuickLink {
  id: string
  label: string
  url: string
  icon: string
  visibility?: 'all' | UserRole | 'me'
  ownerUserId?: string
}

interface Stats {
  activeListings: number
  crmContacts: number
  transactions: number
  network: number
  commissionVolume: number
}

interface SalespersonDashboardProps {
  user: { id?: string; name?: string; role: string } | null | undefined
  stats: { company: Stats; agent: Stats }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcomingDeals: any[]
  isLoading: boolean
  can: (module: string, action: string) => boolean
  visibleQuickLinks: QuickLink[]
  allowedAppModules: AppModule[]
}

export function SalespersonDashboard({
  user,
  stats,
  upcomingDeals,
  isLoading,
  can,
  visibleQuickLinks,
  allowedAppModules,
}: SalespersonDashboardProps) {
  const agentStats = stats.agent || stats.company
  const s = agentStats

  const statCards = useMemo(
    () =>
      [
        { key: 'activeListings', icon: Icons.Home, label: 'Active Listings', value: s?.activeListings ?? 0, color: '#10B981', href: '/inventory' },
        { key: 'crmContacts', icon: Icons.Users, label: 'CRM Contacts', value: s?.crmContacts ?? 0, color: '#3B82F6', href: '/marketing/crm' },
        { key: 'transactions', icon: Icons.TrendingUp, label: 'Active Deals', value: s?.transactions ?? 0, color: '#8B5CF6', href: '/transactions/pipeline' },
        { key: 'network', icon: Icons.Star, label: 'Network', value: s?.network ?? 0, color: '#F59E0B', href: '/network' },
        { key: 'commissionVolume', icon: Icons.DollarSign, label: 'Est. Commission', value: s?.commissionVolume ?? 0, color: '#059669', href: '/transactions/pipeline' },
      ].filter((c) => {
        const moduleKey = c.key === 'activeListings' ? 'listings' : c.key === 'crmContacts' ? 'crm' : c.key
        return can(moduleKey, 'read')
      }),
    [s, can],
  )

  const visibleCategories = NAV_CATEGORIES.filter((cat) => isCategoryVisible(cat, user, can))
  const secondaryCategories = visibleCategories.slice(Math.min(visibleCategories.length, 2))

  return (
    <div>
      {/* ── Do Now: overdue/needs follow-up — highest priority ───────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.AlertCircle className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Do Now</h3>
        </div>
        <TodayActions />
      </section>

      {/* ── Upcoming Closings (primary focus) ───────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icons.Calendar className="h-5 w-5 text-blue-600" />
            <h3 className="text-base font-bold text-gray-800">Upcoming Closing Dates</h3>
          </div>
          <Link to="/transactions/pipeline" className="text-xs font-semibold text-blue-600 hover:underline">
            View All Deals →
          </Link>
        </div>
        {upcomingDeals.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm border border-dashed rounded-xl">
            No deals scheduled to close soon. Keep moving deals forward in your pipeline.
          </div>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {upcomingDeals.map((deal: any) => (
              <div key={deal.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-100/60 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs flex-shrink-0 uppercase">
                    {deal.type === 'sale' ? 'SALE' : 'LEASE'}
                  </div>
                  <div className="min-w-0">
                    <Link to={`/transactions/${deal.id}`} className="font-bold text-gray-900 text-sm truncate hover:underline block">
                      {deal.name}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {deal.price ? `$${Number(deal.price).toLocaleString()}` : 'Price TBD'} • Status: <span className="capitalize font-semibold text-gray-700">{deal.status.replace('_', ' ')}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full">
                    {deal.target_close_date ? `Close: ${deal.target_close_date}` : 'Target TBD'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Quick Actions (existing route visibility) ────────────────────── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {can('transactions', 'read') && (
          <Link to="/transactions/pipeline" className="group rounded-xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow p-4 transition-all flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-100 transition-colors">
              <Icons.LayoutDashboard className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900 group-hover:text-blue-700">Open Pipeline</p>
              <p className="text-[10px] text-gray-500">View deals in motion</p>
            </div>
          </Link>
        )}
        {can('crm', 'read') && (
          <Link to="/marketing/crm" className="group rounded-xl border border-gray-100 bg-white hover:border-purple-200 hover:shadow p-4 transition-all flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors">
              <Icons.Users className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900 group-hover:text-purple-700">Open CRM</p>
              <p className="text-[10px] text-gray-500">Manage leads & clients</p>
            </div>
          </Link>
        )}
        {can('listings', 'read') && (
          <Link to="/inventory" className="group rounded-xl border border-gray-100 bg-white hover:border-emerald-200 hover:shadow p-4 transition-all flex items-start gap-3">
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 transition-colors">
              <Icons.Home className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900 group-hover:text-emerald-700">Open Listings</p>
              <p className="text-[10px] text-gray-500">Browse inventory</p>
            </div>
          </Link>
        )}
      </section>

      {/* ── Health: key metrics (max 5) ───────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.Target className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Your Metrics</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {isLoading ? (
            <SkeletonMetricGrid count={5} />
          ) : (
            statCards.map((card) => {
              const CardIcon = card.icon
              return (
                <Link
                  key={card.key}
                  to={can(card.key === 'activeListings' ? 'listings' : card.key === 'crmContacts' ? 'crm' : card.key, 'read') ? card.href : '#'}
                  onClick={(e) => {
                    if (!can(card.key === 'activeListings' ? 'listings' : card.key === 'crmContacts' ? 'crm' : card.key, 'read')) e.preventDefault()
                  }}
                  className="group rounded-xl p-4 border bg-white hover:shadow transition-all text-center"
                >
                  <div className="flex items-center justify-center mb-2">
                    <CardIcon className="h-5 w-5 text-gray-600 group-hover:scale-105 transition-transform" style={{ color: card.color }} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{card.value.toString()}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{card.label}</p>
                </Link>
              )
            })
          )}
        </div>
      </section>

      {/* ── Workflow Habit Engine ───────────────────────────── */}
      <WorkflowHabitEngine activePipelineVolume={agentStats?.commissionVolume ?? 0} />

      {/* ── Tools: personal quick links (secondary) ─────────────────────── */}
      {visibleQuickLinks.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">My Quick Links</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
           {visibleQuickLinks.map((link) => (
            <Link
              key={link.id}
              to={link.url}
              className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all group"
            >
              {(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const Icon = (Icons as any)[link.icon] || Icons.Link
                return <Icon className="h-5 w-5 text-brand-navy flex-shrink-0" />
              })()}
              <span className="truncate text-sm text-gray-700 group-hover:text-gray-900">{link.label}</span>
            </Link>
          ))}
          </div>
        </section>
      )}

      {/* ── Tools: module shortcuts (visually secondary, below active work) ─ */}
      {secondaryCategories.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">Workspace Modules</h3>
          <div className="space-y-6">
            {secondaryCategories.map((cat) => {
              const modules = allowedAppModules.filter((m) => m.category === cat.id)
              if (modules.length === 0) return null
              return (
                <div key={cat.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-1.5 w-4 rounded-full" style={{ backgroundColor: cat.color }} />
                    <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">{cat.label}</h4>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {modules.map((mod) => (
                      <div key={mod.id} className="rounded-lg border border-gray-100 bg-gray-50/40">
                        <AppTile module={mod} size="sm" />
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
