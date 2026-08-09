import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { SkeletonMetricGrid } from '@/components/common/SkeletonLoader'
import { TodayActions } from '@/components/layout/TodayActions'
import { useAuth } from '@/context/AuthContext'

interface AssistantDashboardProps {
  can: (module: string, action: string) => boolean
  visibleQuickLinks: any[]
}

export function AssistantDashboard({
  can,
  visibleQuickLinks,
}: AssistantDashboardProps) {
  const { isActingAsAssistant, principal } = useAuth()
  const [txStats, setTxStats] = useState({
    active: 0,
    closingSoon: 0,
    missingMilestones: 0,
    overdue: 0,
  })
  const [contactStats, setContactStats] = useState({
    total: 0,
    overdue: 0,
    needsFollowUp: 0,
  })
  const [isLoadingStats, setIsLoadingStats] = useState(true)

  // Fetch transaction stats for the linked salesperson
  useEffect(() => {
    async function loadTxStats() {
      if (!principal?.id) return
      try {
        const res = await fetch(`/api/transactions?assigned_to=${principal.id}`, { credentials: 'include' })
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          const txs = json.data
          const now = Date.now()
          const in14Days = now + 14 * 24 * 60 * 60 * 1000

          let active = 0
          let closingSoon = 0
          let missingMilestones = 0

          txs.forEach((t: any) => {
            if (t.status === 'active' || t.status === 'lead' || t.status === 'offer_received') active++
            if (t.target_close_date) {
              const closeDate = Date.parse(t.target_close_date)
              if (!isNaN(closeDate) && closeDate <= in14Days && closeDate >= Date.now()) closingSoon++
            }
            if (t.status === 'under_contract' && (!t.escrow_date || !t.inspection_deadline || !t.appraisal_date)) {
              missingMilestones++
            }
          })

          setTxStats({ active, closingSoon, missingMilestones, overdue: 0 })
        }
      } catch (e) {
        console.error('Failed to load assistant tx stats', e)
      }
    }
    loadTxStats()
  }, [principal?.id])

  // Fetch contact stats for the linked salesperson
  useEffect(() => {
    async function loadContactStats() {
      if (!principal?.id) return
      try {
        const res = await fetch(`/api/contacts/stats?assigned_to=${principal.id}`, { credentials: 'include' })
        const json = await res.json()
        if (json.success && json.data) {
          setContactStats({
            total: json.data.total || 0,
            overdue: json.data.overdue || 0,
            needsFollowUp: json.data.needsFollowUp || 0,
          })
        }
      } catch (e) {
        console.error('Failed to load assistant contact stats', e)
      } finally {
        setIsLoadingStats(false)
      }
    }
    loadContactStats()
  }, [principal?.id])

  const workloadItems = useMemo(() => [
    { key: 'activeTransactions', label: 'Active Transactions', value: txStats.active, color: '#3B82F6', href: '/transactions/pipeline', icon: Icons.LayoutDashboard },
    { key: 'delegatedContacts', label: 'Delegated Contacts', value: contactStats.total, color: '#3B82F6', href: '/marketing/crm', icon: Icons.Users },
    { key: 'dueToday', label: 'Due Today', value: contactStats.overdue + contactStats.needsFollowUp, color: '#F59E0B', href: '/marketing/crm?lead_stage=overdue', icon: Icons.Clock },
    { key: 'needsAttention', label: 'Needs Attention', value: txStats.missingMilestones + txStats.closingSoon, color: '#EF4444', href: '/transactions/pipeline', icon: Icons.AlertTriangle },
  ], [txStats, contactStats])

  const needsAttentionItems = useMemo(() => {
    const items: Array<{ label: string; count: number; href: string; color: string; icon: any }> = []
    if (txStats.missingMilestones > 0) {
      items.push({ label: 'Missing Stage-Gate Milestones', count: txStats.missingMilestones, href: '/transactions/pipeline', color: '#EF4444', icon: Icons.AlertTriangle })
    }
    if (txStats.closingSoon > 0) {
      items.push({ label: 'Closing Within 14 Days', count: txStats.closingSoon, href: '/transactions/pipeline', color: '#F59E0B', icon: Icons.Calendar })
    }
    if (contactStats.overdue > 0) {
      items.push({ label: 'Overdue Follow-ups', count: contactStats.overdue, href: '/marketing/crm?lead_stage=overdue', color: '#EF4444', icon: Icons.Clock })
    }
    if (contactStats.needsFollowUp > 0) {
      items.push({ label: 'Follow-ups Due Today', count: contactStats.needsFollowUp, href: '/marketing/crm?lead_stage=needs_follow_up', color: '#F59E0B', icon: Icons.Clock })
    }
    return items
  }, [txStats, contactStats])

  const quickActions = useMemo(() => [
    { label: 'Create Transaction', icon: Icons.Plus, href: '/transactions/pipeline', color: '#3B82F6', canAccess: can('transactions', 'write') },
    { label: 'Add Contact', icon: Icons.UserPlus, href: '/marketing/crm', color: '#8B5CF6', canAccess: can('crm', 'write') },
    { label: 'Open Pipeline', icon: Icons.LayoutDashboard, href: '/transactions/pipeline', color: '#10B981', canAccess: can('transactions', 'read') },
    { label: 'Open CRM', icon: Icons.Users, href: '/marketing/crm', color: '#8B5CF6', canAccess: can('crm', 'read') },
  ].filter(a => a.canAccess), [can])

  // Empty state when no active assignment
  if (!isActingAsAssistant || !principal) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
          <Icons.UserX className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No active assistant assignment</h2>
        <p className="text-gray-500 max-w-md mx-auto mb-6">
          Your account is not currently linked to a salesperson. Contact a workspace administrator to request access.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-navy hover:bg-brand-navy-light text-white text-sm font-semibold shadow-sm transition-colors"
        >
          <Icons.Home className="h-4 w-4" />
          Go to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* ── Working-for banner is shown globally via ImpersonationBanner ── */}

      {/* ── Do Today ────────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.AlertCircle className="h-4 w-4 text-red-500" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Do Today</h3>
        </div>
        <TodayActions />
      </section>

      {/* ── My Workload ─────────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.Target className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">My Workload</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoadingStats ? (
            <SkeletonMetricGrid count={4} />
          ) : (
            workloadItems.map((item) => (
              <Link
                key={item.key}
                to={item.href}
                className="group rounded-xl p-4 border bg-white hover:shadow transition-all text-center"
              >
                <div className="flex items-center justify-center mb-2">
                  <item.icon className="h-5 w-5 text-gray-600 group-hover:scale-105 transition-transform" style={{ color: item.color }} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{item.value.toString()}</p>
                <p className="text-xs text-gray-600 mt-0.5">{item.label}</p>
              </Link>
            ))
          )}
        </div>
      </section>

      {/* ── Needs Attention ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icons.AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Needs Attention</h3>
          </div>
          <Link to="/transactions/pipeline" className="text-xs font-semibold text-blue-600 hover:underline">
            View All →
          </Link>
        </div>
        {needsAttentionItems.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm border border-dashed rounded-xl">
            Nothing needs attention right now. Great job!
          </div>
        ) : (
          <div className="space-y-3">
            {needsAttentionItems.map((item) => (
              <Link key={item.label} to={item.href} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-100/60 transition-colors">
                <div className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" style={{ color: item.color }} />
                  <span className="text-sm font-medium text-gray-900">{item.label}</span>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: item.color + '18', color: item.color }}>
                  {item.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ── Quick Actions ───────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.Zap className="h-4 w-4 text-purple-600" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Quick Actions</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className="group rounded-xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow p-4 transition-all flex items-start gap-3"
            >
              <div className="p-2 rounded-lg" style={{ backgroundColor: action.color + '18' }}>
                <action.icon className="h-4 w-4" style={{ color: action.color }} />
              </div>
              <div>
                <p className="text-xs font-bold text-gray-900 group-hover:text-blue-700">{action.label}</p>
                <p className="text-[10px] text-gray-500">Quick access</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Quick Links (personal) ───────────────────────────────────────────── */}
      {visibleQuickLinks.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">My Quick Links</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {visibleQuickLinks.map((link: any) => (
              <Link
                key={link.id}
                to={link.url}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all group"
              >
                {(() => {
                  const Icon = (Icons as any)[link.icon] || Icons.Link
                  return <Icon className="h-5 w-5 text-brand-navy flex-shrink-0" />
                })()}
                <span className="truncate text-sm text-gray-700 group-hover:text-gray-900">{link.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}