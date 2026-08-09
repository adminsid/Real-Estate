import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import { SkeletonMetricGrid } from '@/components/common/SkeletonLoader'
import { NAV_CATEGORIES, isCategoryVisible, isSubitemVisible } from '@/utils/constants'
import { AppTile } from '@/components/apps/AppTile'
import type { AppModule } from '@/types'
import { OPEN_PIPELINE_STATUSES } from '@/lib/transactionStatus'

interface BrokerTx {
  id: string
  name: string
  type?: string
  status?: string
  price?: number | null
  commission_amount?: number | null
  commission_rate?: number | null
  target_close_date?: string | null
  escrow_date?: string | null
  inspection_deadline?: string | null
  appraisal_date?: string | null
  is_locked?: number | null
  assigned_to?: string | null
}

interface BrokerDashboardProps {
  stats?: { company?: { commissionVolume?: number } }
  can: (module: string, action: string) => boolean
  user: { id?: string; role: string } | null | undefined
  allowedAppModules: AppModule[]
}

export function BrokerDashboard({ can, user, allowedAppModules }: BrokerDashboardProps) {
  const [txs, setTxs] = useState<BrokerTx[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/transactions', { credentials: 'include' })
        if (!res.ok) throw new Error('HTTP error')
        const json = await res.json()
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setTxs(json.data as BrokerTx[])
        } else {
          if (!cancelled) setLoadError(true)
        }
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Derived collections (single source: txs) ─────────────────────────────
  const within14 = (d?: string | null) => {
    if (!d) return false
    const t = Date.parse(d)
    if (Number.isNaN(t)) return false
    const now = Date.now()
    return t >= now && t <= now + 14 * 24 * 60 * 60 * 1000
  }

  const commission = (t: BrokerTx) => {
    if (t.commission_amount && Number(t.commission_amount) > 0) return Number(t.commission_amount)
    if (t.price && t.commission_rate && Number(t.price) > 0 && Number(t.commission_rate) > 0) {
      return (Number(t.price) * Number(t.commission_rate)) / 100
    }
    return 0
  }

  const closingSoon = useMemo(
    () =>
      txs.filter(
        (t) =>
          t.status !== 'closed' &&
          t.status !== 'fallen_through' &&
          within14(t.target_close_date),
      ),
    [txs],
  )

  const underContractMissingMilestones = useMemo(
    () =>
      txs.filter(
        (t) =>
          t.status === 'under_contract' &&
          (!t.escrow_date || !t.inspection_deadline || !t.appraisal_date),
      ),
    [txs],
  )

  const lockedDeals = useMemo(
    () => txs.filter((t) => t.is_locked === 1 && t.status !== 'closed' && t.status !== 'fallen_through'),
    [txs],
  )

  // Deduplication: one row per deal id with applicable reason badges
  const doNowItems = useMemo(() => {
    const byId = new Map<string, { deal: BrokerTx; reasons: string[] }>()
    const track = (id: string, deal: BrokerTx, reason: string) => {
      const existing = byId.get(id)
      if (existing) {
        if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
      } else {
        byId.set(id, { deal, reasons: [reason] })
      }
    }
     closingSoon.forEach((d) => track(d.id, d, 'Closing within 14 days'))
    underContractMissingMilestones.forEach((d) =>
      track(d.id, d, 'Under contract — missing milestones'),
    )
    lockedDeals.forEach((d) => track(d.id, d, 'Locked'))
    return Array.from(byId.values()).sort((a, b) => {
      if (b.reasons.length !== a.reasons.length) return b.reasons.length - a.reasons.length
      const da = Date.parse(a.deal.target_close_date || '')
      const db = Date.parse(b.deal.target_close_date || '')
      if (Number.isNaN(da)) return 1
      if (Number.isNaN(db)) return -1
      return da - db
    })
  }, [closingSoon, underContractMissingMilestones, lockedDeals])

  // ── Health metrics (max 5) ───────────────────────────────────────────────
  const activeCount = useMemo(() => txs.filter((t) => t.status && OPEN_PIPELINE_STATUSES.includes(t.status as any)).length, [txs])
  const underContractCount = useMemo(() => txs.filter((t) => t.status === 'under_contract').length, [txs])
  const closingSoonCount = useMemo(
    () => txs.filter((t) => t.status !== 'closed' && t.status !== 'fallen_through' && within14(t.target_close_date)).length,
    [txs],
  )
  const projectedCommission = useMemo(() => {
    const relevant = txs.filter((t) => t.status && OPEN_PIPELINE_STATUSES.includes(t.status as any))
    return Math.round(relevant.reduce((acc: number, t: BrokerTx) => acc + commission(t), 0))
  }, [txs])
  const pausedOrFallen = useMemo(
    () => txs.filter((t) => t.status === 'paused' || t.status === 'fallen_through').length,
    [txs],
  )

  const statCards = [
    { key: 'active', icon: Icons.Activity, label: 'Active Deals', value: String(activeCount), color: '#3B82F6' },
    { key: 'under_contract', icon: Icons.Clock, label: 'Under Contract', value: String(underContractCount), color: '#F59E0B' },
    { key: 'closing', icon: Icons.Calendar, label: 'Closings (14d)', value: String(closingSoonCount), color: '#10B981' },
    { key: 'commission', icon: Icons.DollarSign, label: 'Projected Commission', value: `$${projectedCommission.toLocaleString()}`, color: '#059669' },
    { key: 'inactive', icon: Icons.PauseCircle, label: 'Paused / Fallen', value: String(pausedOrFallen), color: '#EF4444' },
   ]

  return (
    <div>
      {loadError ? (
        <div className="py-10 text-center">
          <p className="text-sm text-gray-600 mb-3">Unable to load broker oversight data.</p>
          <Link to="/transactions/pipeline" className="text-sm font-medium text-indigo-600 hover:text-indigo-800 underline">
            View pipeline
          </Link>
        </div>
      ) : (
        <>
          {/* ── Do Now ───────────────────────────────────────────────────── */}
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Icons.AlertCircle className="h-4 w-4 text-red-500" />
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Do Now</h3>
            </div>
            {doNowItems.length === 0 && !loading ? (
              <div className="py-8 text-center text-gray-400 text-sm border border-dashed rounded-xl">
                No deals currently match the broker attention rules.
              </div>
            ) : (
              <div className="space-y-3">
                {doNowItems.slice(0, 8).map(({ deal, reasons }) => (
                  <Link key={deal.id} to={`/transactions/${deal.id}`} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-100/60 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{deal.name}</span>
                      {reasons.map((r, i) => (
                        <span key={i} className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          {r}
                        </span>
                      ))}
                    </div>
                    {deal.target_close_date && within14(deal.target_close_date) && (
                      <span className="text-xs font-bold text-blue-800 px-2 py-0.5 rounded-full bg-blue-100">
                        {deal.target_close_date}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}
            {doNowItems.length > 8 && (
              <Link to="/transactions/pipeline" className="mt-3 text-sm font-medium text-indigo-600 hover:text-indigo-800 underline">
                View all deals needing attention
              </Link>
            )}
          </section>

          {/* ── Health ───────────────────────────────────────────────────── */}
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Icons.Target className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Health</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {loading ? (
                <SkeletonMetricGrid count={5} />
              ) : (
                statCards.map((card) => {
                  const CardIcon = card.icon
                  return (
                    <div key={card.key} className="rounded-xl p-4 border bg-white text-center">
                      <div className="flex items-center justify-center mb-2">
                        <CardIcon className="h-5 w-5" style={{ color: card.color }} />
                      </div>
                      <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{card.label}</p>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          {/* ── Tools: broker-scoped module shortcuts (secondary) ───────── */}
          {NAV_CATEGORIES.filter((cat) => isCategoryVisible(cat, user, can)).length > 0 && (
            <section className="mb-6">
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-3">Workspace Modules</h3>
              <div className="space-y-6">
                {NAV_CATEGORIES.filter((cat) => isCategoryVisible(cat, user, can)).map((cat) => {
                  const modules = allowedAppModules.filter((m) => m.category === cat.id && isSubitemVisible(m.id, cat.id, user, can))
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
        </>
      )}
    </div>
  )
}
