import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Search, Plus, Filter,
  X, Loader2, Download, UserCheck, ListPlus, ArrowRight, AlertTriangle, ArrowUpRight,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Pagination } from '@/components/common/Pagination'
import { useAuth } from '@/context/AuthContext'
import { findDuplicateContacts, validateEmail, validateAddress } from '@/utils/reconciliation'

interface Contact {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  type: string
  status: string
  source: string | null
  notes: string | null
  tags: string[]
  address: string | null
  assigned_to: string | null
  timeline?: string | null
  budget_min?: number | null
  budget_max?: number | null
  financing_readiness?: string | null
  move_date?: string | null
  seller_motivation?: string | null
  representation_status?: string | null
  urgency?: string | null
  preferred_contact_method?: string | null
  language?: string | null
  next_follow_up_date?: string | null
  next_action?: string | null
  lead_stage?: string | null
  created_at: string
  updated_at: string
}

interface Stats {
  total: number
  active: number
  prospects: number
  closed: number
  overdue?: number
  needsFollowUp?: number
  qualified?: number
  newLeads?: number
}
interface UserTarget { id: string; name: string; role: string; email: string }
interface MailingList { id: string; name: string; member_count?: number }

const STAGE_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  needs_follow_up: 'bg-amber-100 text-amber-800 font-bold',
  overdue: 'bg-red-100 text-red-800 font-extrabold animate-pulse',
  qualified: 'bg-emerald-100 text-emerald-800',
  nurture: 'bg-purple-100 text-purple-800',
  converted: 'bg-teal-100 text-teal-800',
  closed_lost: 'bg-gray-100 text-gray-600',
}

const TYPE_LABELS: Record<string, string> = {
  buyer: 'Buyer', seller: 'Seller', both: 'Buyer/Seller',
  referral: 'Referral', vendor: 'Vendor', landlord: 'Landlord',
  tenant: 'Tenant', agent: 'Agent', other: 'Other',
}

const INITIAL_FORM = {
  firstName: '', lastName: '', email: '', phone: '',
  type: 'buyer', status: 'prospect', source: 'Website', notes: '', address: '',
  tagsText: '',
  timeline: '', budgetMin: 0, budgetMax: 0, financingReadiness: 'pre_approved',
  moveDate: '', sellerMotivation: '', representationStatus: 'unrepresented',
  urgency: 'medium', preferredContactMethod: 'phone', language: 'English',
  nextFollowUpDate: new Date().toISOString().substring(0, 10), nextAction: 'Initial Discovery Call', leadStage: 'new',
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Request failed')
  return data.data
}

export function CRMPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [contacts, setContacts] = useState<Contact[]>([])
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, prospects: 0, closed: 0, overdue: 0, needsFollowUp: 0, qualified: 0, newLeads: 0 })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState<'all' | 'me' | string>('all')
  const [showModal, setShowModal] = useState(false)
  const [intakeTab, setIntakeTab] = useState<'quick' | 'full'>('quick')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)

  // Smart post-save prompt modal
  const [savedContact, setSavedContact] = useState<Contact | null>(null)

  // Duplicate warning state
  const [duplicateMatches, setDuplicateMatches] = useState<any[]>([])

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewContact, setPreviewContact] = useState<Contact | null>(null)
  const [users, setUsers] = useState<UserTarget[]>([])
  const [lists, setLists] = useState<MailingList[]>([])
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkListId, setBulkListId] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [typeLabels] = useState<Record<string, string>>(TYPE_LABELS)

  const LIMIT = 20

  const loadContacts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(LIMIT),
        ...(query && { q: query }),
        ...(typeFilter && { type: typeFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(stageFilter && { lead_stage: stageFilter }),
        ...(['admin', 'broker'].includes(user?.role || '') && createdByFilter !== 'all'
          ? { assigned_to: createdByFilter === 'me' ? user?.id || '' : createdByFilter }
          : {}),
      })
      const data = await apiFetch(`/api/contacts?${params}`)
      setContacts(data.contacts)
      setTotal(data.total)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [page, query, typeFilter, statusFilter, stageFilter, createdByFilter, user])

  const loadStats = useCallback(async () => {
    try { setStats(await apiFetch('/api/contacts/stats')) } catch (e) { console.error(e) }
  }, [])

  const loadTools = useCallback(async () => {
    try {
      const [userData, listData] = await Promise.all([
        apiFetch('/api/contacts/tools/users').catch(() => []),
        apiFetch('/api/contacts/lists').catch(() => []),
      ])
      setUsers(Array.isArray(userData) ? userData : [])
      setLists(Array.isArray(listData) ? listData : [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (user) {
      setCreatedByFilter(['admin', 'broker'].includes(user.role) ? 'me' : 'all')
    }
  }, [user])

  useEffect(() => { loadContacts(); loadStats() }, [loadContacts, loadStats])
  useEffect(() => { loadTools() }, [loadTools])
  useEffect(() => { setPage(1) }, [query, typeFilter, statusFilter, stageFilter, createdByFilter])

  // Check for duplicate matches when email or phone changes during intake
  useEffect(() => {
    if (!form.email && !form.phone && (!form.firstName.trim() || !form.lastName.trim())) {
      setDuplicateMatches([])
      return
    }
    const matches = findDuplicateContacts(
      { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone },
      contacts as any
    )
    setDuplicateMatches(matches)
  }, [form.email, form.phone, form.firstName, form.lastName, contacts])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const selectedCount = selectedIds.size
  const allOnPageSelected = useMemo(() => contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id)), [contacts, selectedIds])

  const toggleSelectAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) contacts.forEach((c) => next.add(c.id))
      else contacts.forEach((c) => next.delete(c.id))
      return next
    })
  }

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Email validation
    if (form.email && form.email.trim() && !validateEmail(form.email.trim())) {
      alert('Invalid Email Format: Please enter a valid email address (e.g. client@domain.com).')
      return
    }
    
    // Address validation
    if (form.address && form.address.trim()) {
      const addrResult = validateAddress(form.address.trim())
      if (!addrResult.valid) {
        alert(`Invalid Address Format:\n${addrResult.errors.join('\n')}`)
        return
      }
      // Normalize address if valid
      if (addrResult.normalized) {
        form.address = addrResult.normalized
      }
    }
    
    setSaving(true)
    try {
      const payload = {
        ...form,
        tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      }
      const res = await apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(payload) })
      setShowModal(false)
      setForm(INITIAL_FORM)
      setSavedContact(res.contact)
      await Promise.all([loadContacts(), loadStats()])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleMergeContacts = async (targetId: string, sourceId: string) => {
    if (!confirm('Merge duplicate record into existing contact?')) return
    try {
      await apiFetch('/api/contacts/merge', {
        method: 'POST',
        body: JSON.stringify({ targetId, sourceId }),
      })
      alert('Contacts merged successfully.')
      await Promise.all([loadContacts(), loadStats()])
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleExport = async (selectedOnly: boolean) => {
    setBulkLoading(true)
    try {
      const payload = selectedOnly
        ? { contactIds: Array.from(selectedIds) }
        : { q: query, type: typeFilter, status: statusFilter }
      const data = await apiFetch('/api/contacts/bulk/export', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = data.filename || 'contacts-export.csv'
      a.click()
      URL.revokeObjectURL(href)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleAssignSelected = async () => {
    if (!bulkAssignee || selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      await apiFetch('/api/contacts/bulk/assign', {
        method: 'POST',
        body: JSON.stringify({ assignedTo: bulkAssignee, contactIds: Array.from(selectedIds) }),
      })
      clearSelection()
      await loadContacts()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleAddToList = async () => {
    if (!bulkListId || selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      await apiFetch('/api/contacts/bulk/add-to-list', {
        method: 'POST',
        body: JSON.stringify({ listId: bulkListId, contactIds: Array.from(selectedIds) }),
      })
      clearSelection()
      await loadTools()
      alert('Contacts added to mailing list')
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleRowClick = (contact: Contact) => {
    if (window.innerWidth >= 1280) {
      setPreviewContact(contact)
      return
    }
    navigate(`/marketing/crm/${contact.id}`)
  }

  return (
    <Layout title="CRM — Lead & Contact Operating System">
      {/* Lead Queue Cards & Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { id: '', label: 'Total Contacts', value: stats.total, color: '#3B82F6', active: statusFilter === '' && stageFilter === '' },
          { id: 'needs_follow_up', label: 'Needs Follow-up Today', value: stats.needsFollowUp || 0, color: '#F59E0B', active: stageFilter === 'needs_follow_up' },
          { id: 'overdue', label: 'Overdue Follow-ups', value: stats.overdue || 0, color: '#EF4444', active: stageFilter === 'overdue' },
          { id: 'qualified', label: 'Qualified Leads', value: stats.qualified || 0, color: '#10B981', active: stageFilter === 'qualified' },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => {
              if (s.id === 'needs_follow_up' || s.id === 'overdue' || s.id === 'qualified') {
                setStageFilter((prev) => (prev === s.id ? '' : s.id))
                setStatusFilter('')
              } else {
                setStatusFilter('')
                setStageFilter('')
              }
            }}
            className={`text-left bg-white rounded-2xl p-4 shadow-card border transition-all ${
              s.active ? 'border-brand-navy ring-2 ring-brand-navy/20 bg-gray-50/50' : 'border-gray-100 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-2xl font-extrabold text-gray-900">{s.value}</p>
              {s.active && <span className="text-[10px] font-bold uppercase tracking-wider text-brand-navy bg-brand-navy/10 px-2 py-0.5 rounded-full">Filter Active</span>}
            </div>
            <p className="text-xs font-bold text-gray-600 mt-1">{s.label}</p>
            <div className="h-1.5 w-12 rounded-full mt-2" style={{ backgroundColor: s.color }} />
          </button>
        ))}
      </div>

      {/* Lead Queue Filter Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2">Queue:</span>
        {[
          { id: '', label: 'All Contacts' },
          { id: 'new', label: 'New Intake' },
          { id: 'needs_follow_up', label: 'Needs Follow-up' },
          { id: 'overdue', label: 'Overdue' },
          { id: 'qualified', label: 'Qualified' },
          { id: 'nurture', label: 'Nurture' },
          { id: 'converted', label: 'Converted' },
          { id: 'closed_lost', label: 'Closed Lost' },
        ].map((q) => (
          <button
            key={q.id}
            onClick={() => setStageFilter(q.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              stageFilter === q.id
                ? 'bg-brand-navy text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Action Controls & Search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search leads by name, email, phone, or address..." className="flex-1 text-sm focus:outline-none" />
        </div>

        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-sm focus:outline-none bg-transparent">
            <option value="">All Types</option>
            {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-sm focus:outline-none bg-transparent">
            <option value="">All Statuses</option>
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="closed">Closed</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {['admin', 'broker'].includes(user?.role || '') && (
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <select
              value={createdByFilter}
              onChange={(e) => setCreatedByFilter(e.target.value)}
              className="text-sm focus:outline-none bg-transparent"
            >
              <option value="me">Assigned to me</option>
              <option value="all">All team leads</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}

        <button onClick={() => handleExport(false)} disabled={bulkLoading} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5">
          <Download className="h-4 w-4" /> Export Filtered
        </button>

        <button onClick={() => navigate('/marketing/crm/lists')} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Mailing & Email Lists</button>

        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors shadow-sm">
          <Plus className="h-4 w-4" /> Add Lead / Contact
        </button>
      </div>

      {selectedCount > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card mb-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => handleExport(true)} disabled={bulkLoading || selectedCount === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> Export Selected ({selectedCount})
            </button>

            <div className="mx-1 h-6 w-px bg-gray-200" />

            <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-2 text-xs bg-white focus:outline-none" disabled={users.length === 0}>
              <option value="">Assign to...</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
            <button onClick={handleAssignSelected} disabled={bulkLoading || selectedCount === 0 || !bulkAssignee} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <UserCheck className="h-3.5 w-3.5" /> Assign Selected
            </button>

            <div className="mx-1 h-6 w-px bg-gray-200" />

            <select value={bulkListId} onChange={(e) => setBulkListId(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-2 text-xs bg-white focus:outline-none">
              <option value="">Add to list...</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button onClick={handleAddToList} disabled={bulkLoading || selectedCount === 0 || !bulkListId} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <ListPlus className="h-3.5 w-3.5" /> Add Selected
            </button>

            <button onClick={clearSelection} className="ml-auto text-xs text-gray-500 hover:text-gray-700">Clear Selection</button>
          </div>
        </div>
      )}

      {/* Main Table & Quick Preview */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 text-brand-navy animate-spin" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-sm z-10">
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-3"><input type="checkbox" checked={allOnPageSelected} onChange={(e) => toggleSelectAllOnPage(e.target.checked)} /></th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact / Lead</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Qualification</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Next Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Queue Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="hover:bg-gray-50/80 transition-colors cursor-pointer group"
                      onClick={() => handleRowClick(contact)}
                    >
                      <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.has(contact.id)} onChange={(e) => toggleSelect(contact.id, e.target.checked)} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="h-9 w-9 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-brand-navy font-semibold text-sm">{contact.first_name[0]}{contact.last_name[0]}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 truncate">{contact.first_name} {contact.last_name}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                {contact.email && <span className="text-xs text-gray-500 truncate">{contact.email}</span>}
                                {contact.phone && <span className="text-xs text-gray-500 truncate">{contact.phone}</span>}
                              </div>
                            </div>
                          </div>

                          {/* Hover Actions */}
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/marketing/crm/${contact.id}`) }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 font-bold text-xs border border-gray-200"
                            >
                              Qualify <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="text-xs space-y-0.5">
                          <p className="font-bold text-gray-800 capitalize">{typeLabels[contact.type] ?? contact.type}</p>
                          {contact.budget_max ? <p className="text-gray-500">Max Budget: ${Number(contact.budget_max).toLocaleString()}</p> : null}
                          {contact.financing_readiness ? <p className="text-gray-400 capitalize">{contact.financing_readiness.replace('_', ' ')}</p> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <div className="text-xs">
                          {contact.next_action ? <p className="font-medium text-gray-800">{contact.next_action}</p> : <p className="text-gray-400 italic">No next action set</p>}
                          {contact.next_follow_up_date ? <p className="text-[11px] font-bold text-blue-600 mt-0.5">📅 {contact.next_follow_up_date}</p> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${STAGE_COLORS[contact.lead_stage || 'new'] || 'bg-gray-100 text-gray-600'}`}>
                          {(contact.lead_stage || 'new').replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {!loading && contacts.length === 0 && (
              <div className="text-center py-20 text-gray-500 bg-white rounded-2xl">
                <TrendingUp className="h-16 w-16 mx-auto mb-4 text-brand-navy opacity-20 animate-pulse" />
                <h3 className="text-lg font-semibold text-gray-800">No leads found in this queue</h3>
                <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">Start building your pipeline by adding new prospects or qualifying active buyer/seller leads.</p>
                <button onClick={() => setShowModal(true)} className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors">
                  <Plus className="h-4 w-4" /> Add Lead Intake
                </button>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={LIMIT} onPageChange={setPage}
              className="border-t border-gray-100 px-5 py-3 flex items-center justify-between text-xs text-gray-500" />
          )}
        </div>

        {/* Quick Preview Panel */}
        <aside className="hidden xl:block w-80 rounded-2xl border border-gray-100 bg-white shadow-card h-fit sticky top-24">
          {previewContact ? (
            <div className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                <div>
                  <p className="font-bold text-gray-800">{previewContact.first_name} {previewContact.last_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{typeLabels[previewContact.type] ?? previewContact.type}</p>
                </div>
                <button onClick={() => setPreviewContact(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
              </div>

              {previewContact.email && <p className="text-xs text-gray-700">📧 {previewContact.email}</p>}
              {previewContact.phone && <p className="text-xs text-gray-700">📞 {previewContact.phone}</p>}
              {previewContact.next_follow_up_date && <p className="text-xs font-bold text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">📅 Follow-up: {previewContact.next_follow_up_date}</p>}

              <button onClick={() => navigate(`/marketing/crm/${previewContact.id}`)} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:bg-brand-navy-light w-full">
                Open Qualification Record <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="p-4 text-xs text-gray-400">Select a lead from the list to preview quick qualification details.</div>
          )}
        </aside>
      </div>

      {/* INTAKE MODAL (QUICK ADD VS FULL LEAD QUALIFICATION) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIntakeTab('quick')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    intakeTab === 'quick' ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Quick Add Contact
                </button>
                <button
                  type="button"
                  onClick={() => setIntakeTab('full')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    intakeTab === 'full' ? 'bg-brand-navy text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Qualify Full Lead Intake
                </button>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
            </div>

            {/* Duplicate Match Warning */}
            {duplicateMatches.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <span>Potential Duplicate Record Detected</span>
                </div>
                {duplicateMatches.map((m) => (
                  <div key={m.contact.id} className="flex items-center justify-between bg-white p-2 rounded-lg border border-amber-200">
                    <div>
                      <p className="font-bold text-gray-800">{m.contact.first_name} {m.contact.last_name}</p>
                      <p className="text-[10px] text-gray-500">{m.contact.email || m.contact.phone || 'No phone'}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleMergeContacts(m.contact.id, form.email || form.phone)}
                        className="text-[10px] font-bold border border-amber-300 text-amber-800 px-2 py-1 rounded-md hover:bg-amber-100"
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowModal(false)
                          navigate(`/marketing/crm/${m.contact.id}`)
                        }}
                        className="text-[10px] font-bold bg-amber-600 text-white px-2 py-1 rounded-md"
                      >
                        View Existing
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">First Name *</label>
                  <input required value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-brand-navy" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Last Name *</label>
                  <input required value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-brand-navy" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-brand-navy" />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-brand-navy" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white focus:ring-2 focus:ring-brand-navy">
                    {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Source</label>
                  <select value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white focus:ring-2 focus:ring-brand-navy">
                    {['Website', 'Referral', 'Open House', 'MLS', 'Networking', 'Social Media', 'Cold Call', 'Other'].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              {intakeTab === 'full' && (
                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <p className="font-bold text-gray-800">Lead Qualification Intake</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Timeline</label>
                      <select value={form.timeline} onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white">
                        <option value="immediate">Immediate (&lt; 30 days)</option>
                        <option value="1_3_months">1 - 3 Months</option>
                        <option value="3_6_months">3 - 6 Months</option>
                        <option value="6_plus_months">6+ Months</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Financing</label>
                      <select value={form.financingReadiness} onChange={(e) => setForm((f) => ({ ...f, financingReadiness: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 bg-white">
                        <option value="pre_approved">Pre-Approved</option>
                        <option value="all_cash">All Cash</option>
                        <option value="pre_qualified">Pre-Qualified</option>
                        <option value="needs_lender">Needs Lender</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Next Follow-Up Date *</label>
                      <input type="date" value={form.nextFollowUpDate} onChange={(e) => setForm((f) => ({ ...f, nextFollowUpDate: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-brand-navy" />
                    </div>
                    <div>
                      <label className="block font-semibold text-gray-700 mb-1">Next Action *</label>
                      <input value={form.nextAction} onChange={(e) => setForm((f) => ({ ...f, nextAction: e.target.value }))} placeholder="e.g. Schedule Call" className="w-full rounded-xl border border-gray-200 px-3 py-2 focus:ring-2 focus:ring-brand-navy" />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-gray-100">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-600">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-brand-navy text-white font-bold hover:bg-brand-navy-light disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SMART POST-SAVE PROMPT MODAL */}
      {savedContact && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Lead Saved! What should happen next?</h3>
            <p className="text-xs text-gray-500">{savedContact.first_name} {savedContact.last_name} is registered in your pipeline.</p>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  const cid = savedContact.id
                  setSavedContact(null)
                  navigate(`/marketing/crm/${cid}`)
                }}
                className="w-full py-2.5 rounded-xl bg-brand-navy text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-brand-navy-light"
              >
                <ArrowRight className="h-4 w-4" /> Complete Qualification Profile
              </button>

              <button
                onClick={() => {
                  const cid = savedContact.id
                  setSavedContact(null)
                  navigate(`/marketing/crm/${cid}`)
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-700"
              >
                <ArrowUpRight className="h-4 w-4" /> Convert to Active Deal
              </button>

              <button
                onClick={() => setSavedContact(null)}
                className="w-full py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
              >
                Done / Stay on List
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
