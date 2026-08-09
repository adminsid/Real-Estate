import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { SkeletonMetricGrid } from '@/components/common/SkeletonLoader'

interface AdminDashboardProps {
  can: (module: string, action: string) => boolean
  visibleQuickLinks: any[]
}

export function AdminDashboard({
  can,
  visibleQuickLinks,
}: AdminDashboardProps) {
  const [stats, setStats] = useState({
    activeUsers: 0,
    activeTransactions: 0,
    activeListings: 0,
    crmContacts: 0,
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
  const [isLoading, setIsLoading] = useState(true)
  const [statsErrors, setStatsErrors] = useState<Record<string, string>>({})
  const [needsAttentionErrors, setNeedsAttentionErrors] = useState<Record<string, string>>({})

  // Fetch workspace health stats
  useEffect(() => {
    async function loadStats() {
      const errors: Record<string, string> = {}
      try {
        // Active users
        try {
          const usersRes = await fetch('/api/hr/users?limit=1', { credentials: 'include' })
          const usersJson = await usersRes.json()
          if (!usersJson.success) throw new Error(usersJson.error || 'Failed')
          setStats(prev => ({ ...prev, activeUsers: usersJson.data?.total ?? 0 }))
        } catch (e) {
          errors.activeUsers = 'Failed to load'
        }

        // Transactions stats
        try {
          const txRes = await fetch('/api/transactions/stats', { credentials: 'include' })
          const txJson = await txRes.json()
          if (!txJson.success) throw new Error(txJson.error || 'Failed')
          const activeTransactions = (txJson.data)
            ? (txJson.data.active || 0) + (txJson.data.under_contract || 0) + (txJson.data.lead || 0)
            : 0
          setStats(prev => ({ ...prev, activeTransactions }))
        } catch (e) {
          errors.activeTransactions = 'Failed to load'
        }

        // Listings - get total count from stats endpoint
        try {
          const invRes = await fetch('/api/listings/stats', { credentials: 'include' })
          const invJson = await invRes.json()
          if (invJson.success && invJson.data) {
            setStats(prev => ({ ...prev, activeListings: invJson.data.total || 0 }))
          } else {
            // Fallback: try listings endpoint with limit=1 to get total
            const invRes = await fetch('/api/listings?limit=1', { credentials: 'include' })
            const invJson = await invRes.json()
            let activeListings = 0
            if (invJson.success && invJson.data?.total !== undefined) {
              activeListings = invJson.data.total
            } else if (invJson.success && Array.isArray(invJson.data?.listings)) {
              activeListings = invJson.data.listings.length
            } else if (invJson.success && Array.isArray(invJson.data?.data)) {
              activeListings = invJson.data.data.length
            } else if (Array.isArray(invJson.listings)) {
              activeListings = invJson.listings.length
            } else if (Array.isArray(invJson.data)) {
              activeListings = invJson.data.length
            }
            setStats(prev => ({ ...prev, activeListings }))
          }
        } catch (e) {
          errors.activeListings = 'Failed to load'
        }

        // CRM contacts
        try {
          const crmRes = await fetch('/api/contacts/stats', { credentials: 'include' })
          const crmJson = await crmRes.json()
          if (!crmJson.success) throw new Error(crmJson.error || 'Failed')
          setStats(prev => ({ ...prev, crmContacts: crmJson.data?.total || 0 }))
        } catch (e) {
          errors.crmContacts = 'Failed to load'
        }

        setStatsErrors(errors)
      } catch (e) {
        console.error('Failed to load admin stats', e)
      } finally {
        setIsLoading(false)
      }
    }
    loadStats()
  }, [])

  // Fetch needs attention items
  useEffect(() => {
    async function loadNeedsAttention(): Promise<void> {
      const errors: Record<string, string> = {};
      try {
        // Overdue follow-ups (from CRM)
        try {
          const crmRes = await fetch('/api/contacts/stats', { credentials: 'include' });
          const crmJson = await crmRes.json();
          if (!crmJson.success) throw new Error(crmJson.error || 'Failed');
          setNeedsAttention(prev => ({ ...prev, overdueFollowups: crmJson.data?.overdue || 0 }));
        } catch (e) {
          errors.overdueFollowups = 'Failed to load';
        }

        // Transactions closing soon (within 14 days)
        try {
          const txRes = await fetch('/api/transactions', { credentials: 'include' });
          const txJson = await txRes.json();
          if (!txJson.success) throw new Error(txJson.error || 'Failed');
          let closingSoon = 0;
          let missingMilestones = 0;
          if (txJson.success && Array.isArray(txJson.data)) {
            const in14Days = Date.now() + 14 * 24 * 60 * 60 * 1000;
            txJson.data.forEach((t: any) => {
              if (t.target_close_date) {
                const closeDate = Date.parse(t.target_close_date);
                if (!isNaN(closeDate) && closeDate >= Date.now() && closeDate <= in14Days) closingSoon++;
              }
              if (t.status === 'under_contract' && (!t.escrow_date || !t.inspection_deadline || !t.appraisal_date)) {
                missingMilestones++;
              }
            });
          }
          setNeedsAttention(prev => ({ ...prev, closingSoon, missingMilestones }));
        } catch (e) {
          errors.closingSoon = 'Failed to load';
          errors.missingMilestones = 'Failed to load';
        }

        setNeedsAttentionErrors(errors);
      } catch (e) {
        console.error('Failed to load needs attention', e);
      }
    }
    loadNeedsAttention();
  }, []);

  const healthItems = useMemo(() => [
    { key: 'activeUsers', label: 'Active Users', value: stats.activeUsers, color: '#3B82F6', href: '/hr', icon: Icons.Users },
    { key: 'activeTransactions', label: 'Active Transactions', value: stats.activeTransactions, color: '#8B5CF6', href: '/transactions/pipeline', icon: Icons.TrendingUp },
    { key: 'activeListings', label: 'Active Listings', value: stats.activeListings, color: '#10B981', href: '/inventory', icon: Icons.Home },
    { key: 'crmContacts', label: 'CRM Contacts', value: stats.crmContacts, color: '#3B82F6', href: '/marketing/crm', icon: Icons.Users },
  ], [stats])

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
    { label: 'User Management', icon: Icons.Users, href: '/hr', color: '#3B82F6', canAccess: can('hr', 'read') },
    { label: 'Deals Pipeline', icon: Icons.TrendingUp, href: '/transactions/pipeline', color: '#8B5CF6', canAccess: can('transactions', 'read') },
    { label: 'CRM', icon: Icons.Users, href: '/marketing/crm', color: '#8B5CF6', canAccess: can('crm', 'read') },
    { label: 'Listings', icon: Icons.Home, href: '/inventory', color: '#10B981', canAccess: can('listings', 'read') },
    { label: 'Settings', icon: Icons.Settings, href: '/settings', color: '#6B7280', canAccess: true },
  ].filter(a => a.canAccess), [can])

  return (
    <div>
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
        {attentionItems.length === 0 && Object.keys(needsAttentionErrors).length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm border border-dashed rounded-xl">
            No operational exceptions at this time.
          </div>
        ) : (
          <div className="space-y-3">
            {attentionItems.map((item) => (
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
            {Object.entries(needsAttentionErrors).map(([key, error]) => (
              <div key={key} className="p-3 rounded-xl border border-red-200 bg-red-50 text-red-700">
                <div className="flex items-center gap-2">
                  <Icons.AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span className="text-sm font-medium">Failed to load: {key.replace(/([A-Z])/g, ' $1').trim()}</span>
                </div>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Workspace Health ────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Icons.HeartPulse className="h-4 w-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Workspace Health</h3>
        </div>
        {isLoading ? (
          <SkeletonMetricGrid count={4} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {healthItems.map((item) => {
              const error = statsErrors[item.key]
              return error ? (
                <div
                  key={item.key}
                  className="rounded-xl p-4 border bg-white text-center text-red-600"
                >
                  <item.icon className="h-5 w-5 mx-auto mb-2" style={{ color: '#EF4444' }} />
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-red-500 mt-1">{error}</p>
                </div>
              ) : (
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
              )
            })}
          </div>
        )}
      </section>

      {/* ── User Management ─────────────────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icons.Users className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">User Management</h3>
          </div>
          <Link to="/hr" className="text-xs font-semibold text-purple-600 hover:underline">
            Manage Users →
          </Link>
        </div>
        <Link to="/hr" className="group rounded-xl border border-gray-100 bg-white hover:border-purple-200 hover:shadow p-4 transition-all flex items-start gap-3 w-full max-w-md">
          <div className="p-2 rounded-lg bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors">
            <Icons.Users className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-900 group-hover:text-purple-700">User Management</p>
            <p className="text-[10px] text-gray-500">Manage workspace users, roles, access, and account status</p>
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