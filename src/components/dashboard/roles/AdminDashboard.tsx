import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { SkeletonMetricGrid } from '@/components/common/SkeletonLoader'
import type { QuickLink } from '@/types'

interface AdminDashboardProps {
  can: (module: string, action: string) => boolean
  visibleQuickLinks: QuickLink[]
  onEditQuickLinks?: () => void
  isPersonalized?: boolean
  stats?: {
    activeListings?: number
    activeTransactions?: number
    crmContacts?: number
    activeUsers?: number
  }
}

interface MetricState {
  value: number
  loading: boolean
  error: string | null
}

export function AdminDashboard({
  can,
  visibleQuickLinks = [],
  onEditQuickLinks,
  isPersonalized,
  stats: passedStats,
}: AdminDashboardProps) {
  // Independent Micro-Widget States
  const [metrics, setMetrics] = useState<Record<string, MetricState>>({
    activeUsers: { value: passedStats?.activeUsers ?? 0, loading: true, error: null },
    activeTransactions: { value: passedStats?.activeTransactions ?? 0, loading: true, error: null },
    activeListings: { value: passedStats?.activeListings ?? 0, loading: true, error: null },
    crmContacts: { value: passedStats?.crmContacts ?? 0, loading: true, error: null },
  })

  const [needsAttention, setNeedsAttention] = useState<{
    overdueFollowups: number
    closingSoon: number
    missingMilestones: number
  }>({
    overdueFollowups: 0,
    closingSoon: 0,
    missingMilestones: 0,
  })
  const [attentionLoading, setAttentionLoading] = useState(true)
  const [attentionSyncWarning, setAttentionSyncWarning] = useState<string | null>(null)

  // ── Individual Micro-Fetchers with isolated error handling ──────────────
  const fetchUsers = useCallback(async () => {
    setMetrics((prev) => ({ ...prev, activeUsers: { ...prev.activeUsers, loading: true, error: null } }))
    try {
      const res = await fetch('/api/hr/users?limit=1', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to load users')
      setMetrics((prev) => ({
        ...prev,
        activeUsers: { value: json.data?.total ?? 0, loading: false, error: null },
      }))
    } catch (e: any) {
      setMetrics((prev) => ({
        ...prev,
        activeUsers: { ...prev.activeUsers, loading: false, error: e.message || 'Offline' },
      }))
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    setMetrics((prev) => ({ ...prev, activeTransactions: { ...prev.activeTransactions, loading: true, error: null } }))
    try {
      const res = await fetch('/api/transactions/stats', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to load transaction stats')
      const activeTransactions = json.data
        ? (json.data.active || 0) + (json.data.under_contract || 0) + (json.data.lead || 0)
        : 0
      setMetrics((prev) => ({
        ...prev,
        activeTransactions: { value: activeTransactions, loading: false, error: null },
      }))
    } catch (e: any) {
      setMetrics((prev) => ({
        ...prev,
        activeTransactions: { ...prev.activeTransactions, loading: false, error: e.message || 'Offline' },
      }))
    }
  }, [])

  const fetchCrm = useCallback(async () => {
    setMetrics((prev) => ({ ...prev, crmContacts: { ...prev.crmContacts, loading: true, error: null } }))
    try {
      const res = await fetch('/api/contacts/stats', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to load CRM stats')
      setMetrics((prev) => ({
        ...prev,
        crmContacts: { value: json.data?.total || 0, loading: false, error: null },
      }))
    } catch (e: any) {
      setMetrics((prev) => ({
        ...prev,
        crmContacts: { ...prev.crmContacts, loading: false, error: e.message || 'Offline' },
      }))
    }
  }, [])

  const fetchListings = useCallback(async () => {
    setMetrics((prev) => ({ ...prev, activeListings: { ...prev.activeListings, loading: true, error: null } }))
    try {
      const res = await fetch('/api/listings', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const listings: any[] = json.listings || json.data || (Array.isArray(json) ? json : [])
      const activeListings = listings.filter((l: any) =>
        ['active', 'Active', 'ACTIVE'].includes(l.status || l.approval_status || '')
      ).length
      setMetrics((prev) => ({
        ...prev,
        activeListings: { value: activeListings, loading: false, error: null },
      }))
    } catch (e: any) {
      setMetrics((prev) => ({
        ...prev,
        activeListings: { ...prev.activeListings, loading: false, error: e.message || 'Offline' },
      }))
    }
  }, [])

  const loadNeedsAttention = useCallback(async () => {
    setAttentionLoading(true)
    setAttentionSyncWarning(null)
    let overdueFollowups = 0
    let closingSoon = 0
    let missingMilestones = 0
    let hasSyncIssue = false

    // Overdue follow-ups
    try {
      const crmRes = await fetch('/api/contacts/stats', { credentials: 'include' })
      if (crmRes.ok) {
        const crmJson = await crmRes.json()
        if (crmJson.success) {
          overdueFollowups = crmJson.data?.overdue || 0
        }
      } else {
        hasSyncIssue = true
      }
    } catch {
      hasSyncIssue = true
    }

    // Transactions closing soon
    try {
      const txRes = await fetch('/api/transactions', { credentials: 'include' })
      if (txRes.ok) {
        const txJson = await txRes.json()
        if (txJson.success && Array.isArray(txJson.data)) {
          const in14Days = Date.now() + 14 * 24 * 60 * 60 * 1000
          txJson.data.forEach((t: any) => {
            if (t.target_close_date) {
              const closeDate = Date.parse(t.target_close_date)
              if (!isNaN(closeDate) && closeDate >= Date.now() && closeDate <= in14Days) {
                closingSoon++
              }
            }
            if (t.status === 'under_contract' && (!t.escrow_date || !t.inspection_deadline || !t.appraisal_date)) {
              missingMilestones++
            }
          })
        }
      } else {
        hasSyncIssue = true
      }
    } catch {
      hasSyncIssue = true
    }

    setNeedsAttention({ overdueFollowups, closingSoon, missingMilestones })
    if (hasSyncIssue) {
      setAttentionSyncWarning('Partial sync — some external alerts could not be refreshed.')
    }
    setAttentionLoading(false)
  }, [])

  // Initial load
  useEffect(() => {
    fetchUsers()
    fetchTransactions()
    fetchCrm()
    fetchListings()
    loadNeedsAttention()
  }, [fetchUsers, fetchTransactions, fetchCrm, fetchListings, loadNeedsAttention])

  const healthItems = useMemo(() => [
    {
      key: 'activeUsers',
      label: 'Active Users',
      color: '#3B82F6',
      href: '/user-management',
      icon: Icons.Users,
      state: metrics.activeUsers,
      refetch: fetchUsers,
    },
    {
      key: 'activeTransactions',
      label: 'Active Deals',
      color: '#8B5CF6',
      href: '/transactions/pipeline',
      icon: Icons.TrendingUp,
      state: metrics.activeTransactions,
      refetch: fetchTransactions,
    },
    {
      key: 'activeListings',
      label: 'Active Listings',
      color: '#10B981',
      href: '/inventory',
      icon: Icons.Home,
      state: metrics.activeListings,
      refetch: fetchListings,
    },
    {
      key: 'crmContacts',
      label: 'CRM Contacts',
      color: '#3B82F6',
      href: '/marketing/crm',
      icon: Icons.Users,
      state: metrics.crmContacts,
      refetch: fetchCrm,
    },
  ], [metrics, fetchUsers, fetchTransactions, fetchListings, fetchCrm])

  const attentionItems = useMemo(() => {
    const items: Array<{ label: string; count: number; href: string; color: string; icon: any }> = []
    if (needsAttention.overdueFollowups > 0) {
      items.push({ label: 'Overdue Follow-ups', count: needsAttention.overdueFollowups, href: '/marketing/crm?lead_stage=overdue', color: '#EF4444', icon: Icons.Clock })
    }
    if (needsAttention.closingSoon > 0) {
      items.push({ label: 'Closing Within 14 Days', count: needsAttention.closingSoon, href: '/transactions/pipeline', color: '#F59E0B', icon: Icons.Calendar })
    }
    if (needsAttention.missingMilestones > 0) {
      items.push({ label: 'Missing Stage-Gate Milestones', count: needsAttention.missingMilestones, href: '/transactions/pipeline', color: '#EF4444', icon: Icons.AlertTriangle })
    }
    return items
  }, [needsAttention])

  const quickActions = useMemo(() => [
    { label: 'Tenant Management', icon: Icons.Building2, href: '/user-management', color: '#3B82F6', canAccess: can('hr', 'read') },
    { label: 'Deals', icon: Icons.TrendingUp, href: '/transactions/pipeline', color: '#8B5CF6', canAccess: can('transactions', 'read') },
    { label: 'CRM', icon: Icons.Users, href: '/marketing/crm', color: '#8B5CF6', canAccess: can('crm', 'read') },
    { label: 'Listings', icon: Icons.Home, href: '/inventory', color: '#10B981', canAccess: can('listings', 'read') },
    { label: 'Settings', icon: Icons.Settings, href: '/settings', color: '#6B7280', canAccess: true },
  ].filter(a => a.canAccess), [can])

  const isInitialLoading = Object.values(metrics).every((m) => m.loading)

  return (
    <div>
      {/* ── Needs Attention ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icons.AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Needs Attention</h3>
          </div>
          <Link to="/transactions/pipeline" className="text-xs font-semibold text-blue-600 hover:underline">
            View All →
          </Link>
        </div>

        {attentionLoading ? (
          <div className="py-4 px-4 bg-gray-50 border border-gray-100 rounded-xl text-xs text-gray-400 animate-pulse">
            Checking pipeline and follow-up milestones...
          </div>
        ) : attentionItems.length === 0 ? (
          <div className="py-6 text-center text-gray-400 text-sm border border-dashed rounded-xl bg-white/50">
            No operational exceptions at this time.
          </div>
        ) : (
          <div className="space-y-3">
            {attentionItems.map((item) => (
              <Link
                key={item.label}
                to={item.href}
                className="flex items-center justify-between p-3 rounded-xl border border-gray-150 bg-white hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: item.color + '15' }}>
                    <item.icon className="h-4 w-4" style={{ color: item.color }} />
                  </div>
                  <span className="text-sm font-medium text-gray-900">{item.label}</span>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: item.color + '18', color: item.color }}>
                  {item.count}
                </span>
              </Link>
            ))}
          </div>
        )}

        {attentionSyncWarning && (
          <div className="mt-2 flex items-center justify-between px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <span className="flex items-center gap-1.5">
              <Icons.Info className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
              {attentionSyncWarning}
            </span>
            <button
              onClick={() => loadNeedsAttention()}
              className="text-xs font-semibold text-amber-900 underline hover:opacity-80 ml-2"
            >
              Retry Sync
            </button>
          </div>
        )}
      </section>

      {/* ── Workspace Health (Fault-Tolerant Micro-Widgets) ────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icons.HeartPulse className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Workspace Health</h3>
          </div>
          <span className="text-[11px] text-gray-400">Live Services</span>
        </div>

        {isInitialLoading ? (
          <SkeletonMetricGrid count={4} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {healthItems.map((item) => {
              const { value, loading, error } = item.state
              return (
                <div
                  key={item.key}
                  className="group relative rounded-xl p-4 border border-gray-150 bg-white hover:border-gray-300 hover:shadow-sm transition-all text-center flex flex-col justify-between"
                >
                  <Link to={item.href} className="block">
                    <div className="flex items-center justify-center mb-2">
                      <div className="p-2 rounded-xl" style={{ backgroundColor: item.color + '15' }}>
                        <item.icon className="h-5 w-5 group-hover:scale-105 transition-transform" style={{ color: item.color }} />
                      </div>
                    </div>
                    {loading ? (
                      <div className="h-7 w-12 bg-gray-100 rounded animate-pulse mx-auto mb-1" />
                    ) : error ? (
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-gray-400">—</span>
                      </div>
                    ) : (
                      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
                    )}
                    <p className="text-xs text-gray-600 mt-0.5">{item.label}</p>
                  </Link>

                  {/* Micro Status / Retry Control */}
                  {error && (
                    <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-center gap-1.5">
                      <span className="text-[10px] text-amber-600 font-medium">Offline</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          item.refetch()
                        }}
                        disabled={loading}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded transition-colors"
                        title="Retry fetching this metric"
                      >
                        <Icons.RefreshCw className={`h-2.5 w-2.5 ${loading ? 'animate-spin' : ''}`} />
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Tenant Management ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icons.Building2 className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Tenant Management</h3>
          </div>
          <Link to="/user-management" className="text-xs font-semibold text-purple-600 hover:underline">
            Manage Tenant →
          </Link>
        </div>
        <Link to="/user-management" className="group rounded-xl border border-gray-150 bg-white hover:border-purple-200 hover:shadow-sm p-4 transition-all flex items-start gap-3 w-full max-w-md">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors">
            <Icons.Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-900 group-hover:text-purple-700">Tenant & Brokerage Management</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Manage tenant organization, Broker of Record, team hierarchy, and role privileges</p>
          </div>
        </Link>
      </section>

      {/* ── Operational Quick Actions ────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.Zap className="h-4 w-4 text-purple-600" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className="group rounded-xl border border-gray-150 bg-white hover:border-blue-200 hover:shadow-sm p-3.5 transition-all flex items-start gap-3"
            >
              <div className="p-2 rounded-lg" style={{ backgroundColor: action.color + '15' }}>
                <action.icon className="h-4 w-4" style={{ color: action.color }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-gray-900 group-hover:text-blue-700 truncate">{action.label}</p>
                <p className="text-[10px] text-gray-400">Quick access</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Quick Links (personal) ───────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">My Quick Links</h3>
            {isPersonalized && (
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                Personalized
              </span>
            )}
          </div>
          {onEditQuickLinks && (
            <button
              onClick={onEditQuickLinks}
              className="inline-flex items-center gap-1.5 text-xs text-brand-navy hover:text-blue-700 bg-brand-navy/5 hover:bg-brand-navy/10 px-2.5 py-1 rounded-lg font-semibold transition-all"
            >
              <Icons.Pencil className="h-3 w-3" />
              Edit My Quick Links
            </button>
          )}
        </div>
        {visibleQuickLinks.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {visibleQuickLinks.map((link: QuickLink) => {
              const isExternal = link.url.startsWith('http://') || link.url.startsWith('https://')
              const Icon = (Icons as any)[link.icon] || Icons.Link
              const linkContent = (
                <>
                  <Icon className="h-5 w-5 text-brand-navy flex-shrink-0" />
                  <span className="truncate text-sm text-gray-700 group-hover:text-gray-900 font-medium">{link.label}</span>
                </>
              )
              const linkClass = "flex items-center gap-3 p-3 rounded-xl border border-gray-150 bg-white hover:bg-gray-50 transition-all group shadow-sm"

              return isExternal ? (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkClass}
                >
                  {linkContent}
                </a>
              ) : (
                <Link
                  key={link.id}
                  to={link.url}
                  className={linkClass}
                >
                  {linkContent}
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-gray-400 border border-dashed rounded-xl flex flex-col items-center justify-center gap-2 bg-white">
            <p>No quick links configured.</p>
            {onEditQuickLinks && (
              <button
                onClick={onEditQuickLinks}
                className="inline-flex items-center gap-1 text-xs text-brand-navy font-bold hover:underline"
              >
                <Icons.Plus className="h-3.5 w-3.5" />
                Add Quick Links
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}