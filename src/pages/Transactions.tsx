import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Briefcase, Plus, Search, Loader2, DollarSign,
  ChevronRight, CalendarDays, User, TrendingUp, Pencil, Check, X, Building2
} from 'lucide-react'

import { Layout } from '@/components/layout/Layout'
import { NewDealModal } from '@/components/transactions/NewDealModal'
import { StageGateModal } from '@/components/transactions/StageGateModal'
import { ListingDetailDrawer } from '@/components/transactions/ListingDetailDrawer'
import { Pagination } from '@/components/common/Pagination'
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
  const [users, setUsers] = useState<UserTarget[]>([])
  const [page, setPage] = useState(1)
  const [listings, setListings] = useState<any[]>([])
  const [goalTargets, setGoalTargets] = useState({ lead: 5, active: 3, under_contract: 2, closed: 1 })
  const [goalsLoaded, setGoalsLoaded] = useState(false)
  const [editingGoal, setEditingGoal] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const navigate = useNavigate()
  const [pageSize] = useState(20)

  // Stage-Gate Modal state
  const [stageGateDeal, setStageGateDeal] = useState<{ id: string; name: string; targetStage: string; escrow_date?: string | null; inspection_deadline?: string | null; appraisal_date?: string | null } | null>(null)

  // Off-Canvas Listing Drawer state
  const [drawerListingId, setDrawerListingId] = useState<string | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

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
    return transactions.filter(t => {
      const matchSearch = t.name.toLowerCase().includes(search.toLowerCase())
      const matchType = typeFilter === 'all' || t.type === typeFilter
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      return matchSearch && matchType && matchStatus
    })
  }, [transactions, search, typeFilter, statusFilter])

  useEffect(() => {
    setPage(1)
  }, [search, view, createdByFilter, typeFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pagedList = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page, pageSize])

  const getMetrics = () => {
    const active = transactions.filter(t => t.status === 'active' || t.status === 'offer_received' || t.status === 'under_contract').length
    const volume = transactions.filter(t => t.status !== 'closed' && t.status !== 'lead').reduce((sum, t) => sum + (t.price || 0), 0)
    const closedThisMonth = transactions.filter(t => t.status === 'closed').length
    return { active, volume, closedThisMonth }
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
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="offer_received">Offer Received</option>
              <option value="under_contract">Under Contract</option>
              <option value="closed">Closed</option>
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

        {/* Weekly Leading Indicator Pipeline Goals */}
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Weekly Leading Indicator Goals</h3>
              <p className="text-xs text-gray-500">Track high-leverage sales activities driving closings</p>
            </div>
            <span className="text-xs text-blue-600 font-semibold bg-white border border-blue-200 px-2 py-1 rounded-md">Click target to adjust</span>
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
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            {view === 'list' ? (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-sm min-w-[750px]">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Deal Name</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Price</th>
                    <th className="px-6 py-3 font-medium">Parties</th>
                    <th className="px-6 py-3 font-medium">Target Close & Urgency</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-16 text-center text-gray-500">
                        <TrendingUp className="h-12 w-12 mx-auto mb-3 text-brand-navy opacity-30 animate-pulse" />
                        <p className="font-semibold text-gray-700">No active deals found</p>
                      </td>
                    </tr>
                  ) : (
                    pagedList.map((t) => {
                      const urgency = getUrgencyCue(t.target_close_date)

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
                                t.status === 'active' ? "bg-blue-100 text-blue-800 border-blue-200" :
                                t.status === 'offer_received' ? "bg-purple-100 text-purple-800 border-purple-200" :
                                t.status === 'under_contract' ? "bg-amber-100 text-amber-800 border-amber-200" :
                                t.status === 'closed' ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
                                "bg-gray-100 text-gray-700 border-gray-200"
                              )}
                            >
                              <option value="lead">Lead</option>
                              <option value="active">Active</option>
                              <option value="offer_received">Offer Received</option>
                              <option value="under_contract">Under Contract</option>
                              <option value="closed">Closed</option>
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
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 inline" />
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
            ) : (
              /* Kanban View */
              <div className="p-6 bg-gray-50 flex gap-4 overflow-x-auto min-h-[500px]">
                {([
                  { status: 'lead', label: 'Leads' },
                  { status: 'active', label: 'Active' },
                  { status: 'offer_received', label: 'Offer Received' },
                  { status: 'under_contract', label: 'Under Contract' },
                  { status: 'closed', label: 'Closed' }
                ] as const).map((col) => {
                  const colDeals = filtered.filter(t => t.status === col.status)
                  return (
                    <div key={col.status} className="flex-1 min-w-[260px] bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col">
                      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
                        <span className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                          <span className={clsx("h-2 w-2 rounded-full", 
                            col.status === 'lead' ? 'bg-gray-400' :
                            col.status === 'active' ? 'bg-indigo-500' :
                            col.status === 'offer_received' ? 'bg-purple-500' :
                            col.status === 'under_contract' ? 'bg-amber-500' : 'bg-emerald-500'
                          )} />
                          {col.label}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                          {colDeals.length}
                        </span>
                      </div>
                      <div className="space-y-3 overflow-y-auto flex-1 max-h-[600px] pr-1">
                        {colDeals.map((t) => {
                          const urgency = getUrgencyCue(t.target_close_date)

                          return (
                            <div
                              key={t.id}
                              onClick={() => navigate(`/transactions/${t.id}`)}
                              className="bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl p-4 shadow-sm cursor-pointer transition-all duration-200 group relative"
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

                              {/* Stage Change Controls */}
                              <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                                <span>Stage Move:</span>
                                <select
                                  value={t.status}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => requestStageChange(t, e.target.value)}
                                  className="bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 font-bold text-gray-700 focus:outline-none"
                                >
                                  <option value="lead">Lead</option>
                                  <option value="active">Active</option>
                                  <option value="offer_received">Offer Received</option>
                                  <option value="under_contract">Under Contract</option>
                                  <option value="closed">Closed</option>
                                </select>
                              </div>
                            </div>
                          )
                        })}
                        {colDeals.length === 0 && (
                          <div className="text-center py-8 text-gray-400 text-xs italic">
                            No deals in this stage.
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
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
