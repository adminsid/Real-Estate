import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssignedOutcomes } from '@/components/next/AssignedOutcomes'
import { apiFetch } from '@/utils/api'
import type { NextSummary } from '@/domain/next'

export function NextWork({ onNavigate, refreshKey, canWrite }: {
  onNavigate: () => void; refreshKey: number; canWrite: boolean
}) {
  const [journeys, setJourneys] = useState<NextSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void apiFetch<NextSummary[]>('/api/next/journeys', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setJourneys(data.filter(j => j.total === 0 || j.done < j.total)) })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refreshKey])

  return <div>
    <AssignedOutcomes onNavigate={onNavigate} refreshKey={refreshKey} canWrite={canWrite} />
    <section className="mb-6 rounded-xl border border-teal-100 bg-white p-4" aria-label="Active seller journeys">
      <h3 className="font-bold text-gray-900 mb-3">Active journeys</h3>
      {loading ? <p className="text-sm text-gray-500">Loading journeys…</p> : error ?
        <p role="alert" className="text-sm text-red-700">{error}</p> : journeys.length === 0 ?
        <p className="text-sm text-gray-500">Your seller journeys will appear here. Open Next to get started.</p> :
        <div className="space-y-2">{journeys.slice(0, 5).map(j => <Link key={j.id} to={`/next/${j.id}`} onClick={onNavigate}
          className="block rounded-lg bg-slate-50 p-3 hover:bg-teal-50">
          <strong className="block text-sm text-gray-900 break-words">{j.name}</strong>
          <span className="text-xs text-gray-500">{j.done} of {j.total} outcomes completed</span>
          <progress aria-label={`${j.name} progress`} className="block w-full h-2 mt-2 accent-teal-700" value={j.done} max={j.total || 1} />
        </Link>)}</div>}
      <Link to="/next" onClick={onNavigate} className="inline-block mt-3 text-sm font-semibold text-teal-700">View all journeys →</Link>
    </section>
  </div>
}
