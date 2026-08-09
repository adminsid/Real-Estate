import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { AppTile } from '@/components/apps/AppTile'
import { SkeletonMetricGrid } from '@/components/common/SkeletonLoader'
import { useAuth } from '@/context/AuthContext'
import { APP_MODULES, NAV_CATEGORIES, isCategoryVisible, isSubitemVisible } from '@/utils/constants'
import { TodayActions } from '@/components/layout/TodayActions'
import { WorkflowHabitEngine } from '@/components/dashboard/WorkflowHabitEngine'
import { SalespersonDashboard } from '@/components/dashboard/roles/SalespersonDashboard'
import { BrokerDashboard } from '@/components/dashboard/roles/BrokerDashboard'
import { AssistantDashboard } from '@/components/dashboard/roles/AssistantDashboard'
import type { AppModule, UserRole } from '@/types'
import * as Icons from 'lucide-react'

interface QuickLink {
  id: string
  label: string
  url: string
  icon: string
  visibility?: 'all' | UserRole | 'me'
  ownerUserId?: string
}

interface CustomAppModule {
  id: string
  name: string
  description: string
  icon: string
  path: string
  externalUrl?: string
  status: 'active' | 'coming_soon' | 'under_construction'
  category: string
  color: string
  visibility?: 'all' | 'admin' | 'broker' | 'admin_broker'
  showInNavigation?: boolean
  adminOnly?: boolean
}

interface DashboardSettings {
  analytics: Record<string, boolean>
  aiFeatures: Record<string, boolean>
  quickLinks: QuickLink[]
  customModules?: CustomAppModule[]
}

const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  analytics: {
    activeListings: true,
    crmContacts: true,
    transactions: true,
    network: true,
    commissionVolume: true
  },
  aiFeatures: {
    insightsPanel: true,
    askPagePanel: true,
    outputActions: true,
    zeroStatePanel: true,
  },
  quickLinks: [
    { id: 'mls', label: 'MLS Listings', url: '/apps/inventory', icon: 'Home' },
    { id: 'prime-america-kb', label: 'Knowledge Base Hub', url: '/apps/prime-america-kb', icon: 'BookOpen' },
    { id: 'academy', label: 'Academy', url: 'https://primeamerica.theceshop.com/real-estate/', icon: 'BookOpen' },
  ],
  customModules: [
    {
      id: 'openhouse',
      name: 'Open House',
      description: 'Manage open houses and visitor registrations',
      icon: 'Home',
      path: '/marketing/openhouse',
      externalUrl: '/apps/openhouse',
      status: 'active',
      category: 'marketing',
      color: '#EC4899',
      adminOnly: true
    },
    {
      id: 'prime-america-kb',
      name: 'Prime America Knowledge Base',
      description: 'Prime America Real Estate knowledge base hub for admin, broker, and team',
      icon: 'BookOpen',
      path: '/learning/kb',
      externalUrl: '/apps/prime-america-kb',
      status: 'active',
      category: 'learning',
      color: '#6366F1',
    }
  ]
}

// Extract list of all uppercase-starting keys from Lucide icons
const ALL_LUCIDE_ICONS = Object.keys(Icons).filter(name => {
  if (name.charCodeAt(0) < 65 || name.charCodeAt(0) > 90) return false // starts with uppercase
  const item = (Icons as Record<string, unknown>)[name]
  return typeof item === 'function' || (typeof item === 'object' && item !== null)
})

const QUICK_LINK_VISIBILITY_OPTIONS: Array<{ value: 'all' | UserRole | 'me'; label: string }> = [
  { value: 'all', label: 'All user levels' },
  { value: 'me', label: 'Me Only' },
  { value: 'admin', label: 'Admin only' },
  { value: 'broker', label: 'Broker only' },
  { value: 'salesperson', label: 'Salesperson only' },
  { value: 'assistant', label: 'Assistant only' },
  { value: 'vendor', label: 'Vendor only' },
  { value: 'partner', label: 'Partner only' },
]

const MODULE_VISIBILITY_OPTIONS: Array<{ value: 'all' | 'admin' | 'broker' | 'admin_broker'; label: string }> = [
  { value: 'all', label: 'All users with module permission' },
  { value: 'admin', label: 'Admin only' },
  { value: 'broker', label: 'Broker only' },
  { value: 'admin_broker', label: 'Admin + Broker only' },
]

export function DashboardPage() {
  const { user, branding, refreshUser, can } = useAuth()
  const [stats, setStats] = useState({
    company: { activeListings: 0, crmContacts: 0, transactions: 0, network: 0, commissionVolume: 0 },
    agent: { activeListings: 0, crmContacts: 0, transactions: 0, network: 0, commissionVolume: 0 },
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)


  const sanitizeSettings = (raw: DashboardSettings): DashboardSettings => {
    return {
      ...raw,
      aiFeatures: {
        ...DEFAULT_DASHBOARD_SETTINGS.aiFeatures,
        ...(raw.aiFeatures || {}),
      },
      quickLinks: (raw.quickLinks || [])
        .filter((link) => link.id !== 'company')
        .map((link) => ({
          ...link,
          visibility: (link.visibility as 'all' | UserRole | 'me' | undefined) || 'all',
          ownerUserId: link.ownerUserId || undefined,
        })),
      customModules: (raw.customModules || DEFAULT_DASHBOARD_SETTINGS.customModules || []).map((m) => ({
        ...m,
        visibility: (m.visibility as 'all' | 'admin' | 'broker' | 'admin_broker' | undefined)
          || (m.adminOnly ? 'admin' : 'all'),
        showInNavigation: !!m.showInNavigation,
      })),
    }
  }

  // Dashboard settings state
  const [dbSettings, setDbSettings] = useState<DashboardSettings>(() => {
    if (branding.dashboardSettings) {
      try {
        const parsed = JSON.parse(branding.dashboardSettings)
        return sanitizeSettings({
          ...DEFAULT_DASHBOARD_SETTINGS,
          ...parsed
        })
      } catch (e) {
        console.error('Error parsing dashboard settings:', e)
      }
    }
    return sanitizeSettings(DEFAULT_DASHBOARD_SETTINGS)
  })

  // Sync settings from user branding context
  useEffect(() => {
    if (branding.dashboardSettings) {
      try {
        const parsed = JSON.parse(branding.dashboardSettings)
        setDbSettings(sanitizeSettings({
          ...DEFAULT_DASHBOARD_SETTINGS,
          ...parsed
        }))
      } catch (e) {
        console.error('Error parsing dashboard settings:', e)
      }
    }
  }, [branding.dashboardSettings])

  // Working editing copy of settings
  const [editSettings, setEditSettings] = useState<DashboardSettings>(dbSettings)

  // Personal User Quick Links state
  const [userQuickLinks, setUserQuickLinks] = useState<QuickLink[] | null>(null)
  const [isEditingUserQuickLinks, setIsEditingUserQuickLinks] = useState(false)
  const [draftUserQuickLinks, setDraftUserQuickLinks] = useState<QuickLink[]>([])
  const [isSavingUserQuickLinks, setIsSavingUserQuickLinks] = useState(false)

  const fetchUserQuickLinks = useCallback(async () => {
    try {
      const res = await fetch('/api/user/quick-links', { credentials: 'include' })
      const data = await res.json()
      if (data.success && Array.isArray(data.data?.quickLinks)) {
        setUserQuickLinks(data.data.quickLinks)
      }
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    fetchUserQuickLinks()
  }, [fetchUserQuickLinks])

  const openUserQuickLinksEditor = () => {
    const initialLinks = userQuickLinks !== null && userQuickLinks.length > 0
      ? userQuickLinks
      : (dbSettings.quickLinks || []).filter(isQuickLinkVisible)
    setDraftUserQuickLinks(JSON.parse(JSON.stringify(initialLinks)))
    setIsEditingUserQuickLinks(true)
  }

  const saveUserQuickLinks = async () => {
    setIsSavingUserQuickLinks(true)
    try {
      const res = await fetch('/api/user/quick-links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quickLinks: draftUserQuickLinks }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to save quick links')
      setUserQuickLinks(draftUserQuickLinks)
      setIsEditingUserQuickLinks(false)
      alert('✅ Personal quick links updated!')
    } catch (e: any) {
      alert(e.message || 'Failed to save quick links')
    } finally {
      setIsSavingUserQuickLinks(false)
    }
  }

  const resetUserQuickLinks = async () => {
    if (!confirm('Reset your quick links back to default company links?')) return
    setIsSavingUserQuickLinks(true)
    try {
      const res = await fetch('/api/user/quick-links', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quickLinks: [] }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to reset quick links')
      setUserQuickLinks(null)
      setIsEditingUserQuickLinks(false)
      alert('✅ Quick links reset to company defaults!')
    } catch (e: any) {
      alert(e.message || 'Failed to reset quick links')
    } finally {
      setIsSavingUserQuickLinks(false)
    }
  }

  useEffect(() => {
    if (isEditing) {
      setEditSettings(JSON.parse(JSON.stringify(dbSettings)))
    }
  }, [isEditing, dbSettings])

  // Editor Dialog / Modals State
  const [editModuleModal, setEditModuleModal] = useState<{
    index: number
    data: CustomAppModule
    isNew: boolean
  } | null>(null)

  const [editLinkModal, setEditLinkModal] = useState<{
    index: number
    data: QuickLink
    isNew: boolean
  } | null>(null)

  const [iconPickerModal, setIconPickerModal] = useState<{
    type: 'module' | 'link'
    onSelect: (iconName: string) => void
  } | null>(null)

  const [iconSearch, setIconSearch] = useState('')

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats')
      const json = await res.json()
      if (json.success && json.data) {
        const data = json.data
        const company = data.company || {
          activeListings: data.activeListings || 0,
          crmContacts: data.crmContacts || 0,
          transactions: data.transactions || 0,
          network: data.network || 0,
        }
        const agent = data.agent || {
          activeListings: data.activeListings || 0,
          crmContacts: data.crmContacts || 0,
          transactions: data.transactions || 0,
          network: data.network || 0,
        }
        setStats(prev => ({
          company: {
            activeListings: company.activeListings,
            crmContacts: company.crmContacts,
            transactions: company.transactions,
            network: company.network,
            commissionVolume: prev.company.commissionVolume,
          },
          agent: {
            activeListings: agent.activeListings,
            crmContacts: agent.crmContacts,
            transactions: agent.transactions,
            network: agent.network,
            commissionVolume: prev.agent.commissionVolume,
          }
        }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }

    // Compute commission volume and briefing stats from all active & closed deals
    try {
      const txRes = await fetch('/api/transactions')
      const txJson = await txRes.json()
      if (txJson.success && Array.isArray(txJson.data)) {
        const allTx = txJson.data.filter((t: any) => t.status !== 'fallen_through')
        const getComm = (t: any) => {
          if (t.commission_amount && Number(t.commission_amount) > 0) return Number(t.commission_amount)
          if (t.price && t.commission_rate && Number(t.price) > 0 && Number(t.commission_rate) > 0) {
            return (Number(t.price) * Number(t.commission_rate)) / 100
          }
          return 0
        }
        const companyVol = allTx.reduce((acc: number, t: any) => acc + getComm(t), 0)
        const agentVol = allTx
          .filter((t: any) => String(t.assigned_to) === String(user?.id))
          .reduce((acc: number, t: any) => acc + getComm(t), 0)

        // Find upcoming closing deals (within next 30 days)
        const closingSoon = allTx
          .filter((t: any) => t.target_close_date || t.status === 'under_contract')
          .slice(0, 5)

        setStats(prev => ({
          company: { ...prev.company, commissionVolume: Math.round(companyVol) },
          agent: { ...prev.agent, commissionVolume: Math.round(agentVol) },
        }))
        setUpcomingDeals(closingSoon)
      }
    } catch (e) {
      console.error('Failed to load commission data', e)
    }
  }

  const [upcomingDeals, setUpcomingDeals] = useState<any[]>([])

  useEffect(() => {
    fetchStats()
  }, [])

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const isAdmin = user && user.role === 'admin'
  const isSalesperson = user && user.role === 'salesperson'
  const isBroker = user && user.role === 'broker'
  const isAssistant = user && user.role === 'assistant'

  // Build Analytics stats config
  const analyticsConfig = (isEditing ? editSettings.analytics : dbSettings.analytics) || DEFAULT_DASHBOARD_SETTINGS.analytics
  const aiFeatureConfig = (isEditing ? editSettings.aiFeatures : dbSettings.aiFeatures) || DEFAULT_DASHBOARD_SETTINGS.aiFeatures
  const isCardVisible = (key: string) => {
    if (!user) return false
    if (user.role === 'admin') return true
    if (key === 'activeListings') return can('listings', 'read')
    if (key === 'crmContacts') return can('crm', 'read')
    if (key === 'transactions') return can('transactions', 'read')
    if (key === 'network') return can('network', 'read')
    return true
  }

  const allStatCards = [
    {
      key: 'activeListings',
      icon: Icons.Home,
      label: 'Active Listings',
      companyValue: isLoading ? '—' : stats.company.activeListings.toString(),
      agentValue: isLoading ? '—' : stats.agent.activeListings.toString(),
      color: '#10B981'
    },
    {
      key: 'crmContacts',
      icon: Icons.Users,
      label: 'CRM Contacts',
      companyValue: isLoading ? '—' : stats.company.crmContacts.toString(),
      agentValue: isLoading ? '—' : stats.agent.crmContacts.toString(),
      color: '#3B82F6'
    },
    {
      key: 'transactions',
      icon: Icons.TrendingUp,
      label: 'Transactions',
      companyValue: isLoading ? '—' : stats.company.transactions.toString(),
      agentValue: isLoading ? '—' : stats.agent.transactions.toString(),
      color: '#8B5CF6'
    },
    {
      key: 'network',
      icon: Icons.Star,
      label: 'Network',
      companyValue: isLoading ? '—' : stats.company.network.toString(),
      agentValue: isLoading ? '—' : stats.agent.network.toString(),
      color: '#F59E0B'
    },
    {
      key: 'commissionVolume',
      icon: Icons.DollarSign,
      label: 'Commission Volume',
      companyValue: isLoading ? '—' : `$${(stats.company.commissionVolume || 0).toLocaleString()}`,
      agentValue: isLoading ? '—' : `$${(stats.agent.commissionVolume || 0).toLocaleString()}`,
      color: '#059669'
    },
  ].filter(card => isCardVisible(card.key))
  const visibleStatCards = allStatCards.filter(card => analyticsConfig[card.key] !== false)

  const aiInsights = [
    stats.company.activeListings === 0 ? 'No active listings detected. Add or import listings to start pipeline flow.' : `Company has ${stats.company.activeListings} active listing${stats.company.activeListings === 1 ? '' : 's'} live.`,
    stats.company.crmContacts === 0 ? 'No CRM contacts yet. Import your first contacts to unlock follow-up workflows.' : `Company CRM has ${stats.company.crmContacts} contact${stats.company.crmContacts === 1 ? '' : 's'}.`,
    stats.company.transactions === 0 ? 'No transactions are in motion. Create a deal and apply a template to kickstart compliance tracking.' : `${stats.company.transactions} company transaction${stats.company.transactions === 1 ? '' : 's'} currently tracked.`,
    stats.company.network === 0 ? 'Network is empty. Add trusted vendors and partners for referral visibility.' : `Network contains ${stats.company.network} company connection${stats.company.network === 1 ? '' : 's'}.`,
  ]

  const askPageQuestions = [
    'Why are transactions at zero?',
    'Which module should I work on first?',
    'What should I set up next?',
  ]

  // Drag and drop quick links reordering
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  const handleDragStart = (index: number) => {
    if (!isEditing) return
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (index: number) => {
    if (draggedIndex === null || !isEditing) return
    const links = [...editSettings.quickLinks]
    const [removed] = links.splice(draggedIndex, 1)
    links.splice(index, 0, removed)
    setEditSettings({
      ...editSettings,
      quickLinks: links
    })
    setDraggedIndex(null)
  }

  const handleSaveSettings = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/tenant/dashboard-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editSettings)
      })
      const json = await res.json()
      if (json.success) {
        setDbSettings(editSettings)
        await refreshUser()
        setIsEditing(false)
      } else {
        alert(json.error ?? 'Failed to save dashboard settings')
      }
    } catch (e) {
      console.error('Error saving dashboard settings:', e)
      alert('An error occurred while saving dashboard settings')
    } finally {
      setIsSaving(false)
    }
  }

  // Helper to dynamically render a lucide icon
  const renderLucideIcon = (name: string, className = 'h-5 w-5', style = {}) => {
    const IconComponent = (Icons as Record<string, unknown>)[name] as React.ComponentType<{ className?: string, style?: React.CSSProperties }> | undefined
    if (!IconComponent) return <Icons.HelpCircle className={className} style={style} />
    return <IconComponent className={className} style={style} />
  }

  // Filter list of custom modules based on current user role permissions
  const customModules = (isEditing ? editSettings.customModules : dbSettings.customModules) || DEFAULT_DASHBOARD_SETTINGS.customModules || []
  const visibleCustomModules = customModules.filter((m: CustomAppModule) => {
    const visibility = m.visibility || (m.adminOnly ? 'admin' : 'all')
    if (!user) return false
    if (visibility === 'all') return true
    if (visibility === 'admin') return user.role === 'admin'
    if (visibility === 'broker') return user.role === 'broker'
    if (visibility === 'admin_broker') return user.role === 'admin' || user.role === 'broker'
    return true
  })
  const combinedAppModules = [...APP_MODULES, ...(visibleCustomModules as unknown as AppModule[])]
  const allowedAppModules = combinedAppModules.filter(m => isSubitemVisible(m.id, m.category, user, can))

  // Filtered icons in visual picker
  const filteredIcons = ALL_LUCIDE_ICONS.filter(name =>
    name.toLowerCase().includes(iconSearch.toLowerCase())
  ).slice(0, 100)

  const isQuickLinkVisible = (link: QuickLink) => {
    if (!user) return false
    const visibility = link.visibility || 'all'
    if (visibility === 'me') return !!link.ownerUserId && link.ownerUserId === user.id
    return visibility === 'all' || user.role === visibility
  }

  const visibleQuickLinks = isEditing
    ? (editSettings.quickLinks || [])
    : userQuickLinks !== null && userQuickLinks.length > 0
      ? userQuickLinks
      : (dbSettings.quickLinks || []).filter(isQuickLinkVisible)

  return (
    <Layout title="Dashboard">

      {/* ── Header: greeting + admin controls ─────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-gray-400 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <h2 className="text-xl font-bold text-gray-900">
            {greeting()}{user ? `, ${user.name.split(' ')[0]}` : ''}
          </h2>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveSettings}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-colors disabled:opacity-50"
                >
                  <Icons.Save className="h-4 w-4" />
                  {isSaving ? 'Saving...' : 'Save Dashboard'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors"
                >
                  <Icons.X className="h-4 w-4" />
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-navy hover:bg-brand-navy-light text-white text-sm font-semibold shadow-sm transition-colors"
              >
                <Icons.Sliders className="h-4 w-4" />
                Customize Dashboard
              </button>
            )}
          </div>
        )}
      </div>

      {isSalesperson ? (
        <SalespersonDashboard
          user={user}
          stats={stats}
          upcomingDeals={upcomingDeals}
          isLoading={isLoading}
          can={can}
          visibleQuickLinks={visibleQuickLinks}
          allowedAppModules={combinedAppModules.filter(m => isSubitemVisible(m.id, m.category, user, can))}
        />
      ) : isBroker ? (
        <BrokerDashboard
          stats={stats}
          can={can}
          user={user || undefined}
          allowedAppModules={combinedAppModules.filter(m => isSubitemVisible(m.id, m.category, user, can))}
        />
      ) : isAssistant ? (
        <AssistantDashboard
          can={can}
          visibleQuickLinks={visibleQuickLinks}
        />
      ) : (
        <>

      {/* ── Interactive Realtor Habit & Workflow Operating System ($175K Target) ────── */}
      <WorkflowHabitEngine activePipelineVolume={stats.company.commissionVolume} />

      {/* ── Today's Actions ribbon (only shows when actionable items exist) ─ */}
      <TodayActions />

      {/* ── At a Glance: Operational Momentum ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Link to="/transactions/pipeline" className="group rounded-2xl border border-gray-100 bg-white hover:border-blue-200 hover:shadow-md p-5 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Icons.Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <Icons.ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{isLoading ? '—' : upcomingDeals.length}</p>
          <p className="text-sm font-medium text-gray-600 mt-0.5">Upcoming Closing Dates</p>
          <p className="text-xs text-gray-400 mt-1">{upcomingDeals.length > 0 ? `${upcomingDeals.length} deals scheduled to close` : 'No closing dates scheduled this week'}</p>
        </Link>

        <Link to="/marketing/crm" className="group rounded-2xl border border-gray-100 bg-white hover:border-emerald-200 hover:shadow-md p-5 transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Icons.PhoneCall className="h-5 w-5 text-emerald-600" />
            </div>
            <Icons.ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-emerald-500 transition-colors" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{isLoading ? '—' : (stats.agent.crmContacts || stats.company.crmContacts)}</p>
          <p className="text-sm font-medium text-gray-600 mt-0.5">Active Client Pipeline</p>
          <p className="text-xs text-gray-400 mt-1">Nurturing buyer & seller relationships</p>
        </Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <Icons.Target className="h-5 w-5 text-amber-600" />
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">$175K Goal</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">${Math.round((stats.company.commissionVolume * 0.025) / 1000)}k GCI</p>
          <p className="text-sm font-medium text-gray-600 mt-0.5">Estimated Commission Volume</p>
          <p className="text-xs text-gray-400 mt-1">Based on active deal pipeline @ 2.5% avg</p>
        </div>
      </div>

      {/* ── Analytics Stats Grid (Clickable Cards) ──────────────────── */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-6 rounded-full bg-slate-400" />
          <h3 className="text-base font-bold text-gray-800">Key Performance Indicators</h3>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {isLoading ? (
          <SkeletonMetricGrid count={5} />
        ) : (isEditing ? allStatCards : visibleStatCards).map((card) => {
          const CardIcon = card.icon
          const isEnabled = analyticsConfig[card.key] !== false
          const hrefMap: Record<string, string> = {
            activeListings: '/inventory',
            crmContacts: '/marketing/crm',
            transactions: '/transactions/pipeline',
            network: '/network',
            commissionVolume: '/transactions/pipeline',
          }
          const cardHref = hrefMap[card.key] || '/'

          const cardContent = (
            <div
              className={`rounded-2xl p-5 border relative transition-all ring-1 ring-black/5 ${
                isEditing && !isEnabled ? 'opacity-40 border-dashed border-gray-300 bg-gray-50/50' : 'border-gray-100 hover:border-blue-300 hover:shadow-md'
              }`}
              style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)'
              }}
            >
              {/* Edit Toggle overlay in editor mode */}
              {isEditing && (
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setEditSettings({
                      ...editSettings,
                      analytics: {
                        ...editSettings.analytics,
                        [card.key]: !isEnabled
                      }
                    })
                  }}
                  className={`absolute top-3 right-3 p-1.5 rounded-lg border transition-colors ${
                    isEnabled
                      ? 'bg-brand-navy/5 border-brand-navy/10 text-brand-navy hover:bg-brand-navy/10'
                      : 'bg-gray-100 border-gray-200 text-gray-400 hover:bg-gray-200'
                  }`}
                  title={isEnabled ? 'Hide Metric' : 'Show Metric'}
                >
                  {isEnabled ? <Icons.Eye className="h-4 w-4" /> : <Icons.EyeOff className="h-4 w-4" />}
                </button>
              )}

              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: card.color + '18' }}
              >
                <CardIcon className="h-5 w-5" style={{ color: card.color }} />
              </div>
              <p className="text-2xl font-bold text-gray-800">{card.companyValue}</p>
              <p className="text-sm font-medium text-gray-600 mt-0.5 flex items-center justify-between">
                <span>{card.label}</span>
                <Icons.ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              </p>

              {/* Incomplete Data warning if Commission Volume is $0 */}
              {card.key === 'commissionVolume' && card.companyValue === '$0' && !isLoading && (
                <div className="mt-2 pt-2 border-t border-amber-200/50">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                    <Icons.AlertTriangle className="h-3 w-3" /> Incomplete Data
                  </span>
                  <p className="text-[10px] text-amber-700 mt-0.5 underline">Set commission rates in deals →</p>
                </div>
              )}
            </div>
          )

          return isEditing ? (
            <div key={card.key}>{cardContent}</div>
          ) : (
            <Link key={card.key} to={cardHref} className="block no-underline">
              {cardContent}
            </Link>
          )
        })}
      </div>

      {isEditing && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-card mb-8">
          <h4 className="font-bold text-gray-800 mb-3">AI Features Visibility</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { key: 'insightsPanel', label: 'Insights Panel' },
              { key: 'askPagePanel', label: 'Ask This Page' },
              { key: 'outputActions', label: 'Output Actions' },
              { key: 'zeroStatePanel', label: 'Zero-State Panel' },
            ].map((item) => {
              const enabled = aiFeatureConfig[item.key] !== false
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    setEditSettings({
                      ...editSettings,
                      aiFeatures: {
                        ...(editSettings.aiFeatures || DEFAULT_DASHBOARD_SETTINGS.aiFeatures),
                        [item.key]: !enabled,
                      },
                    })
                  }}
                  className={`text-sm px-3 py-2 rounded-lg border transition-colors ${enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                >
                  {enabled ? 'Visible' : 'Hidden'}: {item.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(aiFeatureConfig.insightsPanel !== false || aiFeatureConfig.askPagePanel !== false) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          {aiFeatureConfig.insightsPanel !== false && (
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-5 shadow-card">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-gray-800">AI Insights Panel</h4>
                <span className="text-xs text-gray-400">What changed and what to do next</span>
              </div>
              <div className="space-y-2">
                {aiInsights.map((insight, idx) => (
                  <p key={idx} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{insight}</p>
                ))}
              </div>
            </div>
          )}

          {aiFeatureConfig.askPagePanel !== false && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-card">
              <h4 className="font-bold text-gray-800 mb-2">Ask This Page</h4>
              <p className="text-xs text-gray-500 mb-3">Contextual questions for quick guidance.</p>
              <div className="space-y-2">
                {askPageQuestions.map((q) => (
                  <button
                    key={q}
                    className="w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700"
                    onClick={() => window.alert(`Suggested answer:\n\n${q}\n\nTip: start from the module with the lowest non-zero count and complete setup actions first.`)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Actionable Activity Widgets ────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Upcoming Deals Closing */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Icons.Calendar className="h-5 w-5 text-blue-600" />
              <h4 className="font-bold text-gray-900">Upcoming Deal Close Dates & Milestones</h4>
            </div>
            <Link to="/transactions/pipeline" className="text-xs font-semibold text-blue-600 hover:underline">
              View All Deals →
            </Link>
          </div>
          {upcomingDeals.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              No active deals scheduled to close soon.
            </div>
          ) : (
            <div className="space-y-3">
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
                    {deal.status === 'under_contract' && (
                      <div className="mt-1.5">
                        {!deal.escrow_date || !deal.inspection_deadline || !deal.appraisal_date ? (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                            Missing Milestones
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
                            Compliance OK
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions & Workspace Shortcuts */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="border-b border-gray-100 pb-3">
            <h4 className="font-bold text-gray-900">Quick Workspace Actions</h4>
            <p className="text-xs text-gray-500 mt-0.5">Fast shortcuts for daily tasks</p>
          </div>
          <div className="space-y-2">
            <Link to="/transactions/pipeline" className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-blue-50/50 hover:border-blue-200 transition-all text-left group">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                  <Icons.Plus className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 group-hover:text-blue-700">Create New Deal</p>
                  <p className="text-[10px] text-gray-500">Add to sales pipeline</p>
                </div>
              </div>
              <Icons.ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
            <Link to="/inventory" className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-emerald-50/50 hover:border-emerald-200 transition-all text-left group">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <Icons.Home className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 group-hover:text-emerald-700">Add Listing</p>
                  <p className="text-[10px] text-gray-500">Input property data</p>
                </div>
              </div>
              <Icons.ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
            <Link to="/marketing/crm" className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-purple-50/50 hover:border-purple-200 transition-all text-left group">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                  <Icons.UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 group-hover:text-purple-700">Import Contacts</p>
                  <p className="text-[10px] text-gray-500">Add client or lead</p>
                </div>
              </div>
              <Icons.ChevronRight className="h-4 w-4 text-gray-400" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── Dynamic App Categories ───────────────────────────────────── */}
      {NAV_CATEGORIES.filter(cat => isCategoryVisible(cat, user, can)).map((cat) => {
        const modules = allowedAppModules.filter((m) => m.category === cat.id)
        
        // In editor mode, we always show the category container so they can add modules to empty ones
        if (modules.length === 0 && !isEditing) return null

        return (
          <section key={cat.id} className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="h-1.5 w-6 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <h3 className="text-base font-bold text-gray-800">{cat.label}</h3>
                
                {/* Inline Add App button */}
                {isEditing && (
                  <button
                    onClick={() => {
                      setEditModuleModal({
                        index: editSettings.customModules?.length || 0,
                        isNew: true,
                        data: {
                          id: `app_${Date.now()}`,
                          name: 'New App',
                          description: 'Description of custom app',
                          icon: 'Globe',
                          path: '/custom-app',
                          externalUrl: 'https://',
                          status: 'active',
                          category: cat.id,
                          color: cat.color,
                          showInNavigation: false,
                          adminOnly: false
                        }
                      })
                    }}
                    className="inline-flex items-center gap-1 ml-2 text-xs text-brand-navy hover:text-brand-navy-light font-bold"
                  >
                    <Icons.Plus className="h-3.5 w-3.5" />
                    Add App
                  </button>
                )}
              </div>
              
              {!isEditing && (
                <Link
                  to={cat.path}
                  className="text-xs font-medium text-gray-400 hover:text-brand-navy flex items-center gap-1 transition-colors"
                >
                  View all <Icons.ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {modules.map((mod) => {
                // Is this a custom (mutable) module?
                const customIdx = (editSettings.customModules || []).findIndex(m => m.id === mod.id)
                const isCustom = customIdx !== -1

                return (
                  <div key={mod.id} className="relative group">
                    <AppTile module={mod} />
                    
                    {/* Inline edit buttons for custom modules when in editor mode */}
                    {isEditing && isCustom && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setEditModuleModal({
                              index: customIdx,
                              isNew: false,
                              data: { ...(editSettings.customModules || [])[customIdx] }
                            })
                          }}
                          className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:text-brand-navy hover:bg-gray-50 shadow-sm"
                          title="Edit App Tile"
                        >
                          <Icons.Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (confirm(`Remove custom app "${mod.name}"?`)) {
                              const updated = (editSettings.customModules || []).filter((_, idx) => idx !== customIdx)
                              setEditSettings({ ...editSettings, customModules: updated })
                            }
                          }}
                          className="p-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50 shadow-sm"
                          title="Delete App Tile"
                        >
                          <Icons.Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {modules.length === 0 && isEditing && (
                <div className="col-span-full py-6 text-center text-xs text-gray-400 border border-dashed rounded-2xl">
                  No modules in this category. Click "Add App" to create one.
                </div>
              )}
            </div>
          </section>
        )
      })}

      {/* ── Quick Links Section ──────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-6 rounded-full bg-brand-navy" />
            <h3 className="text-base font-bold text-gray-800">Quick Links</h3>
            {userQuickLinks !== null && userQuickLinks.length > 0 && (
              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
                Personalized
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                onClick={openUserQuickLinksEditor}
                className="inline-flex items-center gap-1.5 text-xs text-brand-navy hover:text-blue-700 bg-brand-navy/5 hover:bg-brand-navy/10 px-3 py-1.5 rounded-xl font-bold transition-all"
              >
                <Icons.Pencil className="h-3.5 w-3.5" />
                Edit My Quick Links
              </button>
            )}

            {isEditing && (
              <button
                onClick={() => {
                  setEditLinkModal({
                    index: editSettings.quickLinks?.length || 0,
                    isNew: true,
                    data: {
                      id: `ql_${Date.now()}`,
                      label: 'New Link',
                      url: 'https://',
                      icon: 'Link',
                      visibility: 'all',
                      ownerUserId: user?.id,
                    }
                  })
                }}
                className="inline-flex items-center gap-1 text-xs text-brand-navy hover:text-brand-navy-light font-bold"
              >
                <Icons.Plus className="h-3.5 w-3.5" />
                Add Link
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {visibleQuickLinks.map((link, index: number) => {
            const content = (
              <div className="flex items-center gap-3 w-full">
                {isEditing && (
                  <div className="cursor-grab text-gray-400 p-0.5 hover:text-brand-navy flex-shrink-0">
                    <Icons.GripVertical className="h-4 w-4" />
                  </div>
                )}
                {renderLucideIcon(link.icon, "h-5 w-5 text-brand-navy flex-shrink-0")}
                <span className="truncate flex-1 text-left">{link.label}</span>
                
                {isEditing && (
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        setEditLinkModal({
                          index,
                          isNew: false,
                          data: { ...editSettings.quickLinks[index] }
                        })
                      }}
                      className="p-1 text-gray-400 hover:text-brand-navy hover:bg-gray-100 rounded"
                    >
                      <Icons.Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        if (confirm(`Delete quick link "${link.label}"?`)) {
                          const updated = editSettings.quickLinks.filter((_, idx) => idx !== index)
                          setEditSettings({ ...editSettings, quickLinks: updated })
                        }
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Icons.Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )

            return (
              <div
                key={link.id || index}
                draggable={isEditing}
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                className={`flex items-center bg-white rounded-xl p-4 shadow-card border transition-all ${
                  draggedIndex === index ? 'opacity-40 border-dashed border-brand-navy' : 'border-gray-100'
                } ${
                  !isEditing ? 'hover:shadow-card-hover hover:-translate-y-0.5 cursor-pointer text-sm font-medium text-gray-700' : 'text-sm font-medium text-gray-500'
                }`}
              >
                {!isEditing ? (
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-3">
                    {content}
                  </a>
                ) : (
                  content
                )}
              </div>
            )
          })}
          {visibleQuickLinks.length === 0 && (
            <p className="text-xs text-gray-400 col-span-full py-4 text-center border border-dashed rounded-xl">No quick links configured.</p>
          )}
        </div>
      </section>
        </>
      )}

      {/* ── EDIT DIALOG: CUSTOM APP MODULE ───────────────────────────── */}
      {editModuleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base">
                {editModuleModal.isNew ? 'Create Custom App Tile' : 'Edit App Module'}
              </h3>
              <button onClick={() => setEditModuleModal(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <Icons.X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">App Name</label>
                <input
                  type="text"
                  value={editModuleModal.data.name}
                  onChange={(e) => setEditModuleModal({
                    ...editModuleModal,
                    data: { ...editModuleModal.data, name: e.target.value }
                  })}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                  placeholder="e.g. Open House Manager"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Description</label>
                <textarea
                  value={editModuleModal.data.description}
                  onChange={(e) => setEditModuleModal({
                    ...editModuleModal,
                    data: { ...editModuleModal.data, description: e.target.value }
                  })}
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy resize-none"
                  placeholder="What does this app do?"
                />
              </div>

              {/* External URL */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">External URL</label>
                <input
                  type="text"
                  value={editModuleModal.data.externalUrl || ''}
                  onChange={(e) => setEditModuleModal({
                    ...editModuleModal,
                    data: { ...editModuleModal.data, externalUrl: e.target.value }
                  })}
                  className="w-full text-sm font-mono border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                  placeholder="https://..."
                />
              </div>

              {/* Category */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Category</label>
                <select
                  value={editModuleModal.data.category}
                  onChange={(e) => setEditModuleModal({
                    ...editModuleModal,
                    data: { ...editModuleModal.data, category: e.target.value }
                  })}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                >
                  <option value="transactions">Transactions</option>
                  <option value="inventory">Inventory</option>
                  <option value="marketing">Marketing</option>
                  <option value="learning">Learning</option>
                </select>
              </div>

              {/* Icon selector & Color */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Icon</label>
                  <button
                    type="button"
                    onClick={() => setIconPickerModal({
                      type: 'module',
                      onSelect: (ico) => setEditModuleModal({
                        ...editModuleModal,
                        data: { ...editModuleModal.data, icon: ico }
                      })
                    })}
                    className="w-full flex items-center justify-between gap-2 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    <span className="flex items-center gap-2">
                      {renderLucideIcon(editModuleModal.data.icon, "h-4 w-4 text-brand-navy")}
                      {editModuleModal.data.icon}
                    </span>
                    <Icons.Search className="h-4 w-4 text-gray-400" />
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 block mb-1">Hex Color</label>
                  <input
                    type="text"
                    value={editModuleModal.data.color}
                    onChange={(e) => setEditModuleModal({
                      ...editModuleModal,
                      data: { ...editModuleModal.data, color: e.target.value }
                    })}
                    className="w-full text-sm font-mono border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                    placeholder="#EC4899"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Module Visibility</label>
                <select
                  value={editModuleModal.data.visibility || (editModuleModal.data.adminOnly ? 'admin' : 'all')}
                  onChange={(e) => setEditModuleModal({
                    ...editModuleModal,
                    data: {
                      ...editModuleModal.data,
                      visibility: e.target.value as 'all' | 'admin' | 'broker' | 'admin_broker',
                      adminOnly: e.target.value === 'admin',
                    }
                  })}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                >
                  {MODULE_VISIBILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer pt-1 select-none">
                <input
                  type="checkbox"
                  checked={!!editModuleModal.data.showInNavigation}
                  onChange={(e) => setEditModuleModal({
                    ...editModuleModal,
                    data: { ...editModuleModal.data, showInNavigation: e.target.checked }
                  })}
                  className="rounded border-gray-300 text-brand-navy focus:ring-brand-navy"
                />
                <span className="text-xs font-semibold text-gray-600">Show this app in sidebar navigation</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => setEditModuleModal(null)}
                className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-xs font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const mods = [...(editSettings.customModules || [])]
                  if (editModuleModal.isNew) {
                    mods.push(editModuleModal.data)
                  } else {
                    mods[editModuleModal.index] = editModuleModal.data
                  }
                  setEditSettings({ ...editSettings, customModules: mods })
                  setEditModuleModal(null)
                }}
                className="px-4 py-2 bg-brand-navy text-white hover:bg-brand-navy-light rounded-xl text-xs font-semibold"
              >
                {editModuleModal.isNew ? 'Create App' : 'Apply Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT DIALOG: QUICK LINK ──────────────────────────────────── */}
      {editLinkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base">
                {editLinkModal.isNew ? 'Add Quick Link' : 'Edit Quick Link'}
              </h3>
              <button onClick={() => setEditLinkModal(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <Icons.X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Label */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Link Title</label>
                <input
                  type="text"
                  value={editLinkModal.data.label}
                  onChange={(e) => setEditLinkModal({
                    ...editLinkModal,
                    data: { ...editLinkModal.data, label: e.target.value }
                  })}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                  placeholder="e.g. Real Estate Board"
                />
              </div>

              {/* URL */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Destination URL</label>
                <input
                  type="text"
                  value={editLinkModal.data.url}
                  onChange={(e) => setEditLinkModal({
                    ...editLinkModal,
                    data: { ...editLinkModal.data, url: e.target.value }
                  })}
                  className="w-full text-sm font-mono border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">User Level Visibility</label>
                <select
                  value={editLinkModal.data.visibility || 'all'}
                  onChange={(e) => setEditLinkModal({
                    ...editLinkModal,
                    data: {
                      ...editLinkModal.data,
                      visibility: e.target.value as 'all' | UserRole | 'me',
                      ownerUserId: e.target.value === 'me' ? (editLinkModal.data.ownerUserId || user?.id) : editLinkModal.data.ownerUserId,
                    }
                  })}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                >
                  {QUICK_LINK_VISIBILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              {/* Icon Picker */}
              <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">Icon</label>
                <button
                  type="button"
                  onClick={() => setIconPickerModal({
                    type: 'link',
                    onSelect: (ico) => setEditLinkModal({
                      ...editLinkModal,
                      data: { ...editLinkModal.data, icon: ico }
                    })
                  })}
                  className="w-full flex items-center justify-between gap-2 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 hover:bg-gray-50"
                >
                  <span className="flex items-center gap-2">
                    {renderLucideIcon(editLinkModal.data.icon, "h-4 w-4 text-brand-navy")}
                    {editLinkModal.data.icon}
                  </span>
                  <Icons.Search className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <button
                onClick={() => setEditLinkModal(null)}
                className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-xs font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const links = [...(editSettings.quickLinks || [])]
                  if (editLinkModal.isNew) {
                    links.push(editLinkModal.data)
                  } else {
                    links[editLinkModal.index] = editLinkModal.data
                  }
                  setEditSettings({ ...editSettings, quickLinks: links })
                  setEditLinkModal(null)
                }}
                className="px-4 py-2 bg-brand-navy text-white hover:bg-brand-navy-light rounded-xl text-xs font-semibold"
              >
                {editLinkModal.isNew ? 'Add Link' : 'Apply Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ICON PICKER DIALOG (WITH SEARCH) ─────────────────────────── */}
      {iconPickerModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base">Select Visual Icon</h3>
              <button onClick={() => setIconPickerModal(null)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <Icons.X className="h-5 w-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search matching icons (e.g. house, link, award...)"
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-xl pl-9 pr-4 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                autoFocus
              />
            </div>

            {/* Visual Icon Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-60 overflow-y-auto p-1 scrollbar-hide border rounded-xl bg-gray-50">
              {filteredIcons.map((icoName) => {
                return (
                  <button
                    key={icoName}
                    type="button"
                    onClick={() => {
                      iconPickerModal.onSelect(icoName)
                      setIconPickerModal(null)
                      setIconSearch('')
                    }}
                    className="flex flex-col items-center justify-center p-3 rounded-lg border border-gray-100 bg-white hover:bg-brand-navy hover:text-white text-gray-700 transition-all hover:scale-105"
                  >
                    {renderLucideIcon(icoName, "h-5 w-5 mb-1.5 flex-shrink-0")}
                    <span className="text-[9px] font-medium text-center truncate w-full leading-tight">{icoName}</span>
                  </button>
                )
              })}
              {filteredIcons.length === 0 && (
                <p className="col-span-full py-8 text-center text-xs text-gray-400">No icons match "{iconSearch}"</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIconPickerModal(null)}
                className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-xs font-semibold text-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── USER QUICK LINKS EDITOR MODAL ──────────────────────────── */}
      {isEditingUserQuickLinks && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-gray-100 flex flex-col max-h-[85vh] space-y-4">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Customize My Quick Links</h3>
                <p className="text-xs text-gray-500">Edit or add personal dashboard quick links</p>
              </div>
              <button
                onClick={() => setIsEditingUserQuickLinks(false)}
                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <Icons.X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {draftUserQuickLinks.map((link, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl border border-gray-200 bg-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-gray-700">Link #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftUserQuickLinks(draftUserQuickLinks.filter((_, i) => i !== idx))
                      }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 block mb-1">Label</label>
                      <input
                        value={link.label}
                        onChange={(e) => {
                          const updated = [...draftUserQuickLinks]
                          updated[idx] = { ...updated[idx], label: e.target.value }
                          setDraftUserQuickLinks(updated)
                        }}
                        className="w-full text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                        placeholder="e.g. My Website"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 block mb-1">URL</label>
                      <input
                        value={link.url}
                        onChange={(e) => {
                          const updated = [...draftUserQuickLinks]
                          updated[idx] = { ...updated[idx], url: e.target.value }
                          setDraftUserQuickLinks(updated)
                        }}
                        className="w-full text-xs font-mono border border-gray-200 rounded-xl px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-navy"
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  setDraftUserQuickLinks([
                    ...draftUserQuickLinks,
                    {
                      id: `user_ql_${Date.now()}`,
                      label: 'New Link',
                      url: 'https://',
                      icon: 'Link',
                    }
                  ])
                }}
                className="w-full py-2.5 rounded-2xl border-2 border-dashed border-gray-200 hover:border-brand-navy text-brand-navy font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-brand-navy/5 transition-all"
              >
                <Icons.Plus className="h-4 w-4" /> Add Personal Quick Link
              </button>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <button
                type="button"
                onClick={resetUserQuickLinks}
                disabled={isSavingUserQuickLinks}
                className="text-xs text-gray-500 hover:text-gray-800 font-semibold underline"
              >
                Reset to Company Defaults
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingUserQuickLinks(false)}
                  className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-xs font-semibold text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveUserQuickLinks}
                  disabled={isSavingUserQuickLinks}
                  className="px-5 py-2 bg-brand-navy text-white hover:bg-brand-navy-light rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {isSavingUserQuickLinks ? 'Saving...' : 'Save Quick Links'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
