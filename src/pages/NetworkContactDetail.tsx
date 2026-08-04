import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  Mail,
  MapPin,
  Phone,
  Save,
  Loader2,
  Star,
  TrendingUp,
  Globe,
  Trash2,
  Briefcase,
  ZoomIn,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'

type Connection = {
  id: string
  name: string
  title?: string
  company?: string
  email?: string
  phone?: string
  telephone?: string
  fax?: string
  website?: string
  poi?: string
  type?: string
  notes?: string
  experience_rating?: number | null
  experience_notes?: string
  is_private?: number | boolean
  business_card_key?: string
  picture_url?: string
  total_referrals?: number
  successful_referrals?: number
  address?: string
}

type Referral = {
  id: string
  recipient_connection_id: string
  client_name: string
  referral_type: string
  status: string
  created_at: string
  sender_name?: string
  notes?: string
  experience_rating?: number | null
  experience_notes?: string | null
}

type Txn = {
  id: string
  name: string
  status: string
  created_at: string
  target_close_date?: string | null
  parties_involved?: string | null
}

function toLower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : ''
}

function safeJsonParse(value: unknown): any {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function NetworkContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingPicture, setIsUploadingPicture] = useState(false)
  const [isUploadingBusinessCard, setIsUploadingBusinessCard] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const [connection, setConnection] = useState<Connection | null>(null)
  const [form, setForm] = useState<Connection | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [transactions, setTransactions] = useState<Txn[]>([])
  const [types, setTypes] = useState<string[]>(['broker', 'attorney', 'inspector', 'contractor', 'title', 'mortgage', 'colleague'])

  const fetchData = async () => {
    if (!id) return
    setIsLoading(true)
    try {
      const [connRes, refRes, txRes] = await Promise.all([
        fetch('/api/network'),
        fetch('/api/network/referrals'),
        fetch('/api/transactions'),
      ])

      const [connJson, refJson, txJson] = await Promise.all([
        connRes.json(),
        refRes.json(),
        txRes.json(),
      ])

      const allConnections: Connection[] = Array.isArray(connJson?.data) ? connJson.data : []
      const found = allConnections.find((c) => c.id === id) || null
      setConnection(found)
      setForm(found ? { ...found } : null)

      setReferrals(Array.isArray(refJson?.data) ? refJson.data : [])
      setTransactions(Array.isArray(txJson?.data) ? txJson.data : [])
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    async function loadModuleSettings() {
      try {
        const res = await fetch('/api/user-settings?key=module_settings')
        const json = await res.json()
        if (json.success && json.data?.value) {
          const settings = JSON.parse(json.data.value)
          const customTypes = settings.network_connection_types || []
          if (customTypes.length > 0) {
            setTypes(customTypes)
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadModuleSettings()
  }, [id])

  const relatedReferrals = useMemo(() => {
    if (!id) return []
    return referrals
      .filter((r) => r.recipient_connection_id === id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [referrals, id])

  const relatedTransactions = useMemo(() => {
    if (!form) return []

    const name = toLower(form.name)
    const email = toLower(form.email)
    const phone = toLower(form.phone || form.telephone)
    const company = toLower(form.company)

    return transactions.filter((tx) => {
      const txName = toLower(tx.name)
      const partiesRaw = safeJsonParse(tx.parties_involved)
      const partiesString = toLower(JSON.stringify(partiesRaw || tx.parties_involved || ''))

      if (name && (txName.includes(name) || partiesString.includes(name))) return true
      if (email && partiesString.includes(email)) return true
      if (phone && partiesString.includes(phone)) return true
      if (company && partiesString.includes(company)) return true
      return false
    })
  }, [transactions, form])

  const pipelineStats = useMemo(() => {
    const stats: Record<string, number> = {}
    relatedTransactions.forEach((tx) => {
      stats[tx.status] = (stats[tx.status] || 0) + 1
    })
    return stats
  }, [relatedTransactions])

  const handleSave = async () => {
    if (!id || !form) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/network/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to save')
      await fetchData()
      alert('Connection updated')
    } catch (e: any) {
      alert(e.message || 'Failed to update connection')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    if (!confirm('Delete this network connection?')) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/network/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to delete')
      navigate('/network')
    } catch (e: any) {
      alert(e.message || 'Failed to delete connection')
    } finally {
      setIsDeleting(false)
    }
  }

  const uploadPicture = async (file: File) => {
    if (!id || !form) return
    setIsUploadingPicture(true)
    try {
      const uploadForm = new FormData()
      uploadForm.append('entity_type', 'network_connection_picture')
      uploadForm.append('entity_id', id)
      uploadForm.append('file', file)

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: uploadForm,
      })
      const json = await res.json()
      if (!json.success || !json.data?.id) throw new Error(json.error || 'Upload failed')

      setForm((prev) => (prev ? { ...prev, picture_url: `/api/documents/${json.data.id}/download` } : prev))
    } catch (e: any) {
      alert(e.message || 'Failed to upload picture')
    } finally {
      setIsUploadingPicture(false)
    }
  }

  const uploadBusinessCard = async (file: File) => {
    if (!id || !form) return
    setIsUploadingBusinessCard(true)
    try {
      const uploadForm = new FormData()
      uploadForm.append('entity_type', 'network_business_card')
      uploadForm.append('entity_id', id)
      uploadForm.append('file', file)

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: uploadForm,
      })
      const json = await res.json()
      if (!json.success || !json.data?.id) throw new Error(json.error || 'Upload failed')

      setForm((prev) => (prev ? { ...prev, business_card_key: `/api/documents/${json.data.id}/download` } : prev))
    } catch (e: any) {
      alert(e.message || 'Failed to upload business card')
    } finally {
      setIsUploadingBusinessCard(false)
    }
  }

  if (isLoading) {
    return (
      <Layout title="Network Contact">
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    )
  }

  if (!connection || !form) {
    return (
      <Layout title="Network Contact">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center">
          <p className="text-gray-500">Connection not found.</p>
          <button
            onClick={() => navigate('/network')}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Network
          </button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Network Contact Details">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
        <button
          onClick={() => navigate('/network')}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Updates
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 rounded-2xl border border-gray-100 bg-white p-5 shadow-card space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 rounded-2xl bg-brand-navy/10 overflow-hidden flex items-center justify-center">
              {form.picture_url ? (
                <img src={form.picture_url} alt={form.name} className="h-full w-full object-cover" />
              ) : (
                <Briefcase className="h-7 w-7 text-brand-navy" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-800">{form.name}</h2>
              <p className="text-sm text-gray-500">Update profile, review history, and monitor connected deals.</p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Contact Picture</label>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadPicture(file)
                }}
              />
              {isUploadingPicture ? 'Uploading...' : 'Upload New Picture'}
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Name</label>
              <input value={form.name || ''} onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Title</label>
              <input value={form.title || ''} onChange={(e) => setForm((p) => (p ? { ...p, title: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Company</label>
              <input value={form.company || ''} onChange={(e) => setForm((p) => (p ? { ...p, company: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Type</label>
              <select value={form.type || 'colleague'} onChange={(e) => setForm((p) => (p ? { ...p, type: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy">
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Email</label>
              <input value={form.email || ''} onChange={(e) => setForm((p) => (p ? { ...p, email: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Phone</label>
              <input value={form.phone || ''} onChange={(e) => setForm((p) => (p ? { ...p, phone: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Telephone</label>
              <input value={form.telephone || ''} onChange={(e) => setForm((p) => (p ? { ...p, telephone: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Fax</label>
              <input value={form.fax || ''} onChange={(e) => setForm((p) => (p ? { ...p, fax: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Website</label>
              <input value={form.website || ''} onChange={(e) => setForm((p) => (p ? { ...p, website: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">POC (Point of Contact)</label>
              <input value={form.poi || ''} onChange={(e) => setForm((p) => (p ? { ...p, poi: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Address</label>
              <input value={form.address || ''} onChange={(e) => setForm((p) => (p ? { ...p, address: e.target.value } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" placeholder="e.g. 123 Main St, New York, NY" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Experience Rating</label>
              <input type="number" min={1} max={5} value={form.experience_rating ?? ''} onChange={(e) => setForm((p) => (p ? { ...p, experience_rating: e.target.value ? Number(e.target.value) : null } : p))} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Private</label>
              <label className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700">
                <input type="checkbox" checked={!!form.is_private} onChange={(e) => setForm((p) => (p ? { ...p, is_private: e.target.checked } : p))} />
                Keep private
              </label>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Experience Notes</label>
            <textarea value={form.experience_notes || ''} onChange={(e) => setForm((p) => (p ? { ...p, experience_notes: e.target.value } : p))} rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Notes</label>
            <textarea value={form.notes || ''} onChange={(e) => setForm((p) => (p ? { ...p, notes: e.target.value } : p))} rows={3} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h3 className="mb-3 text-sm font-bold text-gray-800">Contact Overview</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <p className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> Referrals: {connection.total_referrals || 0}</p>
              <p className="flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Successful: {connection.successful_referrals || 0}</p>
              <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-blue-600" /> Connected Deals: {relatedTransactions.length}</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-gray-500" /> {connection.email || 'No email'}</p>
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-gray-500" /> {connection.phone || connection.telephone || 'No phone'}</p>
              {connection.address && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-500" /> {connection.address}</p>}
              {connection.website && <p className="flex items-center gap-2"><Globe className="h-4 w-4 text-gray-500" /><a href={connection.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Website</a></p>}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h3 className="mb-3 text-sm font-bold text-gray-800">Business Card</h3>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadBusinessCard(file)
                }}
              />
              {isUploadingBusinessCard ? 'Uploading...' : 'Upload Business Card'}
            </label>

            {form.business_card_key ? (
              <div
                className="mt-3 block rounded-xl border border-gray-100 bg-gray-50 p-2 cursor-pointer hover:border-gray-300 transition-colors relative group"
                onClick={() => window.open(form.business_card_key!, '_blank')}
                title="Click to view full size"
              >
                <img src={form.business_card_key} alt="Business card" className="h-36 w-full rounded-lg object-contain" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-all flex items-center justify-center">
                  <ZoomIn className="h-5 w-5 text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-gray-500">No business card uploaded yet.</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <h3 className="mb-3 text-sm font-bold text-gray-800">Deal Pipeline Status</h3>
            <div className="space-y-2">
              {Object.keys(pipelineStats).length === 0 && <p className="text-xs text-gray-500">No connected deals detected yet.</p>}
              {Object.entries(pipelineStats).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                  <span className="font-medium capitalize text-gray-700">{status.replace('_', ' ')}</span>
                  <span className="font-bold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-bold text-gray-800">Client Experience History</h3>
          <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
            {relatedReferrals.length === 0 && <p className="text-sm text-gray-500">No referral history for this contact yet.</p>}
            {relatedReferrals.map((r) => (
              <div key={r.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-gray-800">{r.client_name}</p>
                  <span className="text-[11px] uppercase font-bold text-gray-500">{r.status}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString()} • Sent by {r.sender_name || 'Unknown'}</p>
                <p className="mt-1 text-xs text-gray-600">Type: {r.referral_type === 'buy' ? 'Buying Client' : 'Selling Client'}</p>
                {r.experience_rating ? <p className="mt-1 text-xs text-amber-700">Experience: {r.experience_rating}/5</p> : null}
                {r.experience_notes ? <p className="mt-1 text-xs text-gray-700">{r.experience_notes}</p> : null}
                {r.notes ? <p className="mt-1 text-xs text-gray-600">{r.notes}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card">
          <h3 className="mb-3 text-sm font-bold text-gray-800">Connected Deal Pipelines</h3>
          <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
            {relatedTransactions.length === 0 && <p className="text-sm text-gray-500">No pipeline connections found from current deal data.</p>}
            {relatedTransactions.map((tx) => (
              <div key={tx.id} className="rounded-xl border border-gray-100 p-3">
                <p className="text-sm font-semibold text-gray-800">{tx.name}</p>
                <p className="mt-1 text-xs text-gray-500">Status: <span className="font-semibold capitalize">{tx.status.replace('_', ' ')}</span></p>
                <p className="mt-1 text-xs text-gray-500">Created: {new Date(tx.created_at).toLocaleDateString()}</p>
                {tx.target_close_date ? <p className="mt-1 text-xs text-gray-500">Target Close: {new Date(tx.target_close_date).toLocaleDateString()}</p> : null}
                <button
                  onClick={() => navigate(`/transactions/${tx.id}`)}
                  className="mt-2 text-xs font-semibold text-brand-navy hover:underline"
                >
                  Open Deal
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Layout>
  )
}
