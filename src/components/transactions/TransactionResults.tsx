import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, RefreshCw } from 'lucide-react'
import type { PeriodKind } from '@/domain/reporting-period'
import type { transactionResults } from '../../../workers/transactions/results'

type Report = ReturnType<typeof transactionResults>
const periods: [PeriodKind, string][] = [
  ['ytd', 'Year to date'], ['qtd', 'Quarter to date'], ['month', 'Current month'],
  ['last30', 'Last 30 days'], ['last90', 'Last 90 days'], ['previous_year', 'Previous year'],
  ['custom', 'Custom dates'], ['all', 'All time'],
]
const money = (cents: number) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const control = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-blue-500'

export function TransactionResults({ agents = [] }: { agents?: { id: string; name: string }[] }) {
  const [period, setPeriod] = useState<PeriodKind>('ytd')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [group, setGroup] = useState<'month' | 'agent' | 'type'>('month')
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const invalidPeriod = period === 'custom' && (!start || !end || start > end)
  const query = new URLSearchParams({ period, ...(period === 'custom' ? { start, end } : {}) }).toString()

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setRevision(value => value + 1) }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setReport(null)
    setError('')
    setLoading(!invalidPeriod)
    if (invalidPeriod) return
    void (async () => {
      try {
        const response = await fetch(`/api/transactions/results?${query}`, { signal: controller.signal, cache: 'no-store' })
        if (response.status === 404) throw new Error('Closed results are temporarily unavailable. Please retry shortly.')
        const body = await response.json()
        if (!response.ok || !body.success) throw new Error(body.error || 'Unable to load closed deals.')
        if (!controller.signal.aborted) setReport(body.data)
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load closed deals.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [query, invalidPeriod, revision])

  const names = useMemo(() => new Map(agents.map(agent => [agent.id, agent.name])), [agents])
  const groups = useMemo(() => {
    const result = new Map<string, Report['rows']>()
    for (const row of report?.rows || []) {
      const key = group === 'month' ? row.actualCloseDate.slice(0, 7) : row[group]
      const rows = result.get(key) || []
      rows.push(row)
      result.set(key, rows)
    }
    return [...result]
  }, [report, group])
  const groupLabel = (key: string) => group === 'agent' ? names.get(key) || key
    : group === 'type' ? key === 'sale' ? 'Sales' : key === 'lease' ? 'Leases' : key
    : new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  return <section className="space-y-4" aria-label="Closed deals" aria-busy={loading}>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <label className="grid gap-1 text-xs font-semibold text-gray-500">Period
        <select value={period} onChange={event => setPeriod(event.target.value as PeriodKind)} className={control}>
          {periods.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
        </select>
      </label>
      {period === 'custom' && <>
        <label className="grid gap-1 text-xs font-semibold text-gray-500">From<input className={control} type="date" value={start} max={end || undefined} onChange={event => setStart(event.target.value)} /></label>
        <label className="grid gap-1 text-xs font-semibold text-gray-500">Through<input className={control} type="date" value={end} min={start || undefined} onChange={event => setEnd(event.target.value)} /></label>
      </>}
      <label className="grid gap-1 text-xs font-semibold text-gray-500">Group by
        <select value={group} onChange={event => setGroup(event.target.value as typeof group)} className={control}>
          <option value="month">Month</option><option value="agent">Agent</option><option value="type">Deal type</option>
        </select>
      </label>
      <button type="button" disabled={loading || invalidPeriod} onClick={() => setRevision(value => value + 1)} className={`${control} flex items-center gap-2 disabled:opacity-50`}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
      </button>
      {report && <a className="ml-auto flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white" href={`/api/transactions/results?${query}&format=csv`}><Download className="h-4 w-4" />Export CSV</a>}
    </div>
    {invalidPeriod && <p className="text-sm text-gray-500" role="status">Choose a start and end date, with the end on or after the start.</p>}
    {loading && <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500" role="status">Loading closed deals…</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} Use Refresh to try again.</div>}
    {report && <>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Closed deals', report.count.toLocaleString()],
          ['Recorded Prime America commission', money(report.grossCommissionCents)],
          ['Missing commission amounts', report.missingCommissionCount.toLocaleString()],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold text-gray-900">{value}</p></div>)}
      </div>
      <p className="text-xs text-gray-500">Based on actual close dates · New York time. Prime America commission does not represent agent earnings or payments. Legacy amounts require classification.</p>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500"><tr>{['Property / Deal', 'Actual close', 'Agent', 'Type', 'PA commission'].map(label => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead>
          {groups.map(([key, rows]) => <tbody key={key}>
            <tr><th colSpan={5} className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">{groupLabel(key)} · {rows.length} {rows.length === 1 ? 'deal' : 'deals'}</th></tr>
            {rows.map(row => <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-4"><Link className="font-semibold text-blue-700 hover:underline" to={`/transactions/${row.id}`}>{row.name}</Link></td>
              <td className="whitespace-nowrap px-4 py-4">{row.actualCloseDate}</td>
              <td className="px-4 py-4">{names.get(row.agent) || row.agent}</td>
              <td className="px-4 py-4 capitalize">{row.type}</td>
              <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.grossCommissionCents === null ? <span className="text-amber-700">Needs review</span> : money(row.grossCommissionCents)}</td>
            </tr>)}
          </tbody>)}
        </table>
        {!report.rows.length && <p className="p-10 text-center text-sm text-gray-500">No closed deals in this period. Try a different date range.</p>}
      </div>
      {report.repair.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><summary className="cursor-pointer font-semibold">{report.repair.length} closed deals need an actual close date</summary><p className="mt-2">These deals are excluded from totals until their close date is recorded.</p>{report.repair.map(row => <p className="mt-2" key={row.id}><Link className="underline" to={`/transactions/${row.id}`}>{row.name}</Link></p>)}</details>}
    </>}
  </section>
}
