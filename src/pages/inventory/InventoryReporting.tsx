import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Download, Filter, Clock, Pencil, Trash2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { SkeletonTable } from '@/components/common/SkeletonLoader'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from '@/utils/api'

type Showing = {
  id: string
  listing_id: string
  listing_address: string | null
  agent_id: string
  agent_name: string
  buyer_name: string
  shown_at: string
  feedback: string | null
  created_at: string
}

type UserTarget = {
  id: string
  name: string
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function InventoryReportingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [showings, setShowings] = useState<Showing[]>([])
  const [listings, setListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserTarget[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [agentId, setAgentId] = useState('')
  const [listingFilter, setListingFilter] = useState('')

  const [editingShowing, setEditingShowing] = useState<Showing | null>(null)
  const [editBuyerName, setEditBuyerName] = useState('')
  const [editShownAt, setEditShownAt] = useState('')
  const [editFeedback, setEditFeedback] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const handleStartEdit = (s: Showing) => {
    setEditingShowing(s)
    setEditBuyerName(s.buyer_name)
    const d = new Date(s.shown_at)
    const tzOffset = d.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(d.getTime() - tzOffset)).toISOString().slice(0, 16);
    setEditShownAt(localISOTime)
    setEditFeedback(s.feedback || '')
  }

  const handleSaveEdit = async () => {
    if (!editingShowing) return
    setSavingEdit(true)
    try {
      await apiFetch(`/api/showings/${editingShowing.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          buyerName: editBuyerName.trim(),
          shownAt: new Date(editShownAt).toISOString(),
          feedback: editFeedback.trim() || undefined,
        })
      })
      alert('Showing log updated successfully')
      setEditingShowing(null)
      loadShowings()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSavingEdit(false)
    }
  }

  const handleDeleteShowing = async (id: string) => {
    if (!confirm('Are you sure you want to delete this showing log?')) return
    try {
      await apiFetch(`/api/showings/${id}`, {
        method: 'DELETE'
      })
      alert('Showing log deleted successfully')
      loadShowings()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const listingOptions = useMemo(() => {
    const options = listings.map(l => ({
      id: l.id,
      address: l.name || l.address || `Listing ${l.id.slice(0, 8)}`
    }))
    
    const seen = new Set(options.map(o => o.id))
    showings.forEach(s => {
      if (!seen.has(s.listing_id)) {
        seen.add(s.listing_id)
        options.push({
          id: s.listing_id,
          address: s.listing_address || `Listing ${s.listing_id.slice(0, 8)}`
        })
      }
    })
    
    return options
  }, [listings, showings])

  const filteredShowings = useMemo(() => {
    if (!listingFilter) return showings
    return showings.filter((s) => s.listing_id === listingFilter || s.listing_address === listingFilter)
  }, [showings, listingFilter])

  const loadShowings = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString())
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString())
      if (agentId) params.set('agentId', agentId)
      const qs = params.toString()
      const data = await apiFetch(`/api/showings${qs ? `?${qs}` : ''}`)
      setShowings(Array.isArray(data) ? data : [])
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadShowings()
    async function loadListings() {
      try {
        const res = await fetch('/api/listings')
        const json = await res.json()
        const list = json.listings || json.data || json || []
        setListings(Array.isArray(list) ? list : [])
      } catch (e) {
        console.error(e)
      }
    }
    loadListings()
  }, [])
  useEffect(() => {
    if (['admin', 'broker'].includes(user?.role || '')) {
      apiFetch('/api/contacts/tools/users').then((d) => setUsers(Array.isArray(d) ? d : [])).catch(() => {})
    }
  }, [user])

  const getListingAddress = (listingId: string, fallbackAddress: string | null) => {
    const listing = listings.find(l => l.id === listingId)
    return listing?.name || listing?.address || fallbackAddress || `Listing ${listingId.slice(0, 8)}`
  }

  const exportCsv = () => {
    const headers = ['Date', 'Buyer Name', 'Listing', 'Agent', 'Feedback']
    const rows = filteredShowings.map((s) => ({
      Date: new Date(s.shown_at).toLocaleString(),
      'Buyer Name': s.buyer_name,
      Listing: getListingAddress(s.listing_id, s.listing_address),
      Agent: s.agent_name,
      Feedback: s.feedback || '',
    }))
    const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell(r[h as keyof typeof r])).join(','))].join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `showings-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout title="Inventory Reporting">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => navigate('/inventory')} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Back to Inventory
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowFilters(!showFilters)} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Filter className="h-4 w-4" /> {showFilters ? 'Hide Filters' : 'Filters'}
          </button>
          <button onClick={exportCsv} disabled={filteredShowings.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500">Filters</h3>
            <button onClick={() => { setDateFrom(''); setDateTo(''); setAgentId(''); setListingFilter('') }} className="text-xs text-blue-600 hover:underline">Clear</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-semibold uppercase text-gray-500">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-gray-500">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-gray-500">Agent</label>
              <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none">
                <option value="">All Agents</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-gray-500">Listing</label>
              <select value={listingFilter} onChange={(e) => setListingFilter(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none">
                <option value="">All Listings</option>
                {listingOptions.map((lo) => (
                  <option key={lo.id} value={lo.id}>{lo.address || lo.id}</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={loadShowings} className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy-light">
            Apply Filters
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-6"><SkeletonTable rows={8} cols={5} /></div>
      ) : filteredShowings.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <Clock className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500">No showings recorded yet</p>
          <p className="text-xs text-gray-400 mt-1">Showing logs will appear here once agents start logging showings on listing pages.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Buyer</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Listing</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Agent</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Feedback</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredShowings.map((s) => (
                  <tr key={s.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(s.shown_at).toLocaleDateString()} <span className="text-gray-400">{new Date(s.shown_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
                    <td className="px-4 py-3 font-medium text-gray-800">{s.buyer_name}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-[220px] truncate" title={getListingAddress(s.listing_id, s.listing_address)}>
                      {getListingAddress(s.listing_id, s.listing_address)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.agent_name}</td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{s.feedback || '—'}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                      {(user?.role === 'admin' || user?.role === 'broker' || s.agent_id === user?.id) && (
                        <>
                          <button
                            onClick={() => handleStartEdit(s)}
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteShowing(s.id)}
                            className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 text-[10px] text-gray-400">
            {filteredShowings.length} showing{filteredShowings.length !== 1 ? 's' : ''} found
          </div>
        </div>
      )}

      {editingShowing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in duration-200">
            <h3 className="mb-4 text-base font-bold text-gray-900">Edit Showing Log</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Buyer Name</label>
                <input
                  type="text"
                  value={editBuyerName}
                  onChange={(e) => setEditBuyerName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="Enter buyer's name"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Shown At</label>
                <input
                  type="datetime-local"
                  value={editShownAt}
                  onChange={(e) => setEditShownAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase">Feedback</label>
                <textarea
                  value={editFeedback}
                  onChange={(e) => setEditFeedback(e.target.value)}
                  placeholder="Buyer's feedback..."
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditingShowing(null)}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  disabled={savingEdit || !editBuyerName.trim() || !editShownAt}
                  onClick={handleSaveEdit}
                  className="flex-1 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light disabled:opacity-60"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
