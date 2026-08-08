import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Briefcase, Plus, Search, DollarSign,
  CalendarDays, User, Pencil, Check, X, Building2,
  Save, X as XIcon,
  AlertTriangle, Clock, FileText, ExternalLink, Flag
} from 'lucide-react'

import { Layout } from '@/components/layout/Layout'
import { SkeletonTable } from '@/components/common/SkeletonLoader'
import { NewDealModal } from '@/components/transactions/NewDealModal'
import { StageGateModal } from '@/components/transactions/StageGateModal'
import { ListingDetailDrawer } from '@/components/transactions/ListingDetailDrawer'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/common/EmptyState'
import { KANBAN_STAGES, STATUS_FILTER_OPTIONS, STATUS_SELECT_OPTIONS, getStatusBadgeClass, getStatusDotClass } from '@/constants/pipeline'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'

// ── Types & Helpers ──────────────────────────────────────────────────────────
interface Transaction {
  id: string
  name: string
  type: string
  status: string
  price: number | null
  commission_amount: number | null
  target_close_date: string | null
  party_count: number
  assigned_to?: string | null
  inventory_listing_id?: string | null
  escrow_date?: string | null
  inspection_deadline?: string | null
  appraisal_date?: string | null
  commission_rate?: number | null
  commission_split_buyer_percent?: number | null
  commission_split_co_broker_percent?: number | null
  commission_split_referral_percent?: number | null
}

interface UserTarget {
  id: string
  name: string
  role: string
  email: string
}

function getUrgencyCue(targetCloseDate: string | null): { color: string; label: string } {
  if (!targetCloseDate) return { color: 'bg-gray-100 text-gray-500 border-gray-200', label: 'No Date' }
  const targetTime = new Date(targetCloseDate).getTime()
  const now = Date.now()
  const diffHours = (targetTime - now) / (1000 * 60 * 60)
  const diffDays = Math.ceil(diffHours / 24)

  if (diffHours < 0 || diffHours <= 48) {
    return { color: 'bg-red-100 text-red-700 border-red-200 font-extrabold animate-pulse', label: diffHours < 0 ? 'Overdue' : `< ${Math.max(1, Math.round(diffHours))}h Urgent` }
  }
  if (diffDays < 7) {
    return { color: 'bg-amber-100 text-amber-800 border-amber-200 font-bold', label: `< ${diffDays}d Upcoming` }
  }
  return { color: 'bg-emerald-100 text-emerald-800 border-emerald-200 font-semibold', label: 'On Track' }
}

// ── Risk Signal Helpers ──────────────────────────────────────────────────────
interface RiskSignal {
  type: 'closing_soon' | 'overdue_milestone' | 'missing_stage_gate'
  label: string
  color: string
  icon: any
}

function computeRiskSignals(t: Transaction): RiskSignal[] {
  const signals: RiskSignal[] = []
  const now = Date.now()

  // Closing soon (target close within 7 days)
  if (t.target_close_date) {
    const targetTime = new Date(t.target_close_date).getTime()
    const diffDays = Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24))
    if (diffDays >= 0 && diffDays <= 7) {
      signals.push({
        type: 'closing_soon',
        label: diffDays === 0 ? 'Closes today' : `${diffDays}d until close`,
        color: 'bg-amber-100 text-amber-800 border-amber-200',
        icon: Clock
      })
    }
  }

  // Overdue milestones
  const milestones = [
    { date: t.escrow_date, label: 'Escrow overdue' },
    { date: t.inspection_deadline, label: 'Inspection overdue' },
    { date: t.appraisal_date, label: 'Appraisal overdue' }
  ]
  for (const m of milestones) {
    if (m.date) {
      const milestoneTime = new Date(m.date).getTime()
      if (milestoneTime < now) {
        signals.push({
          type: 'overdue_milestone',
          label: m.label,
          color: 'bg-red-100 text-red-700 border-red-200',
          icon: AlertTriangle
        })
      }
    }
  }

  // Missing required stage-gate items (under_contract or closed)
  if (t.status === 'under_contract' || t.status === 'closed') {
    const missing: string[] = []
    if (!t.escrow_date) missing.push('Escrow date')
    if (!t.inspection_deadline) missing.push('Inspection deadline')
    if (!t.appraisal_date) missing.push('Appraisal date')
    if (missing.length > 0) {
      signals.push({
        type: 'missing_stage_gate',
        label: `Missing: ${missing.join(', ')}`,
        color: 'bg-red-100 text-red-700 border-red-200',
        icon: FileText
      })
    }
  }
  return signals
}

function getDaysUntilTargetClose(targetCloseDate: string | null): number | null {
  if (!targetCloseDate) return null
  const targetTime = new Date(targetCloseDate).getTime()
  const now = Date.now()
  return Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24))
}

// ── Built-in Views ───────────────────────────────────────────────────────────
type BuiltInView = 'all' | 'my_deals' | 'needs_attention' | 'missing_docs' | 'closing_soon'

const BUILT_IN_VIEWS: { value: BuiltInView; label: string; icon: any }[] = [
  { value: 'all', label: 'All Deals', icon: Briefcase },
  { value: 'my_deals', label: 'My Deals', icon: User },
  { value: 'needs_attention', label: 'Needs Attention', icon: Flag },
  { value: 'missing_docs', label: 'Missing Docs', icon: FileText },
  { value: 'closing_soon', label: 'Closing Soon', icon: Clock },
]

// ── Component ────────────────────────────────────────────────────────────────
export function TransactionsPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>(() => {
    return (localStorage.getItem('deal_pipeline_view') as 'list' | 'kanban') || 'kanban'
  })
  const changeView = (v: 'list' | 'kanban') => {
    setView(v)
    localStorage.setItem('deal_pipeline_view', v)
  }
  const [search, setSearch] = useState(() => searchParams.get('search') || searchParams.get('q') || '')
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'lease'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [createdByFilter, setCreatedByFilter] = useState<'all' | 'me' | string>('all')
  const [builtInView, setBuiltInView] = useState<BuiltInView>('all')
  const [users, setUsers] = useState<UserTarget[]>([])
  const [page, setPage] = useState(1)
  const [listings, setListings] = useState<any[]>([])
  const [goalTargets, setGoalTargets] = useState({ lead: 5, active: 3, under_contract: 2, closed: 1 })
  const [goalsLoaded, setGoalsLoaded] = useState(false)
  const [editingGoal, setEditingGoal] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const navigate = useNavigate()
  const [pageSize] = useState(20)

  // Filter presets state
  interface Preset {
    id: string
    name: string
    status: string
    type: 'all' | 'sale' | 'lease'
    createdBy: 'all' | 'me' | string
  }

  const [presets, setPresets] = useState<Preset[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [presetName, setPresetName] = useState('')
  const [showPresetInput, setShowPresetInput] = useState(false)

  // Load presets from localStorage when user changes
  useEffect(() => {
    if (!user?.id) {
      setPresets([])
      return
    }
    try {
      const stored = localStorage.getItem(`pipeline-filter-presets:${user.id}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const validPresets = parsed.filter((p): p is Preset =>
            typeof p === 'object' && p !== null &&
            typeof p.id === 'string' &&
            typeof p.name === 'string' &&
            p.name.trim().length > 0 &&
            p.name.trim().length <= 50 &&
            typeof p.status === 'string' &&
            ['all', 'sale', 'lease'].includes(p.type) &&
            typeof p.createdBy === 'string'
          )
          setPresets(validPresets)
          return
        }
      }
      setPresets([])
    } catch {
      setPresets([])
    }
  }, [user?.id])

  // Sorting state for list view
  type SortField = 'name' | 'status' | 'price' | 'party_count' | 'target_close_date'
  type SortDir = 'asc' | 'desc'
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return <span className="ml-1 text-gray-300">&#x25B4;&#x25BE;</span>
    return <span className="ml-1 text-blue-600">{sortDir === 'asc' ? '&#x25B4;' : '&#x25BE;'}</span>
  }

  // Stage-Gate Modal state
  const [stageGateDeal, setStageGateDeal] = useState<{ id: string; name: string; targetStage: string; escrow_date?: string | null; inspection_deadline?: string | null; appraisal_date?: string | null } | null>(null)

  // Off-Canvas Listing Drawer state
  const [drawerListingId, setDrawerListingId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Drag and Drop state for Kanban
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  const fetchTransactions = async () => {
    try {
      const params = new URLSearchParams()
      if (['admin', 'broker'].includes(user?.role || '') && createdByFilter !== 'all') {
        params.set('assigned_to', createdByFilter === 'me' ? (user?.id || '') : createdByFilter)
      }
      const res = await fetch(`/api/transactions${params.toString() ? `?${params.toString()}` : ''}`)
      const json = await res.json()
      if (json.success) {
        setTransactions(json.data || [])
      }
    } catch (e) {
      console.error('Failed to load transactions', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTransactions()
  }, [createdByFilter, user?.id, user?.role])

  useEffect(() => {
    if (user) {
      setCreatedByFilter('all')
    }
  }, [user?.id, user?.role])

  useEffect(() => {
    async function loadUsers() {
      if (!['admin', 'broker'].includes(user?.role || '')) {
        setUsers([])
        return
      }
      try {
        const res = await fetch('/api/contacts/tools/users')
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          setUsers(json.data)
        }
      } catch (e) {
        console.error('Failed to load users', e)
      }
    }
    loadUsers()
  }, [user])

  useEffect(() => {
    async function loadGoalTargets() {
      try {
        const res = await fetch('/api/user-settings?key=pipeline_goals')
        const json = await res.json()
        if (json.success && json.data?.value) {
          setGoalTargets(prev => ({ ...prev, ...JSON.parse(json.data.value) }))
        }
      } catch { /* use defaults */ }
      finally {
        setGoalsLoaded(true)
      }
    }
    loadGoalTargets()
  }, [])

  useEffect(() => {
    async function loadListings() {
      try {
        const res = await fetch('/api/listings')
        const json = await res.json()
        const data = json.listings || json.data || (Array.isArray(json) ? json : [])
        setListings(data)
      } catch (e) {
        console.error('Failed to load listings', e)
      }
    }
    loadListings()
  }, [])

  // Built-in view handler
  const applyBuiltInView = (view: BuiltInView) => {
    switch (view) {
      case 'my_deals':
        setCreatedByFilter('me')
        setStatusFilter('all')
        setTypeFilter('all')
        setSearch('')
        break
      case 'needs_attention':
        setStatusFilter('all')
        setTypeFilter('all')
        setCreatedByFilter('all')
        setSearch('')
        break
      case 'missing_docs':
        setStatusFilter('all')
        setTypeFilter('all')
        setCreatedByFilter('all')
        setSearch('')
        break
      case 'closing_soon':
        setStatusFilter('all')
        setTypeFilter('all')
        setCreatedByFilter('all')
        setSearch('')
        break
      default:
        setCreatedByFilter('all')
        setStatusFilter('all')
        setTypeFilter('all')
        setSearch('')
    }
    setActivePresetId(null)
  }

  // Preset handlers
  const savePreset = () => {
    const trimmedName = presetName.trim()
    if (!trimmedName || trimmedName.length > 50 || !user?.id) return

    const newPreset: Preset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: trimmedName,
      status: statusFilter,
      type: typeFilter,
      createdBy: createdByFilter,
    }

    const updatedPresets = [...presets, newPreset]
    setPresets(updatedPresets)
    setActivePresetId(newPreset.id)
    try {
      localStorage.setItem(`pipeline-filter-presets:${user.id}`, JSON.stringify(updatedPresets))
    } catch { /* ignore */ }
    setPresetName('')
    setShowPresetInput(false)
  }

  const applyPreset = (preset: Preset) => {
    applyingPresetRef.current = true
    setStatusFilter(preset.status)
    setTypeFilter(preset.type)
    setCreatedByFilter(preset.createdBy)
    setActivePresetId(preset.id)
  }

  const deletePreset = (id: string) => {
    const updatedPresets = presets.filter(p => p.id !== id)
    setPresets(updatedPresets)
    if (activePresetId === id) setActivePresetId(null)
    if (user?.id) {
      try {
        localStorage.setItem(`pipeline-filter-presets:${user.id}`, JSON.stringify(updatedPresets))
      } catch { /* ignore */ }
    }
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setTypeFilter('all')
    setCreatedByFilter('all')
    setBuiltInView('all')
    setActivePresetId(null)
  }

  const getListingName = (listingId: string | null | undefined) => {
    if (!listingId) return ''
    const listing = listings.find(l => l.id === listingId)
    return listing?.name || listing?.address || `Listing ${listingId.slice(0, 8)}`
  }

  const saveGoalTarget = useCallback(async (goalId: string, value: number) => {
    const next = { ...goalTargets, [goalId]: value }
    setGoalTargets(next)
    try {
      await fetch('/api/user-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'pipeline_goals', value: JSON.stringify(next) }),
      })
    } catch { /* ignore */ }
  }, [goalTargets])

  const filtered = useMemo(() => {
    let result = transactions.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'all' || t.type === typeFilter
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      return matchSearch && matchType && matchStatus
    })

    // Apply built-in view filters
    if (builtInView !== 'all') {
      const now = Date.now()
      result = result.filter(t => {
        switch (builtInView) {
          case 'my_deals':
            return createdByFilter === 'me' || t.assigned_to === user?.id
          case 'needs_attention':
            return computeRiskSignals(t).length > 0
          case 'missing_docs':
            if (t.status !== 'under_contract' && t.status !== 'closed') return false
            return !t.escrow_date || !t.inspection_deadline || !t.appraisal_date
          case 'closing_soon':
            if (!t.target_close_date) return false
            const targetTime = new Date(t.target_close_date).getTime()
            const diffDays = Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24))
            return diffDays >= 0 && diffDays <= 7
          default:
            return true
        }
      })
    }

    return result
  }, [transactions, search, typeFilter, statusFilter, createdByFilter, builtInView, user?.id])

  const sorted = useMemo(() => {
    if (!sortField) return filtered
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'status': {
          const orderA = KANBAN_STAGES.findIndex(s => s.value === a.status)
          const orderB = KANBAN_STAGES.findIndex(s => s.value === b.status)
          const aIdx = orderA >= 0 ? orderA : KANBAN_STAGES.length
          const bIdx = orderB >= 0 ? orderB : KANBAN_STAGES.length
          cmp = aIdx - bIdx
          break
        }
        case 'price': {
          const aVal = a.price
          const bVal = b.price
          const aValid = typeof aVal === 'number' && !Number.isNaN(aVal)
          const bValid = typeof bVal === 'number' && !Number.isNaN(bVal)
          if (!aValid || !bValid) {
            if (aValid) return -1
            if (bValid) return 1
            return 0
          }
          cmp = aVal - bVal
          break
        }
        case 'party_count':
          cmp = (a.party_count ?? 0) - (b.party_count ?? 0)
          break
        case 'target_close_date': {
          const aVal = a.target_close_date
          const bVal = b.target_close_date
          const aValid = aVal && !Number.isNaN(new Date(aVal).getTime())
          const bValid = bVal && !Number.isNaN(new Date(bVal).getTime())
          if (!aValid || !bValid) {
            if (aValid) return -1
            if (bValid) return 1
            return 0
          }
          cmp = new Date(aVal).getTime() - new Date(bVal).getTime()
          break
        }
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortField, sortDir])

  useEffect(() => {
    setPage(1)
  }, [search, view, createdByFilter, typeFilter, statusFilter])

  // Clear active preset indication when filters change manually
  const applyingPresetRef = useRef(false)
  useEffect(() => {
    if (!applyingPresetRef.current && activePresetId !== null) {
      setActivePresetId(null)
    }
    applyingPresetRef.current = false
  }, [statusFilter, typeFilter, createdByFilter, search, builtInView, activePresetId])

  // Clear active preset when user changes
  useEffect(() => {
    setActivePresetId(null)
  }, [user?.id])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pagedList = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  const getMetrics = () => {
    const active = transactions.filter(t => t.status === 'active' || t.status === 'offer_received' || t.status === 'under_contract').length
    const volume = transactions.filter(t => t.status !== 'closed' && t.status !== 'lead').reduce((sum, t) => sum + (t.price || 0), 0)
    const closedThisMonth = transactions.filter(t => t.status === 'closed').length

    let totalCommission = 0
    let agentSplit = 0
    let coBrokSplit = 0
    let referralSplit = 0

    const pipelineDeals = transactions.filter(t => t.status !== 'closed' && t.status !== 'lead')

    for (const t of pipelineDeals) {
      const price = t.price || 0
      let dealCommission = t.commission_amount || 0
      if (!dealCommission && price) {
        const rate = t.commission_rate !== undefined && t.commission_rate !== null ? t.commission_rate : 2.5
        dealCommission = price * (rate / 100)
      }
      totalCommission += dealCommission

      const agentPercent = t.commission_split_buyer_percent !== undefined && t.commission_split_buyer_percent !== null ? t.commission_split_buyer_percent : 70
      const coBrokePercent = t.commission_split_co_broker_percent !== undefined && t.commission_split_co_broker_percent !== null ? t.commission_split_co_broker_percent : 10
      const refPercent = t.commission_split_referral_percent !== undefined && t.commission_split_referral_percent !== null ? t.commission_split_referral_percent : 10

      agentSplit += dealCommission * (agentPercent / 100)
      coBrokSplit += dealCommission * (coBrokePercent / 100)
      referralSplit += dealCommission * (refPercent / 100)
    }

    const brokerageSplit = Math.max(0, totalCommission - agentSplit - coBrokSplit - referralSplit)

    return {
      active,
      volume,
      closedThisMonth,
      totalCommission,
      agentSplit,
      coBrokSplit,
      referralSplit,
      brokerageSplit
    }
  }

  const metrics = getMetrics()

  // Leading Indicators Goal metrics
  const goals = [
    { id: 'lead', label: 'Leads Generated', target: goalTargets.lead, current: transactions.filter(t => t.status === 'lead').length },
    { id: 'active', label: 'Active Pursuits', target: goalTargets.active, current: transactions.filter(t => t.status === 'active').length },
    { id: 'under_contract', label: 'New Contracts Signed', target: goalTargets.under_contract, current: transactions.filter(t => t.status === 'under_contract').length },
    { id: 'closed', label: 'Showings Completed', target: goalTargets.closed, current: transactions.filter(t => t.status === 'closed').length },
  ]

  // Handle stage change request
  const requestStageChange = (t: Transaction, nextStage: string) => {
    if (nextStage === 'under_contract' || nextStage === 'closed') {
      setStageGateDeal({ id: t.id, name: t.name, targetStage: nextStage, escrow_date: (t as any).escrow_date, inspection_deadline: (t as any).inspection_deadline, appraisal_date: (t as any).appraisal_date })
    } else {
      updateDealStage(t.id, nextStage)
    }
  }

  const updateDealStage = async (id: string, stage: string, milestones?: any) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: stage,
          ...(milestones?.escrowDate && { escrow_date: milestones.escrowDate }),
          ...(milestones?.inspectionDeadline && { inspection_deadline: milestones.inspectionDeadline }),
          ...(milestones?.appraisalDate && { appraisal_date: milestones.appraisalDate }),
        }),
      })
      const json = await res.json()
      if (json.success) {
        fetchTransactions()
      }
    } catch (e) {
      console.error('Failed to update stage', e)
    }
  }

  return (
    <Layout title="Deals Pipeline">
      <div className="flex flex-col">

        {/* Header & Metrics */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Active Deals</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.active}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Pipeline Volume</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-bold text-gray-900">${metrics.volume.toLocaleString()}</p>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    {metrics.active > 0 ? `Avg $${Math.round(metrics.volume / Math.max(1, metrics.active)).toLocaleString()}/deal` : '0 active'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Closed (30d)</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.closedThisMonth}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Visual Fee Split Panel */}
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h4 className="font-bold text-gray-900 text-sm">Visual Co-Brokerage & Agent Splits</h4>
              <p className="text-xs text-gray-500">Estimated commission breakdown of active transaction volume</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-gray-900">Total Volume: ${metrics.volume.toLocaleString()}</p>
              <p className="text-[10px] text-emerald-600 font-extrabold uppercase">Total Commission: ${metrics.totalCommission.toLocaleString()}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="h-4 w-full bg-gray-100 rounded-full overflow-hidden flex">
              <div style={{ width: metrics.totalCommission > 0 ? `${(metrics.agentSplit / metrics.totalCommission) * 100}%` : '70%' }} className="bg-[#0F2040] h-full" title="Agent Split" />
              <div style={{ width: metrics.totalCommission > 0 ? `${(metrics.brokerageSplit / metrics.totalCommission) * 100}%` : '20%' }} className="bg-[#C9A84C] h-full" title="Brokerage Split" />
              <div style={{ width: metrics.totalCommission > 0 ? `${(metrics.coBrokSplit / metrics.totalCommission) * 100}%` : '10%' }} className="bg-amber-400 h-full" title="Co-broke Split" />
              <div style={{ width: metrics.totalCommission > 0 ? `${(metrics.referralSplit / metrics.totalCommission) * 100}%` : '0%' }} className="bg-purple-600 h-full" title="Referrals Paid" />
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-[#0F2040] block" />
                <span className="text-gray-700">Agent Split: ${metrics.agentSplit.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-[#C9A84C] block" />
                <span className="text-gray-700">Brokerage Split: ${metrics.brokerageSplit.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-amber-400 block" />
                <span className="text-gray-700">Co-broke: ${metrics.coBrokSplit.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-purple-600 block" />
                <span className="text-gray-700">Referrals Paid: ${metrics.referralSplit.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search deals..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            {/* Status & Type Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white text-gray-700"
            >
              <option value="all">All Statuses</option>
              {STATUS_FILTER_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white text-gray-700"
            >
              <option value="all">All Types</option>
              <option value="sale">Sale</option>
              <option value="lease">Lease</option>
            </select>
            {/* Built-in Views */}
            <select
              value={builtInView}
              onChange={(e) => {
                const view = e.target.value as BuiltInView
                setBuiltInView(view)
                applyBuiltInView(view)
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white text-gray-700"
            >
              {BUILT_IN_VIEWS.map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {['admin', 'broker'].includes(user?.role || '') && (
              <select
                value={createdByFilter}
                onChange={(e) => setCreatedByFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
              >
                <option value="me">Created by me</option>
                <option value="all">All users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            )}
            <div className="flex items-center rounded-lg border border-gray-300 bg-white p-1">
              <button
                onClick={() => changeView('list')}
                className={clsx(
                  "px-3 py-1.5 text-sm font-medium rounded-md",
                  view === 'list' ? "bg-gray-100 text-gray-900 font-bold" : "text-gray-500 hover:text-gray-700"
                )}
              >
                List
              </button>
              <button
                onClick={() => changeView('kanban')}
                className={clsx(
                  "px-3 py-1.5 text-sm font-medium rounded-md",
                  view === 'kanban' ? "bg-gray-100 text-gray-900 font-bold" : "text-gray-500 hover:text-gray-700"
                )}
              >
                Board
              </button>
            </div>
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              New Deal
            </button>
          </div>
        </div>

        {/* Saved Filter Presets */}
        {user?.id && presets.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Presets:</span>
            {presets.map((preset) => (
              <span key={preset.id} className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={clsx(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                    activePresetId === preset.id
                      ? "bg-blue-50 border-blue-300 text-blue-800 shadow-sm"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                  aria-pressed={activePresetId === preset.id}
                >
                  {preset.name}
                </button>
                <button
                  type="button"
                  onClick={() => deletePreset(preset.id)}
                  className="flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={`Delete preset ${preset.name}`}
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Save New Preset */}
        {user?.id && (
          <div className="mb-4 flex items-center gap-2">
            {showPresetInput ? (
              <form onSubmit={(e) => { e.preventDefault(); savePreset() }} className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Preset name (max 50 chars)"
                  maxLength={50}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!presetName.trim() || presetName.trim().length > 50}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setPresetName(''); setShowPresetInput(false) }}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  aria-label="Cancel"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowPresetInput(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                <Save className="h-4 w-4" />
                Save Current Filters as Preset
              </button>
            )}
          </div>
        )}

        {/* Weekly Leading Indicator Pipeline Goals */}
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Weekly Leading Indicator Goals</h3>
              <p className="text-xs text-gray-500">Track high-leverage sales activities driving closings</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {!goalsLoaded ? (
              [1, 2, 3, 4].map(n => (
                <div key={n} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3 h-[60px] animate-pulse flex flex-col justify-between">
                  <div className="h-3 w-20 bg-gray-200 rounded"></div>
                  <div className="h-1.5 rounded-full bg-gray-200"></div>
                </div>
              ))
            ) : goals.map((goal) => {
              const pct = Math.min(100, Math.round((goal.current / goal.target) * 100))
              const done = goal.current >= goal.target
              const isEditing = editingGoal === goal.id
              return (
                <div key={goal.id} className="rounded-xl border border-blue-100 bg-white p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-800">{goal.label}</p>
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={editingValue}
                          onChange={e => setEditingValue(e.target.value)}
                          className="w-12 text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') { saveGoalTarget(goal.id, Math.max(1, parseInt(editingValue) || 1)); setEditingGoal(null) }
                            if (e.key === 'Escape') setEditingGoal(null)
                          }}
                        />
                        <button onClick={() => { saveGoalTarget(goal.id, Math.max(1, parseInt(editingValue) || 1)); setEditingGoal(null) }} className="text-emerald-600 hover:text-emerald-800">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setEditingGoal(null)} className="text-gray-400 hover:text-gray-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingGoal(goal.id); setEditingValue(String(goal.target)) }}
                        className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 ${done ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700'} hover:bg-blue-100 transition-colors`}
                        title="Click to edit target"
                      >
                        {goal.current}/{goal.target}
                        <Pencil className="h-2.5 w-2.5 opacity-60" />
                      </button>
                    )}
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Pipeline Content */}
        {isLoading ? (
          <div className="py-6 px-4">
            <SkeletonTable rows={7} cols={5} />
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {view === 'list' ? (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-sm min-w-[750px]">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">
                      <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none focus:underline">
                        Deal Name{sortIndicator('name')}
                      </button>
                    </th>
                    <th className="px-6 py-3 font-medium">
                      <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none focus:underline">
                        Status{sortIndicator('status')}
                      </button>
                    </th>
                    <th className="px-6 py-3 font-medium">
                      <button type="button" onClick={() => handleSort('price')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none focus:underline">
                        Price{sortIndicator('price')}
                      </button>
                    </th>
                    <th className="px-6 py-3 font-medium">
                      <button type="button" onClick={() => handleSort('party_count')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none focus:underline">
                        Parties{sortIndicator('party_count')}
                      </button>
                    </th>
                    <th className="px-6 py-3 font-medium">
                      <button type="button" onClick={() => handleSort('target_close_date')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none focus:underline">
                        Target Close & Urgency{sortIndicator('target_close_date')}
                      </button>
                    </th>
                    <th className="px-6 py-3 font-medium">Risk Signals</th>
                    <th className="px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16">
                        {transactions.length === 0 ? (
                          <EmptyState
                            icon={Plus}
                            title="No deals in your pipeline"
                            description="Create your first deal to get started."
                            ctaLabel="Create your first deal"
                            onCTA={() => setIsNewModalOpen(true)}
                          />
                        ) : (
                          <EmptyState
                            icon={Search}
                            title="No matching deals found"
                            description="Try clearing some filters or adjusting your search."
                            ctaLabel="Clear filters"
                            onCTA={clearFilters}
                          />
                        )}
                      </td>
                    </tr>
                  ) : (
                    pagedList.map((t) => {
                      const urgency = getUrgencyCue(t.target_close_date)
                      const riskSignals = computeRiskSignals(t)
                      const daysUntilClose = getDaysUntilTargetClose(t.target_close_date)

                      return (
                        <tr
                          key={t.id}
                          onClick={() => navigate(`/transactions/${t.id}`)}
                          className="hover:bg-gray-50 group cursor-pointer transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-900">{t.name}</span>
                              {t.inventory_listing_id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDrawerListingId(t.inventory_listing_id!)
                                    setIsDrawerOpen(true)
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full border border-blue-200 transition-colors"
                                  title="Click to view linked property details off-canvas"
                                >
                                  <Building2 className="h-3 w-3" /> {getListingName(t.inventory_listing_id)}
                                </button>
                              )}
                            </div>
                            <div className="text-gray-500 text-xs capitalize mt-0.5">
                              <span>{t.type}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <select
                              value={t.status}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => requestStageChange(t, e.target.value)}
                              className={clsx(
                                "rounded-full px-2.5 py-1 text-xs font-bold border focus:outline-none cursor-pointer",
                                getStatusBadgeClass(t.status)
                              )}
                            >
                              {STATUS_SELECT_OPTIONS.map(s => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4 text-gray-900 font-bold">
                            {t.price ? `$${t.price.toLocaleString()}` : '—'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            <div className="flex items-center gap-1.5">
                              <User className="h-4 w-4 text-gray-400" />
                              {t.party_count}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-700 font-medium">{t.target_close_date || '—'}</span>
                              {t.target_close_date && (
                                <span className={clsx("px-2 py-0.5 rounded-full text-[10px] border", urgency.color)}>
                                  {urgency.label}
                                </span>
                              )}
                              {daysUntilClose !== null && daysUntilClose >= 0 && daysUntilClose <= 7 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                                  {daysUntilClose === 0 ? 'Today' : `${daysUntilClose}d`}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1.5">
                              {riskSignals.map((signal, idx) => (
                                <span
                                  key={idx}
                                  className={clsx("px-2 py-0.5 rounded-full text-[10px] font-medium border flex items-center gap-1", signal.color)}
                                >
                                  <signal.icon className="h-3 w-3" />
                                  {signal.label}
                                </span>
                              ))}
                              {riskSignals.length === 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1">
                                  <Check className="h-3 w-3" />
                                  On track
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/transactions/${t.id}`) }}
                                className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                title="Open Deal"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            ) : (
              /* Draggable Kanban View */
              filtered.length === 0 ? (
                <div className="p-6 bg-gray-50 flex gap-4 overflow-x-auto min-h-[520px]">
                  <div className="flex-1 min-w-[270px] flex items-center justify-center">
                    {transactions.length === 0 ? (
                      <EmptyState
                        icon={Plus}
                        title="No deals in your pipeline"
                        description="Create your first deal to get started."
                        ctaLabel="Create your first deal"
                        onCTA={() => setIsNewModalOpen(true)}
                      />
                    ) : (
                      <EmptyState
                        icon={Search}
                        title="No matching deals found"
                        description="Try clearing some filters or adjusting your search."
                        ctaLabel="Clear filters"
                        onCTA={clearFilters}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-gray-50 flex gap-4 overflow-x-auto min-h-[520px]">
                  {KANBAN_STAGES.map((col) => {
                  const colDeals = filtered.filter(t => t.status === col.value)
                  const isColumnTarget = dragOverCol === col.value

                  return (
                    <div
                      key={col.value}
                      onDragOver={(e) => {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverCol(col.value)
                      }}
                      onDragLeave={() => {
                        if (dragOverCol === col.value) setDragOverCol(null)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOverCol(null)
                        const dealId = e.dataTransfer.getData('dealId') || draggedDealId
                        if (dealId) {
                          const deal = transactions.find(t => t.id === dealId)
                          if (deal && deal.status !== col.value) {
                            requestStageChange(deal, col.value)
                          }
                        }
                        setDraggedDealId(null)
                      }}
                      className={clsx(
                        "flex-1 min-w-[270px] bg-white rounded-2xl border transition-all duration-300 shadow-sm p-4 flex flex-col",
                        isColumnTarget ? "border-blue-500 bg-blue-50/30 ring-2 ring-blue-400/60 shadow-lg scale-[1.01]" : "border-gray-200"
                      )}
                    >
                      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                        <span className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                          <span className={clsx("h-2.5 w-2.5 rounded-full", getStatusDotClass(col.value))} />
                          {col.label}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                          {colDeals.length}
                        </span>
                      </div>

<div className="space-y-3 overflow-y-auto flex-1 max-h-[600px] pr-1">
                        {colDeals.map((t) => {
                          const urgency = getUrgencyCue(t.target_close_date)
                          const riskSignals = computeRiskSignals(t)
                          const daysUntilClose = getDaysUntilTargetClose(t.target_close_date)
                          const isBeingDragged = draggedDealId === t.id

                          return (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => {
                                e.stopPropagation()
                                setDraggedDealId(t.id)
                                e.dataTransfer.setData('dealId', t.id)
                                e.dataTransfer.effectAllowed = 'move'
                              }}
                              onDragEnd={() => {
                                setDraggedDealId(null)
                                setDragOverCol(null)
                              }}
                              onClick={() => navigate(`/transactions/${t.id}`)}
                              className={clsx(
                                "bg-white border rounded-xl p-4 shadow-xs cursor-grab active:cursor-grabbing transition-all duration-200 group relative select-none",
                                isBeingDragged ? "opacity-30 scale-95 border-blue-400 border-dashed bg-blue-50 shadow-inner" : "hover:bg-gray-50/80 hover:border-gray-300 hover:-translate-y-0.5 hover:shadow-md"
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors text-xs truncate">{t.name}</p>
                                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">{t.type}</span>
                              </div>

                              {t.inventory_listing_id && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDrawerListingId(t.inventory_listing_id!)
                                    setIsDrawerOpen(true)
                                  }}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 mt-2 transition-colors"
                                >
                                  <Building2 className="h-3 w-3 text-blue-600" />
                                  <span className="truncate max-w-[160px]">Linked Listing: {getListingName(t.inventory_listing_id)}</span>
                                </button>
                              )}

                              {/* Risk Signals */}
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {riskSignals.map((signal, idx) => (
                                  <span
                                    key={idx}
                                    className={clsx("px-1.5 py-0.5 rounded-full text-[9px] font-medium border flex items-center gap-1", signal.color)}
                                  >
                                    <signal.icon className="h-2.5 w-2.5" />
                                    {signal.label}
                                  </span>
                                ))}
                                {riskSignals.length === 0 && (
                                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center gap-1">
                                    <Check className="h-2.5 w-2.5" />
                                    On track
                                  </span>
                                )}
                              </div>

                              {daysUntilClose !== null && daysUntilClose >= 0 && daysUntilClose <= 7 && (
                                <div className="mt-2 px-2 py-1 rounded bg-amber-50 border border-amber-200">
                                  <div className="flex items-center gap-1 text-[10px] font-medium text-amber-800">
                                    <Clock className="h-3 w-3" />
                                    {daysUntilClose === 0 ? 'Closes today' : `${daysUntilClose}d until close`}
                                  </div>
                                </div>
                              )}

                              <div className="mt-4 flex items-end justify-between">
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Target Close</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-[11px] text-gray-700 font-bold">{t.target_close_date || '—'}</span>
                                    {t.target_close_date && (
                                      <span className={clsx("px-1.5 py-0.5 rounded-full text-[9px] border", urgency.color)}>
                                        {urgency.label}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="font-extrabold text-gray-900 text-sm">{t.price ? `$${t.price.toLocaleString()}` : '—'}</p>
                              </div>

                              {/* Action Buttons */}
                              <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); navigate(`/transactions/${t.id}`) }}
                                  className="px-2 py-1 text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                                  title="Open Deal"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {/* Stage Change Controls */}
                              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                                <span className="text-[9px] font-medium text-gray-400">Drag or Move:</span>
                                <select
                                  value={t.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => requestStageChange(t, e.target.value)}
                                  className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 font-bold text-gray-700 focus:outline-none"
                                >
                                  {STATUS_SELECT_OPTIONS.map(s => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          )
                        })}
                        {colDeals.length === 0 && (
                          <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs italic">
                            Drag deals here
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}

            {view === 'list' && filtered.length > 0 && (
              <Pagination
                page={page}
                totalPages={totalPages}
                totalItems={filtered.length}
                pageSize={pageSize}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </div>

      {/* New Deal Modal */}
      {isNewModalOpen && (
        <NewDealModal
          onClose={() => setIsNewModalOpen(false)}
          onSuccess={() => {
            setIsNewModalOpen(false)
            fetchTransactions()
          }}
        />
      )}

      {/* Stage Gate Compliance Modal */}
      {stageGateDeal && (
        <StageGateModal
          isOpen={!!stageGateDeal}
          targetStage={stageGateDeal.targetStage}
          transactionName={stageGateDeal.name}
          initialValues={{
            escrowDate: stageGateDeal.escrow_date || '',
            inspectionDeadline: stageGateDeal.inspection_deadline || '',
            appraisalDate: stageGateDeal.appraisal_date || '',
          }}
          onClose={() => setStageGateDeal(null)}
          onSubmit={(milestones) => {
            updateDealStage(stageGateDeal.id, stageGateDeal.targetStage, milestones)
            setStageGateDeal(null)
          }}
        />
      )}

      {/* Off-Canvas Linked Listing Drawer */}
      <ListingDetailDrawer
        listingId={drawerListingId}
        isOpen={isDrawerOpen}
        onClose={() => {
          setIsDrawerOpen(false)
          setDrawerListingId(null)
        }}
      />
    </Layout>
  )
}
