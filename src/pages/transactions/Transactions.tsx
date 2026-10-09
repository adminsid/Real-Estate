import { CloseLinkedListingPrompt, type LinkedListingClose } from '@/components/transactions/CloseLinkedListingPrompt'
import { workflowPhases } from '@/domain/workflow-template'
import { TransactionResults } from '@/components/transactions/TransactionResults'
import { brokerageToday, isDateOnly, inPeriod, reportingPeriod } from '../../domain/reporting-period'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Briefcase, Plus, Search,
  CalendarDays, Check, X, Building2,
  AlertTriangle, Clock, FileText, Flag, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Shield, Archive,
  Target, TrendingUp, RefreshCw, CheckCircle2, AlertCircle
} from 'lucide-react'
import { AgentFilterDropdown } from '@/components/transactions/AgentFilterDropdown'

import { Layout } from '@/components/layout/Layout'
import { SkeletonTable } from '@/components/common/SkeletonLoader'
import { NewDealModal } from '@/components/transactions/NewDealModal'
import { StageGateModal } from '@/components/transactions/StageGateModal'
import { ListingDetailDrawer } from '@/components/transactions/ListingDetailDrawer'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/common/EmptyState'
import { KANBAN_STAGES, STATUS_FILTER_OPTIONS, STATUS_SELECT_OPTIONS, getStatusBadgeClass, getStatusDotClass, getStageByStatus } from '@/constants/pipeline'
import { OPEN_PIPELINE_STATUSES, NON_CLOSED_STATUSES } from '@/lib/transactionStatus'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import { getDaysUntilDate } from '@/utils/date'
import { dealCommission } from '@/lib/commissionMetrics'

// ── Types & Helpers ──────────────────────────────────────────────────────────
interface Transaction {
  actual_close_date?: string | null
  revision?: number
  workflow_key?: string
  id: string
  name: string
  type: string
  status: string
  price: number | null
  financial_price_label?: string
  financials_state?: string
  financials_version?: number
  my_compensation?: number | null
  agent_compensation?: number | null
  company_retention?: number | null
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



// ── Deal Health Helper ───────────────────────────────────────────────────────
interface DealHealthSignal {
  label: string
  color: string
  icon: any
}

function computeDealHealth(t: Transaction): DealHealthSignal {
  if (t.status === 'closed') {
    return {
      label: 'Closed',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: Check
    }
  }

  if (t.status === 'cancelled') {
    return {
      label: 'Cancelled',
      color: 'bg-gray-100 text-gray-600 border-gray-200',
      icon: X
    }
  }

  // Closing soon or overdue target close
  if (t.target_close_date) {
    const diffDays = getDaysUntilDate(t.target_close_date)
    if (diffDays !== null) {
      if (diffDays === 0) {
        return {
          label: 'Closes Today',
          color: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
          icon: Clock
        }
      }
      if (diffDays > 0 && diffDays <= 7) {
        return {
          label: `${diffDays}d to close`,
          color: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
          icon: Clock
        }
      }
      if (diffDays < 0) {
        return {
          label: 'Close Overdue',
          color: 'bg-rose-50 text-rose-700 border-rose-200 font-semibold',
          icon: AlertTriangle
        }
      }
    }
  }

  return {
    label: 'On Track',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: Check
  }
}

function getDaysUntilTargetClose(targetCloseDate: string | null): number | null {
  return getDaysUntilDate(targetCloseDate)
}

// ── Built-in Views ───────────────────────────────────────────────────────────
type BuiltInView = 'all' | 'my_deals' | 'needs_attention' | 'missing_docs' | 'closing_soon'

const BUILT_IN_VIEWS: { value: BuiltInView; label: string; icon: any }[] = [
  { value: 'all', label: 'All Deals', icon: Briefcase },
  { value: 'my_deals', label: 'My Deals', icon: Briefcase },
  { value: 'needs_attention', label: 'Needs Attention', icon: Flag },
  { value: 'missing_docs', label: 'Missing Docs', icon: FileText },
  { value: 'closing_soon', label: 'Closing Soon', icon: Clock },
]

// ── Component ────────────────────────────────────────────────────────────────
export function TransactionsPage() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [linkedListingClose, setLinkedListingClose] = useState<LinkedListingClose | null>(null)
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
  const [timeHorizon, setTimeHorizon] = useState<'active' | 'closed_ytd' | 'vault'>('active')
  const [vaultYear, setVaultYear] = useState<number>(2025)
  const [vaultQuarter, setVaultQuarter] = useState<'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('all')

  const currentYear = Number(brokerageToday().slice(0, 4))
  const getDealYear = useCallback((t: Transaction) => {
    return isDateOnly(t.actual_close_date) ? Number(t.actual_close_date.slice(0, 4)) : 0
  }, [])
  const getDealQuarter = useCallback((t: Transaction) => {
    return isDateOnly(t.actual_close_date) ? `Q${Math.ceil(Number(t.actual_close_date.slice(5, 7)) / 3)}` : null
  }, [])

  const [search, setSearch] = useState(() => searchParams.get('search') || searchParams.get('q') || '')
  const [typeFilter, setTypeFilter] = useState<'all' | 'sale' | 'lease'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [createdByFilter, setCreatedByFilter] = useState<'all' | 'me' | string>('all')
  const [builtInView, setBuiltInView] = useState<BuiltInView>('all')
  const [users, setUsers] = useState<UserTarget[]>([])
  const [page, setPage] = useState(1)
  const [listings, setListings] = useState<any[]>([])
  const [isSyncingListings, setIsSyncingListings] = useState(false)
  const [listingSyncMessage, setListingSyncMessage] = useState<string | null>(null)
  const navigate = useNavigate()
  const [pageSize] = useState(20)

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
    if (sortField !== field) return <ArrowUpDown className="ml-1 h-3 w-3 text-gray-400 inline" />
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 h-3 w-3 text-blue-600 inline font-bold" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3 text-blue-600 inline font-bold" />
    )
  }

  // Stage-Gate Modal state
  const [stageGateDeal, setStageGateDeal] = useState<{
    id: string
    name: string
    targetStage: string
    workflow_key?: string
    escrow_date?: string | null
    inspection_deadline?: string | null
    appraisal_date?: string | null
    attorney_review_start_date?: string | null
    pending_date?: string | null
    home_inspection_date?: string | null
    closing_date?: string | null
    actual_close_date?: string | null
  } | null>(null)

  // Off-Canvas Listing Drawer state
  const [drawerListingId, setDrawerListingId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  // Drag and Drop state for Kanban
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | null>(null)

  // Floating Undo Toast & Inline Error states
  const [stageToast, setStageToast] = useState<{
    dealId: string
    dealName: string
    prevStage: string
    newStage: string
  } | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!stageToast) return
    const timer = setTimeout(() => setStageToast(null), 6000)
    return () => clearTimeout(timer)
  }, [stageToast])

  useEffect(() => {
    if (!errorMessage) return
    const timer = setTimeout(() => setErrorMessage(null), 6000)
    return () => clearTimeout(timer)
  }, [errorMessage])

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

  const syncMyListings = async () => {
    setIsSyncingListings(true)
    setListingSyncMessage(null)
    try {
      const res = await fetch('/api/transactions/sync-listings', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Unable to sync listings')
      }
      const imported = Number(json.data?.imported || 0)
      const skipped = Number(json.data?.skippedExisting || 0)
      setListingSyncMessage(imported > 0
        ? `${imported} listing${imported === 1 ? '' : 's'} added to your deals.`
        : skipped > 0
          ? 'Your eligible listings are already in Transactions.'
          : 'No Inventory listings matched your account email.')
      await fetchTransactions()
    } catch (error) {
      setListingSyncMessage(error instanceof Error ? error.message : 'Unable to sync listings')
    } finally {
      setIsSyncingListings(false)
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
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setTypeFilter('all')
    setCreatedByFilter('all')
    setBuiltInView('all')
  }

  const getListingName = (listingId: string | null | undefined) => {
    if (!listingId) return ''
    const listing = listings.find(l => l.id === listingId)
    return listing?.name || listing?.address || `Listing ${listingId.slice(0, 8)}`
  }



  const filtered = useMemo(() => {
    let result = transactions.filter(t => {
      // 1. Time Horizon Filter
      if (timeHorizon === 'active') {
        const isNonActive = t.status === 'closed' || t.status === 'cancelled' || t.status === 'fallen_through' || t.status === 'archived'
        if (isNonActive) return false
      } else if (timeHorizon === 'closed_ytd') {
        if (t.status !== 'closed' || !inPeriod(t.actual_close_date, reportingPeriod('ytd'))) return false
      } else if (timeHorizon === 'vault') {
        const dealYear = getDealYear(t)
        const isHistorical = (t.status === 'closed' || t.status === 'cancelled' || t.status === 'fallen_through' || t.status === 'archived') || dealYear < currentYear
        if (!isHistorical || dealYear !== vaultYear) return false
        if (vaultQuarter !== 'all' && getDealQuarter(t) !== vaultQuarter) return false
      }

      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'all' || t.type === typeFilter
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      return matchSearch && matchType && matchStatus
    })

    // Apply built-in view filters
    if (builtInView !== 'all') {
      result = result.filter(t => {
        switch (builtInView) {
          case 'my_deals':
            return createdByFilter === 'me' || t.assigned_to === user?.id
          case 'needs_attention':
            return computeDealHealth(t).label !== 'On Track' && computeDealHealth(t).label !== 'Closed'
          case 'missing_docs':
            if (t.status !== 'under_contract' && t.status !== 'closed') return false
            return !t.escrow_date || !t.inspection_deadline || !t.appraisal_date
          case 'closing_soon': {
            const diffDays = getDaysUntilDate(t.target_close_date)
            return diffDays !== null && diffDays >= 0 && diffDays <= 7
          }
          default:
            return true
        }
      })
    }

    return result
  }, [transactions, timeHorizon, vaultYear, vaultQuarter, search, typeFilter, statusFilter, createdByFilter, builtInView, user?.id, getDealYear, getDealQuarter, currentYear])

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

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const pagedList = useMemo(() => {
    const start = (page - 1) * pageSize
    return sorted.slice(start, start + pageSize)
  }, [sorted, page, pageSize])

  const getMetrics = () => {
    const active = sorted.filter(t => OPEN_PIPELINE_STATUSES.includes(t.status as any)).length
    const volume = sorted.filter(t => NON_CLOSED_STATUSES.includes(t.status as any)).reduce((sum, t) => sum + (t.price || 0), 0)
    const closedThisMonth = sorted.filter(t => t.status === 'closed').length

    let totalCommission = 0
    let agentSplit = 0
    let coBrokSplit = 0
    let referralSplit = 0

    const commissionDeals = timeHorizon === 'closed_ytd'
      ? sorted.filter(t => t.status === 'closed')
      : sorted.filter(t => t.status !== 'closed' && t.status !== 'lead' && t.status !== 'fallen_through' && t.status !== 'cancelled' && t.status !== 'archived')

    for (const t of commissionDeals) {
      const commission = dealCommission(t)
      totalCommission += user && ['admin','broker'].includes(user.role) ? commission : (t.my_compensation ?? 0)

      agentSplit += t.agent_compensation ?? 0
    }

    const brokerageSplit = commissionDeals.reduce((sum, t) => sum + (t.company_retention ?? 0), 0)

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

  const activeCount = transactions.filter(t => t.status !== 'closed' && t.status !== 'cancelled' && t.status !== 'fallen_through' && t.status !== 'archived').length
  const closedYtdCount = transactions.filter(t => t.status === 'closed' && inPeriod(t.actual_close_date, reportingPeriod('ytd'))).length
  const vaultCount = transactions.filter(t => (t.status === 'closed' || t.status === 'cancelled' || t.status === 'fallen_through' || t.status === 'archived') && getDealYear(t) < currentYear).length

  // Agent deal count map for AgentFilterDropdown
  const dealCountByAgent = useMemo(() => {
    const map: Record<string, number> = {}
    for (const t of transactions) {
      if (t.assigned_to) map[t.assigned_to] = (map[t.assigned_to] || 0) + 1
    }
    return map
  }, [transactions])

  // Handle stage change request (frictionless drag & drop + select)
  const requestStageChange = (t: Transaction, nextStage: string) => {
    if (t.status === nextStage) return
    const prevStage = t.status
    updateDealStage(
      t.id,
      nextStage,
      {
        ...(nextStage === 'closed' && {
          closingDate: (t as any).actual_close_date || (t as any).closing_date || new Date().toISOString().slice(0, 10),
        }),
      },
      { dealName: t.name, prevStage }
    )
  }

  const handleUndoStageChange = () => {
    if (!stageToast) return
    const { dealId, prevStage } = stageToast
    setStageToast(null)
    updateDealStage(dealId, prevStage)
  }

  const updateDealStage = async (id: string, stage: string, milestones?: any, undoMeta?: { dealName: string; prevStage: string }) => {
    try {
      setErrorMessage(null)
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_revision: transactions.find(t => t.id === id)?.revision,
          status: stage,
          ...(milestones?.escrowDate && { escrow_date: milestones.escrowDate }),
          ...(milestones?.inspectionDeadline && { inspection_deadline: milestones.inspectionDeadline }),
          ...(milestones?.appraisalDate && { appraisal_date: milestones.appraisalDate }),
          ...(milestones?.attorneyReviewStartDate && { attorney_review_start_date: milestones.attorneyReviewStartDate }),
          ...(milestones?.boardSubmissionDate && { pending_date: milestones.boardSubmissionDate }),
          ...(milestones?.walkthroughDate && { home_inspection_date: milestones.walkthroughDate }),
          ...(milestones?.closingDate && { closing_date: milestones.closingDate, actual_close_date: milestones.closingDate }),
        }),
      })
      const json = await res.json()
      if (res.ok && json.success) {
        const deal = transactions.find(transaction => transaction.id === id)
        const closeDate = milestones?.closingDate || deal?.actual_close_date || new Date().toISOString().slice(0, 10)
        if (stage === 'closed' && deal?.status !== 'closed' && deal?.inventory_listing_id && closeDate) {
          setLinkedListingClose({ listingId: deal.inventory_listing_id, dealName: deal.name, closeDate })
        }
        if (undoMeta) {
          setStageToast({
            dealId: id,
            dealName: undoMeta.dealName,
            prevStage: undoMeta.prevStage,
            newStage: stage,
          })
        }
        fetchTransactions()
      } else {
        setErrorMessage(json.error || 'Failed to update deal stage')
      }
    } catch (e: any) {
      console.error('Failed to update stage', e)
      setErrorMessage(e.message || 'An unexpected error occurred while updating deal stage')
    }
  }

  return (
    <Layout title="Deals">
      <div className="flex flex-col">

        {/* ── Row 1: Time Horizon Tabs + New Deal CTA ────────────────────────── */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-gray-100/90 p-1 gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => { setTimeHorizon('active'); setStatusFilter('all') }}
              className={clsx(
                'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                timeHorizon === 'active' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Briefcase className="h-3.5 w-3.5 text-blue-500" />
              <span>Active Pursuits</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-extrabold">{activeCount}</span>
            </button>

            <button
              type="button"
              onClick={() => { setTimeHorizon('closed_ytd'); setStatusFilter('all'); changeView('list') }}
              className={clsx(
                'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                timeHorizon === 'closed_ytd' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Closed</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-extrabold">{closedYtdCount}</span>
            </button>

            <button
              type="button"
              onClick={() => { setTimeHorizon('vault'); setStatusFilter('all') }}
              className={clsx(
                'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer',
                timeHorizon === 'vault' ? 'bg-purple-900 text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              <Archive className={clsx('h-3.5 w-3.5', timeHorizon === 'vault' ? 'text-purple-300' : 'text-purple-400')} />
              <span>Statutory Vault (7y)</span>
              <span className={clsx('ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold', timeHorizon === 'vault' ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-800')}>{vaultCount}</span>
            </button>
          </div>

          {/* Vault Year/Quarter selectors */}
          {timeHorizon === 'vault' && (
            <div className="flex items-center gap-2 flex-wrap px-1">
              <span className="text-[11px] font-bold text-purple-900 uppercase">Vault Year:</span>
              <select
                value={vaultYear}
                onChange={e => setVaultYear(Number(e.target.value))}
                className="bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1 text-xs font-bold text-purple-900 focus:outline-none cursor-pointer"
              >
                {[2025, 2024, 2023, 2022, 2021, 2020, 2019].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <select
                value={vaultQuarter}
                onChange={e => setVaultQuarter(e.target.value as any)}
                className="bg-purple-50 border border-purple-200 rounded-lg px-2.5 py-1 text-xs font-bold text-purple-900 focus:outline-none cursor-pointer"
              >
                <option value="all">All Quarters</option>
                <option value="Q1">Q1 (Jan – Mar)</option>
                <option value="Q2">Q2 (Apr – Jun)</option>
                <option value="Q3">Q3 (Jul – Sep)</option>
                <option value="Q4">Q4 (Oct – Dec)</option>
              </select>
            </div>
          )}
        </div>

        {timeHorizon === 'closed_ytd' ? <TransactionResults agents={users} /> : <>
        {/* Vault Legal Notice Banner */}
        {timeHorizon === 'vault' && (
          <div className="mb-4 bg-purple-50/90 border border-purple-200 rounded-xl p-3.5 text-xs text-purple-900 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <Shield className="h-5 w-5 text-purple-700 flex-shrink-0" />
              <div>
                <span className="font-bold text-sm text-purple-950">NYS DOS § 175.23 &amp; IRS Statutory Retention Archive ({vaultYear})</span>
                <p className="text-[11px] text-purple-800 mt-0.5">
                  Preserving transaction records, contracts, agency disclosures, and financial audits under mandatory 3-year state licensing &amp; 7-year IRS tax retention.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-900 border border-purple-300 whitespace-nowrap">
              Immutable Compliance Lock
            </span>
          </div>
        )}

        {/* ── Row 2: Executive Overview Cards ───────────────────────────────── */}
        <div className="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Card 1: Pipeline Metrics */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Pipeline Overview</h4>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-4">
              <div className="bg-blue-50/60 sm:bg-transparent rounded-xl p-2.5 sm:p-0 border border-blue-100 sm:border-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Active Deals</p>
                <p className="text-xl sm:text-2xl font-extrabold text-gray-900 tabular-nums leading-tight">{metrics.active}</p>
                {metrics.active > 0 && (
                  <p className="text-[10px] text-gray-500 font-medium mt-0.5 hidden sm:block">
                    Avg ${Math.round(metrics.volume / Math.max(1, metrics.active)).toLocaleString()}/deal
                  </p>
                )}
              </div>
              <div className="bg-gray-50/80 sm:bg-transparent rounded-xl p-2.5 sm:p-0 border border-gray-100 sm:border-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Pipeline Vol.</p>
                <p className="text-base sm:text-xl font-extrabold text-gray-900 tabular-nums leading-tight">${metrics.volume >= 1_000_000 ? `${(metrics.volume / 1_000_000).toFixed(1)}M` : metrics.volume.toLocaleString()}</p>
                {metrics.volume > 0 && (
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5 hidden sm:block">
                    ${metrics.volume.toLocaleString()}
                  </p>
                )}
              </div>
              <div className="bg-emerald-50/60 sm:bg-transparent rounded-xl p-2.5 sm:p-0 border border-emerald-100 sm:border-0">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Closed (30d)</p>
                <p className="text-xl sm:text-2xl font-extrabold text-gray-900 tabular-nums leading-tight">{metrics.closedThisMonth}</p>
              </div>
            </div>
          </div>

          {/* Card 2: Commission & GCI Revenue Target */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                  {user && ['admin', 'broker'].includes(user.role) ? 'Projected Prime America Commission' : 'My Projected Compensation'}
                </h4>
              </div>
            </div>

            {/* GCI Progress */}
            <div className="mb-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xl font-extrabold text-emerald-600">${metrics.totalCommission.toLocaleString()}</span>
                <span className="text-xs font-bold text-gray-400">
                  Potential — not yet earned
                </span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Open deals after lead stage. Unconfigured agent plans are excluded from split totals. Legacy commission amounts need review.</p>
            </div>

            {/* Commission Split Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-medium border-t border-gray-100 pt-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0F2040] block" />
                <span className="text-gray-600">Agent: <strong className="text-gray-900">${metrics.agentSplit.toLocaleString()}</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#C9A84C] block" />
                <span className="text-gray-600">Brokerage: <strong className="text-gray-900">${metrics.brokerageSplit.toLocaleString()}</strong></span>
              </div>
              {metrics.coBrokSplit > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400 block" />
                  <span className="text-gray-600">Co-Broke: <strong className="text-gray-900">${metrics.coBrokSplit.toLocaleString()}</strong></span>
                </div>
              )}
              {metrics.referralSplit > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-purple-500 block" />
                  <span className="text-gray-600">Referrals: <strong className="text-gray-900">${metrics.referralSplit.toLocaleString()}</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 3: Unified Command Toolbar ────────────────────────────────── */}
        <div className="mb-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search deals by address or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-4 py-2 text-sm focus:border-blue-500 focus:outline-none shadow-xs placeholder:text-gray-400"
              />
            </div>

            {/* Type Toggle */}
            <div className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
              {(['all', 'sale', 'lease'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={clsx(
                    'px-3 py-1 text-xs font-semibold rounded-lg transition-colors capitalize',
                    typeFilter === t ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
                  )}
                >
                  {t === 'all' ? 'All' : t === 'sale' ? 'Sales' : 'Leases'}
                </button>
              ))}
            </div>

            {/* Stage Selector */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white text-gray-700 shadow-xs"
            >
              <option value="all">All Stages</option>
              {STATUS_FILTER_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            {/* Quick Views */}
            <select
              value={builtInView}
              onChange={e => {
                const v = e.target.value as BuiltInView
                setBuiltInView(v)
                applyBuiltInView(v)
              }}
              className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white text-gray-700 shadow-xs"
            >
              {BUILT_IN_VIEWS.map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>

            {/* Agent Filter — Avatar Dropdown (Admin/Broker only) */}
            {['admin', 'broker'].includes(user?.role || '') && (
              <AgentFilterDropdown
                users={users}
                value={createdByFilter}
                onChange={setCreatedByFilter}
                dealCountByAgent={dealCountByAgent}
                currentUserId={user?.id}
              />
            )}
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center rounded-xl border border-gray-200 bg-gray-50 p-1">
              <button
                onClick={() => changeView('list')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                  view === 'list' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                List
              </button>
              <button
                disabled={timeHorizon !== 'active'}
                onClick={() => changeView('kanban')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                  view === 'kanban' ? 'bg-white text-gray-900 shadow-xs font-bold' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                Board
              </button>
            </div>
            <button
              type="button"
              onClick={syncMyListings}
              disabled={isSyncingListings}
              className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              title="Add Inventory listings assigned to your account into Transactions"
            >
              <RefreshCw className={clsx('h-4 w-4', isSyncingListings && 'animate-spin')} />
              Sync My Listings
            </button>
            <button
              onClick={() => setIsNewModalOpen(true)}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 shadow-sm transition-all hover:shadow"
            >
              <Plus className="h-4 w-4" />
              New Deal
            </button>
          </div>
        </div>

        {listingSyncMessage && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-800" role="status">
            {listingSyncMessage}
          </div>
        )}

        {/* Pipeline Content */}
        {/* Pipeline Content */}
        {isLoading ? (
          <div className="py-6 px-4">
            <SkeletonTable rows={7} cols={5} />
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {(view === 'list' || timeHorizon !== 'active') ? (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-sm min-w-[750px]">
                  <thead className="bg-gray-50/80 text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-5 py-3 font-semibold text-xs text-gray-600">
                        <button type="button" onClick={() => handleSort('name')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none">
                          Property / Deal{sortIndicator('name')}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold text-xs text-gray-600">
                        <button type="button" onClick={() => handleSort('status')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none">
                          Stage{sortIndicator('status')}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold text-xs text-gray-600">
                        <button type="button" onClick={() => handleSort('price')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none">
                          Price & Commission{sortIndicator('price')}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold text-xs text-gray-600">
                        <button type="button" onClick={() => handleSort('target_close_date')} className="inline-flex items-center gap-0.5 hover:text-gray-900 focus:outline-none">
                          Target Close{sortIndicator('target_close_date')}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-semibold text-xs text-gray-600">Health</th>
                      <th className="px-4 py-3 font-semibold text-xs text-gray-600 text-right">Actions</th>
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
                        const health = computeDealHealth(t)
                        const daysUntilClose = getDaysUntilTargetClose(t.target_close_date)

                        return (
                          <tr
                            key={t.id}
                            onClick={() => navigate(`/transactions/${t.id}`)}
                            className="hover:bg-blue-50/30 group cursor-pointer transition-colors"
                          >
                            {/* Property / Deal */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors text-sm">{t.name}</span>
                                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                  {t.type}
                                </span>
                              </div>
                              {t.inventory_listing_id && (
                                <div className="mt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setDrawerListingId(t.inventory_listing_id!)
                                      setIsDrawerOpen(true)
                                    }}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 transition-colors"
                                  >
                                    <Building2 className="h-3 w-3 text-blue-600" /> {getListingName(t.inventory_listing_id)}
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Stage */}
                            <td className="px-4 py-3.5">
                              <select
                                value={t.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => requestStageChange(t, e.target.value)}
                                className={clsx(
                                  "rounded-lg px-2.5 py-1 text-xs font-bold border focus:outline-none cursor-pointer shadow-2xs",
                                  getStatusBadgeClass(t.status)
                                )}
                              >
                                {STATUS_SELECT_OPTIONS.filter(s => workflowPhases(t.workflow_key).includes(s.value)).map(s => (
                                  <option key={s.value} value={s.value}>{s.label}</option>
                                ))}
                              </select>
                            </td>

                            {/* Price & Commission */}
                            <td className="px-4 py-3.5">
                              <span className="font-bold text-gray-900 block text-sm">
                                {t.financial_price_label || 'Target'}: {t.price !== null ? `$${t.price.toLocaleString()}` : '—'}
                              </span>
                              {t.commission_amount !== null ? (
                                <span className="text-xs text-gray-500 font-medium">
                                  {user && ['admin', 'broker'].includes(user.role) ? 'PA commission' : 'My compensation'}: {user && ['admin', 'broker'].includes(user.role) ? `$${Number(t.commission_amount).toLocaleString()}` : t.my_compensation == null ? 'Pending' : `$${t.my_compensation.toLocaleString()}`}
                                  {t.financials_state !== 'approved' ? ' · Est.' : ''}
                                </span>
                              ) : null}
                            </td>

                            {/* Target Close */}
                            <td className="px-4 py-3.5">
                              {t.target_close_date ? (
                                <div>
                                  <span className="text-xs text-gray-800 font-medium block">{t.target_close_date}</span>
                                  {daysUntilClose !== null && daysUntilClose >= 0 && daysUntilClose <= 7 && (
                                    <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                      {daysUntilClose === 0 ? 'Today' : `${daysUntilClose}d left`}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">—</span>
                              )}
                            </td>

                            {/* Health */}
                            <td className="px-4 py-3.5">
                              <span className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border shadow-2xs", health.color)}>
                                <health.icon className="h-3 w-3" />
                                {health.label}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); navigate(`/transactions/${t.id}`) }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <span>Open</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
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
                <div className="p-5 bg-gray-50 flex gap-4 overflow-x-auto min-h-[520px]">
                  {KANBAN_STAGES.filter(stage => filtered.length ? filtered.some(deal => workflowPhases(deal.workflow_key).includes(stage.value)) : workflowPhases(typeFilter === 'lease' ? 'lease_v1' : 'sale_v1').includes(stage.value)).map((col) => {
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
                          "flex-1 min-w-[270px] bg-white rounded-2xl border transition-all duration-300 shadow-sm p-3.5 flex flex-col",
                          isColumnTarget ? "border-blue-500 bg-blue-50/30 ring-2 ring-blue-400/60 shadow-lg scale-[1.01]" : "border-gray-200"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                          <span className="font-bold text-gray-800 text-xs flex items-center gap-1.5">
                            <span className={clsx("h-2 w-2 rounded-full", getStatusDotClass(col.value))} />
                            {col.label}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                            {colDeals.length}
                          </span>
                        </div>

                        <div className="space-y-2.5 overflow-y-auto flex-1 max-h-[600px] pr-1">
                          {colDeals.map((t) => {
                            const health = computeDealHealth(t)
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
                                  "bg-white border rounded-xl p-3.5 shadow-2xs cursor-grab active:cursor-grabbing transition-all duration-200 group select-none hover:border-blue-300 hover:shadow-md",
                                  isBeingDragged ? "opacity-30 scale-95 border-blue-400 border-dashed bg-blue-50 shadow-inner" : ""
                                )}
                              >
                                {/* Card Header: Title & Type */}
                                <div className="flex items-start justify-between gap-2 mb-1.5">
                                  <p className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors text-xs truncate flex-1" title={t.name}>
                                    {t.name}
                                  </p>
                                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">
                                    {t.type}
                                  </span>
                                </div>

                                {/* Linked MLS Listing */}
                                {t.inventory_listing_id && (
                                  <div className="mb-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDrawerListingId(t.inventory_listing_id!)
                                        setIsDrawerOpen(true)
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md border border-blue-200 transition-colors max-w-full truncate"
                                    >
                                      <Building2 className="h-3 w-3 text-blue-600 flex-shrink-0" />
                                      <span className="truncate">{getListingName(t.inventory_listing_id)}</span>
                                    </button>
                                  </div>
                                )}

                                {/* Price & Commission */}
                                <div className="flex items-baseline justify-between my-1.5">
                                  <span className="font-extrabold text-gray-900 text-sm">
                                    {t.financial_price_label || 'Target'}: {t.price !== null ? `$${t.price.toLocaleString()}` : '—'}
                                  </span>
                                  {t.commission_amount !== null ? (
                                    <span className="text-[10px] text-gray-500 font-medium">
                                      {user && ['admin', 'broker'].includes(user.role) ? 'PA commission' : 'My compensation'}: {user && ['admin', 'broker'].includes(user.role) ? `$${Number(t.commission_amount).toLocaleString()}` : t.my_compensation == null ? 'Pending' : `$${t.my_compensation.toLocaleString()}`}
                                  {t.financials_state !== 'approved' ? ' · Est.' : ''}
                                    </span>
                                  ) : null}
                                </div>

                                {/* Footer: Health Badge & Target Close */}
                                <div className="flex items-center justify-between gap-1 mt-2 pt-2 border-t border-gray-100 text-[10px]">
                                  <span className={clsx("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border", health.color)}>
                                    <health.icon className="h-2.5 w-2.5" />
                                    {health.label}
                                  </span>

                                  {t.target_close_date && (
                                    <span className="text-gray-500 font-medium flex items-center gap-1">
                                      <CalendarDays className="h-3 w-3 text-gray-400" />
                                      {t.target_close_date}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {colDeals.length === 0 && (
                            <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs italic">
                              Drag deals here
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            )}

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
        </>}
      </div>

      {linkedListingClose && <CloseLinkedListingPrompt {...linkedListingClose} onClose={() => setLinkedListingClose(null)} />}
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
          workflowKey={stageGateDeal.workflow_key}
          transactionName={stageGateDeal.name}
          initialValues={{
            escrowDate: stageGateDeal.escrow_date || '',
            inspectionDeadline: stageGateDeal.inspection_deadline || '',
            appraisalDate: stageGateDeal.appraisal_date || '',
            attorneyReviewStartDate: stageGateDeal.attorney_review_start_date || '',
            boardSubmissionDate: stageGateDeal.pending_date || '',
            walkthroughDate: stageGateDeal.home_inspection_date || '',
            closingDate: stageGateDeal.closing_date || stageGateDeal.actual_close_date || '',
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

      {/* Floating Undo Toast Notification */}
      {stageToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900/95 backdrop-blur-sm text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700 animate-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-medium">
            Moved <strong className="font-semibold text-white">{stageToast.dealName}</strong> to <strong className="font-bold text-blue-300">{getStageByStatus(stageToast.newStage).label}</strong>
          </span>
          <button
            type="button"
            onClick={handleUndoStageChange}
            className="ml-2 px-2.5 py-1 text-xs font-extrabold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setStageToast(null)}
            className="text-gray-400 hover:text-white p-1 rounded-md ml-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Floating Error Notification */}
      {errorMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-950/95 backdrop-blur-sm text-red-100 px-5 py-3 rounded-2xl shadow-2xl border border-red-800 animate-in slide-in-from-bottom-5 duration-200">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-xs font-medium">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-300 hover:text-white p-1 rounded-md ml-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </Layout>
  )
}
