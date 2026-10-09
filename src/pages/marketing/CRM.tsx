import { ListingInquiriesPanel } from '@/components/marketing/ListingInquiriesPanel'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus,
  X, Download, UserCheck, ArrowUpRight, Upload,
  Rocket, Calendar, Clock, CheckCircle2, Phone, Mail, Archive, Building2,
  Target, Users, Star, Inbox, RotateCcw, UserPlus, Trash2, Printer
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { SkeletonTable } from '@/components/common/SkeletonLoader'
import { Pagination } from '@/components/common/Pagination'
import { useAuth } from '@/context/AuthContext'
import { validateEmail, validateAddress } from '@/utils/reconciliation'
import { ConvertToDealModal } from '@/components/marketing/ConvertToDealModal'
import { AgentFilterDropdown } from '@/components/transactions/AgentFilterDropdown'
import { apiFetch } from '@/utils/api'
import { getLocalDateString, getDaysUntilDate } from '@/utils/date'
import { ListingDetailDrawer } from '@/components/transactions/ListingDetailDrawer'
import clsx from 'clsx'

export interface Contact {
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
  assigned_to_name?: string | null
  assigned_to_role?: string | null
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
  qualification_status?: string | null
  source_listing_id?: string | null
  is_archived?: number
  lifecycle_stage?: string | null
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
  leads?: number
  activeClients?: number
  sphere?: number
  inquiries?: number
}

interface UserTarget { id: string; name: string; role: string; email: string; contactCount?: number }

type LifecycleTab = 'leads' | 'active_clients' | 'sphere' | 'inquiries'

const TYPE_LABELS: Record<string, string> = {
  buyer: 'Buyer', seller: 'Seller', both: 'Buyer/Seller',
  referral: 'Referral', vendor: 'Vendor', landlord: 'Landlord',
  tenant: 'Tenant', agent: 'Agent', other: 'Other',
}

const STAGE_COLORS: Record<string, string> = {
  unqualified: 'bg-blue-50 text-blue-700 border-blue-200',
  attempted_contact: 'bg-amber-50 text-amber-800 border-amber-200 font-semibold',
  engaged: 'bg-purple-50 text-purple-700 border-purple-200',
  qualified: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold',
  disqualified: 'bg-gray-100 text-gray-600 border-gray-200',
}

const BUDGET_BRACKETS = [
  { value: '', label: 'All Budgets' },
  { value: 'under_500k', label: 'Under $500k' },
  { value: '500k_1m', label: '$500k – $1M' },
  { value: '1m_2m', label: '$1M – $2M' },
  { value: '2m_plus', label: '$2M+' },
]

const INITIAL_FORM = {
  firstName: '', lastName: '', email: '', phone: '',
  type: 'buyer', status: 'prospect', source: 'Website', notes: '', address: '',
  tagsText: '',
  timeline: '', budgetMin: 0, budgetMax: 0, financingReadiness: 'pre_approved',
  moveDate: '', sellerMotivation: '', representationStatus: 'unrepresented',
  urgency: 'medium', preferredContactMethod: 'phone', language: 'English',
  nextFollowUpDate: getLocalDateString(), nextAction: 'Initial Discovery Call', leadStage: 'unqualified',
  lifecycleStage: 'lead', sourceListingId: '',
}

export function CRMPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // Lifecycle Tab
  const [lifecycleTab, setLifecycleTab] = useState<LifecycleTab>('leads')

  const [contacts, setContacts] = useState<Contact[]>([])
  const [agendaItems, setAgendaItems] = useState<Contact[]>([])
  const [stats, setStats] = useState<Stats>({
    total: 0, active: 0, prospects: 0, closed: 0, overdue: 0,
    needsFollowUp: 0, qualified: 0, newLeads: 0, leads: 0, activeClients: 0, sphere: 0, inquiries: 0
  })
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [budgetBracketFilter, setBudgetBracketFilter] = useState('')
  const [assignedToFilter, setAssignedToFilter] = useState<'all' | 'me' | string>('all')
  const [showArchivedInquiries, setShowArchivedInquiries] = useState(false)

  // Modals & Action States
  const [showInquiryContacts, setShowInquiryContacts] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [convertingContact, setConvertingContact] = useState<Contact | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewContact, setPreviewContact] = useState<Contact | null>(null)
  const [linkedListingId, setLinkedListingId] = useState<string | null>(null)
  const contactRequestRef = useRef(0)

  const [showImportModal, setShowImportModal] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<string | null>(null)

  const [users, setUsers] = useState<UserTarget[]>([])
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [bulkLoading, setBulkLoading] = useState(false)

  const LIMIT = 20

  const loadContacts = useCallback(async () => {
    const requestId = ++contactRequestRef.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
        lifecycle_stage: lifecycleTab,
        is_archived: showArchivedInquiries && lifecycleTab === 'inquiries' ? '1' : '0',
        ...(query && { q: query }),
        ...(typeFilter && { type: typeFilter }),
        ...(budgetBracketFilter && { budget_bracket: budgetBracketFilter }),
        ...(['admin', 'broker'].includes(user?.role || '') && assignedToFilter !== 'all'
          ? { assigned_to: assignedToFilter === 'me' ? user?.id || '' : assignedToFilter }
          : {}),
      })
      const data = await apiFetch(`/api/contacts?${params}`)
      if (requestId === contactRequestRef.current) {
        setContacts(data.contacts || [])
        setTotal(data.total || 0)
      }
    } catch (e) {
      console.error(e)
    } finally {
      if (requestId === contactRequestRef.current) setLoading(false)
    }
  }, [page, lifecycleTab, showArchivedInquiries, query, typeFilter, budgetBracketFilter, assignedToFilter, user])

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch('/api/contacts/stats')
      setStats(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  const loadAgenda = useCallback(async () => {
    try {
      const localDate = getLocalDateString()
      const data = await apiFetch(`/api/contacts/agenda?client_date=${localDate}`)
      setAgendaItems(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  const loadTools = useCallback(async () => {
    try {
      const userData = await apiFetch('/api/contacts/tools/users').catch(() => [])
      setUsers(Array.isArray(userData) ? userData : [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (user) {
      setAssignedToFilter('all')
    }
  }, [user])

  useEffect(() => {
    loadContacts()
    loadStats()
    loadAgenda()
  }, [loadContacts, loadStats, loadAgenda])

  useEffect(() => {
    loadTools()
  }, [loadTools])

  useEffect(() => {
    setPage(1)
  }, [lifecycleTab, query, typeFilter, budgetBracketFilter, assignedToFilter, showArchivedInquiries])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))
  const selectedCount = selectedIds.size
  const allOnPageSelected = useMemo(() => contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id)), [contacts, selectedIds])
  const userById = useMemo(() => new Map(users.map((owner) => [owner.id, owner])), [users])
  const contactCountByOwner = useMemo(
    () => Object.fromEntries(users.map((owner) => [owner.id, owner.contactCount || 0])),
    [users],
  )

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

  const openAddModal = () => {
    setForm({
      ...INITIAL_FORM,
      nextFollowUpDate: getLocalDateString(),
      lifecycleStage: lifecycleTab === 'inquiries' ? 'inquiry' : lifecycleTab === 'active_clients' ? 'active_client' : lifecycleTab === 'sphere' ? 'past_client' : 'lead'
    })
    setShowModal(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.email && form.email.trim() && !validateEmail(form.email.trim())) {
      alert('Invalid Email Format: Please enter a valid email address.')
      return
    }

    if (form.address && form.address.trim()) {
      const addrResult = validateAddress(form.address.trim())
      if (!addrResult.valid) {
        alert(`Invalid Address Format:\n${addrResult.errors.join('\n')}`)
        return
      }
      if (addrResult.normalized) {
        form.address = addrResult.normalized
      }
    }

    setSaving(true)
    try {
      const payload = {
        ...form,
        qualificationStatus: form.leadStage,
        tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      }
      await apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(payload) })
      setShowModal(false)
      setForm(INITIAL_FORM)
      await Promise.all([loadContacts(), loadStats(), loadAgenda()])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleBatchArchive = async (archive: boolean) => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      await apiFetch('/api/contacts/batch-archive', {
        method: 'POST',
        body: JSON.stringify({ contactIds: Array.from(selectedIds), isArchived: archive }),
      })
      clearSelection()
      await Promise.all([loadContacts(), loadStats()])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBatchPromote = async () => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      await apiFetch('/api/contacts/batch-promote', {
        method: 'POST',
        body: JSON.stringify({ contactIds: Array.from(selectedIds), targetStage: 'lead' }),
      })
      clearSelection()
      await Promise.all([loadContacts(), loadStats()])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} selected contacts?`)) return
    setBulkLoading(true)
    try {
      await apiFetch('/api/contacts/bulk/delete', {
        method: 'POST',
        body: JSON.stringify({ contactIds: Array.from(selectedIds) }),
      })
      clearSelection()
      if (previewContact && selectedIds.has(previewContact.id)) {
        setPreviewContact(null)
      }
      await Promise.all([loadContacts(), loadStats(), loadAgenda()])
    } catch (err: any) {
      alert(err.message)
    } finally {
      setBulkLoading(false)
    }
  }

  const handlePromoteInquiry = async (contactId: string) => {
    try {
      await apiFetch('/api/contacts/promote-inquiry', {
        method: 'POST',
        body: JSON.stringify({ contactId, targetStage: 'lead' }),
      })
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
        : { q: query, type: typeFilter, lifecycle_stage: lifecycleTab }
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

  const handleMarkFollowUpDone = async (contact: Contact) => {
    try {
      await apiFetch(`/api/contacts/${contact.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'note',
          title: `Completed Follow-up: ${contact.next_action || 'Touchpoint'}`,
          body: `Marked completed on ${new Date().toLocaleDateString()}`
        })
      })
      await apiFetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nextFollowUpDate: null,
          nextAction: null,
          qualificationStatus: contact.qualification_status || 'unqualified'
        })
      })
      if (previewContact?.id === contact.id) {
        setPreviewContact({ ...previewContact, next_follow_up_date: null, next_action: null })
      }
      await Promise.all([loadContacts(), loadStats(), loadAgenda()])
    } catch (err: any) {
      alert(err.message || 'Failed to complete touchpoint')
    }
  }

  const handleRescheduleFollowUp = async (contact: Contact, daysAhead: number) => {
    try {
      const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
      const dateStr = getLocalDateString(targetDate)
      await apiFetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nextFollowUpDate: dateStr,
          nextAction: contact.next_action || 'Scheduled Follow-up'
        })
      })
      if (previewContact?.id === contact.id) {
        setPreviewContact({ ...previewContact, next_follow_up_date: dateStr })
      }
      await Promise.all([loadContacts(), loadStats(), loadAgenda()])
    } catch (err: any) {
      alert(err.message || 'Failed to reschedule touchpoint')
    }
  }

  const handleDeleteSingleContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return
    try {
      await apiFetch(`/api/contacts/${contactId}`, { method: 'DELETE' })
      if (previewContact?.id === contactId) {
        setPreviewContact(null)
      }
      await Promise.all([loadContacts(), loadStats(), loadAgenda()])
    } catch (err: any) {
      alert(err.message || 'Failed to delete contact')
    }
  }

  const handleImportCSV = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!csvFile) return

    setIsImporting(true)
    setImportSummary(null)

    try {
      const text = await csvFile.text()
      const lines = text.split(/\r?\n/).filter(line => line.trim())
      if (lines.length <= 1) {
        alert('CSV file is empty or only contains headers.')
        setIsImporting(false)
        return
      }

      const headers = lines[0].split(',').map(h => h.toLowerCase().trim().replace(/[\s_-]+/g, ''))
      const rows = lines.slice(1)
      let successCount = 0

      for (const rawLine of rows) {
        const row = rawLine.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''))
        if (!row[0]) continue

        const getVal = (aliases: string[]) => {
          const idx = headers.findIndex(h => aliases.includes(h))
          return idx !== -1 ? row[idx] : undefined
        }

        const firstName = getVal(['firstname', 'first', 'name']) || row[0]
        const lastName = getVal(['lastname', 'last']) || ''
        const email = getVal(['email', 'mail']) || null
        const phone = getVal(['phone', 'tel', 'mobile']) || null
        const type = getVal(['type', 'contacttype']) || 'buyer'

        try {
          await apiFetch('/api/contacts', {
            method: 'POST',
            body: JSON.stringify({
              firstName,
              lastName,
              email,
              phone,
              type,
              status: 'prospect',
              lifecycleStage: lifecycleTab === 'inquiries' ? 'inquiry' : 'lead',
              qualificationStatus: 'unqualified',
              source: 'CSV Import'
            })
          })
          successCount++
        } catch { /* continue */ }
      }

      setImportSummary(`Successfully imported ${successCount} contacts.`)
      await Promise.all([loadContacts(), loadStats()])
      setCsvFile(null)
    } catch {
      alert('Failed to parse or import CSV.')
    } finally {
      setIsImporting(false)
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
    <Layout title="CRM & Client Relationship Operating System">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #today-action-agenda, #today-action-agenda * { visibility: visible !important; }
          #today-action-agenda { position: absolute; inset: 0 auto auto 0; width: 100%; box-shadow: none; border: 0; background: white; }
          #today-action-agenda .agenda-no-print { display: none !important; }
          #today-action-agenda .agenda-card { break-inside: avoid; border-color: #d1d5db; }
        }
      `}</style>
      {/* ── 1. TODAY'S ACTION AGENDA (If due items exist) ── */}
      {agendaItems.length > 0 && (
        <div id="today-action-agenda" className="mb-6 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 p-4 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-white shadow-2xs">
                <Clock className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-900">
                Today's Action Agenda ({agendaItems.length} Due)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-amber-700">Scheduled client touchpoints for today</span>
              <button
                type="button"
                onClick={() => window.print()}
                className="agenda-no-print inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
              >
                <Printer className="h-3 w-3" /> Print
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agendaItems.map((c) => {
              const diffDays = getDaysUntilDate(c.next_follow_up_date)
              return (
                <div key={c.id} className="agenda-card rounded-xl border border-amber-200/90 bg-white p-3 shadow-2xs flex items-center justify-between gap-3 hover:border-amber-300 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-gray-900 truncate">{c.first_name} {c.last_name}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-700 capitalize">
                        {TYPE_LABELS[c.type] || c.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 truncate mt-0.5 font-medium">
                      {c.next_action || 'Touchpoint follow-up'}
                    </p>
                    <p className="text-[10px] font-bold text-amber-700 mt-1 flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {diffDays === 0 ? 'Due Today' : diffDays !== null && diffDays < 0 ? `Overdue by ${Math.abs(diffDays)}d` : `Due ${c.next_follow_up_date}`}
                    </p>
                  </div>

                  <div className="agenda-no-print flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleMarkFollowUpDone(c)}
                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors cursor-pointer"
                      title="Mark Touchpoint Done"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
                        title={`Call ${c.first_name}`}
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors"
                        title={`Email ${c.first_name}`}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => navigate(`/marketing/crm/${c.id}`)}
                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-colors cursor-pointer"
                      title="View Profile"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 2. FOUR LIFECYCLE HUBS (Top Navigation Tabs) ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {[
          { id: 'leads' as const, label: 'Leads & Inbound', icon: Target, iconColor: 'text-blue-600', count: stats.leads || stats.prospects || 0, desc: 'Unrepresented prospects & buyer discovery' },
          { id: 'active_clients' as const, label: 'Active Clients', icon: Users, iconColor: 'text-emerald-600', count: stats.activeClients || stats.active || 0, desc: 'Represented clients in live transactions' },
          { id: 'sphere' as const, label: 'Sphere & Past Clients', icon: Star, iconColor: 'text-amber-500', count: stats.sphere || stats.closed || 0, desc: 'Past closed buyers, sellers & referral network' },
          { id: 'inquiries' as const, label: 'Listing Inquiries Pool', icon: Inbox, iconColor: 'text-indigo-600', count: stats.inquiries || 0, desc: 'People, listings & showing appointments' },
        ].map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setLifecycleTab(tab.id)}
              className={clsx(
                "flex-1 min-w-[200px] text-left p-3.5 rounded-2xl border transition-all cursor-pointer",
                lifecycleTab === tab.id
                  ? "bg-white border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                  : "bg-gray-50/70 border-gray-200 hover:bg-white hover:border-gray-300"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-bold text-xs text-gray-900">
                  <Icon className={clsx("h-3.5 w-3.5", tab.iconColor)} />
                  {tab.label}
                </span>
                <span className={clsx(
                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold",
                  lifecycleTab === tab.id ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-200/80 text-gray-700"
                )}>
                  {tab.id === 'inquiries' ? 'Pool' : tab.count}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1 truncate">{tab.desc}</p>
            </button>
          )
        })}
      </div>

      {lifecycleTab === 'inquiries' && <div className="space-y-4 mb-5">
        <ListingInquiriesPanel />
        <button className="text-sm text-blue-700 underline" onClick={() => setShowInquiryContacts(value => !value)}>
          {showInquiryContacts ? 'Hide contact management' : 'Manage inquiry contacts, including contacts awaiting a listing'}
        </button>
      </div>}
      <div hidden={lifecycleTab === 'inquiries' && !showInquiryContacts}>
      {/* ── 3. STRUCTURED CONTROLS & FILTER BAR ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, phone, property..."
              className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-9 py-2 text-xs focus:border-blue-500 focus:outline-hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Role Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-hidden cursor-pointer"
          >
            <option value="">All Roles</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>

          {/* Financial Bracket Filter */}
          <select
            value={budgetBracketFilter}
            onChange={(e) => setBudgetBracketFilter(e.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-hidden cursor-pointer"
          >
            {BUDGET_BRACKETS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>

          {/* Agent Filter (Admin / Broker) */}
          {['admin', 'broker'].includes(user?.role || '') && (
            <AgentFilterDropdown
              users={users}
              value={assignedToFilter}
              onChange={setAssignedToFilter}
              dealCountByAgent={contactCountByOwner}
              currentUserId={user?.id}
              allLabel="All Owners"
              mineLabel="Assigned to me"
              countNoun="contacts"
              includeUnassigned
            />
          )}

          {/* Listing Inquiries Pool Archive Toggle */}
          {lifecycleTab === 'inquiries' && (
            <button
              type="button"
              onClick={() => setShowArchivedInquiries(!showArchivedInquiries)}
              className={clsx(
                "rounded-xl border px-3 py-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5",
                showArchivedInquiries
                  ? "bg-purple-50 text-purple-800 border-purple-200"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              <Archive className="h-3.5 w-3.5" />
              {showArchivedInquiries ? 'Viewing Archived' : 'View Archived'}
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport(false)}
            disabled={bulkLoading}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-gray-500" /> Export CSV
          </button>

          <button
            onClick={() => setShowImportModal(true)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Upload className="h-3.5 w-3.5 text-gray-500" /> Import
          </button>

          <button
            onClick={openAddModal}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {lifecycleTab === 'inquiries' ? 'Add Inquiry' : 'Add Lead'}
          </button>
        </div>
      </div>

      {/* ── 4. MULTI-SELECT BATCH TOOLBAR ── */}
      {selectedCount > 0 && (
        <div className="bg-white rounded-2xl border border-blue-200 shadow-xs mb-4 p-3 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              {selectedCount} Selected
            </span>

            {lifecycleTab === 'inquiries' && (
              <>
                {showArchivedInquiries ? (
                  <button
                    onClick={() => handleBatchArchive(false)}
                    disabled={bulkLoading}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-700 border border-indigo-200 disabled:opacity-50 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore Selected
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleBatchPromote}
                      disabled={bulkLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50 cursor-pointer"
                    >
                      <UserPlus className="h-3.5 w-3.5" /> Promote Selected
                    </button>
                    <button
                      onClick={() => handleBatchArchive(true)}
                      disabled={bulkLoading}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-1.5 text-xs font-bold text-gray-800 disabled:opacity-50 cursor-pointer"
                    >
                      <Archive className="h-3.5 w-3.5 text-gray-600" /> Batch Archive
                    </button>
                  </>
                )}
              </>
            )}

            <button
              onClick={() => handleExport(true)}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Export Selected
            </button>

            <button
              onClick={handleBatchDelete}
              disabled={bulkLoading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-700 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Selected
            </button>

            {['admin', 'broker'].includes(user?.role || '') && (
              <div className="flex items-center gap-1.5">
                <select
                  value={bulkAssignee}
                  onChange={(e) => setBulkAssignee(e.target.value)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs bg-white focus:outline-hidden"
                >
                  <option value="">Assign to...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button
                  onClick={handleAssignSelected}
                  disabled={bulkLoading || !bulkAssignee}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  <UserCheck className="h-3.5 w-3.5" /> Assign
                </button>
              </div>
            )}
          </div>

          <button onClick={clearSelection} className="text-xs font-bold text-gray-500 hover:text-gray-700 cursor-pointer">
            Clear Selection
          </button>
        </div>
      )}

      {/* ── 5. MAIN TABLE & PREVIEW SIDEBAR ── */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0 bg-white rounded-2xl shadow-xs border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-4">
                <SkeletonTable rows={8} cols={5} />
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50/80 border-b border-gray-100 text-gray-500 uppercase tracking-wider font-bold text-[10px]">
                  <tr>
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={(e) => toggleSelectAllOnPage(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Role & Specs</th>
                    {['admin', 'broker'].includes(user?.role || '') ? <th className="px-4 py-3">Assigned Agent</th> : null}
                    <th className="px-4 py-3">Scheduled Touchpoint</th>
                    <th className="px-4 py-3">Stage</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts.map((contact) => {
                    const diffDays = getDaysUntilDate(contact.next_follow_up_date)
                    const isOverdue = diffDays !== null && diffDays < 0
                    const isDueToday = diffDays === 0

                    return (
                      <tr
                        key={contact.id}
                        onClick={() => handleRowClick(contact)}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                      >
                        <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(contact.id)}
                            onChange={(e) => toggleSelect(contact.id, e.target.checked)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                              {contact.first_name[0]}{contact.last_name[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 truncate">{contact.first_name} {contact.last_name}</p>
                              <div className="flex items-center gap-2 text-[11px] text-gray-500 truncate mt-0.5">
                                {contact.email && <span className="truncate">{contact.email}</span>}
                                {contact.phone && <span>· {contact.phone}</span>}
                              </div>
                              {contact.source_listing_id && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setLinkedListingId(contact.source_listing_id || null)
                                  }}
                                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 hover:underline"
                                >
                                  <Building2 className="h-3 w-3" /> View linked listing
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="space-y-0.5">
                            <span className="inline-block font-bold text-gray-800 capitalize">
                              {TYPE_LABELS[contact.type] || contact.type}
                            </span>
                            {contact.budget_max ? (
                              <p className="text-[11px] font-semibold text-gray-600">
                                Target: ${Number(contact.budget_max).toLocaleString()}
                              </p>
                            ) : null}
                            {contact.financing_readiness && (
                              <p className="text-[10px] text-gray-400 capitalize">
                                {contact.financing_readiness.replace('_', ' ')}
                              </p>
                            )}
                          </div>
                        </td>

                        {['admin', 'broker'].includes(user?.role || '') ? (
                          <td className="px-4 py-3.5">
                            {contact.assigned_to ? (
                              <div className="min-w-0">
                                <p className="truncate font-bold text-gray-800">
                                  {contact.assigned_to_name || userById.get(contact.assigned_to)?.name || 'Unknown owner'}
                                </p>
                                <p className="text-[10px] capitalize text-gray-400">
                                  {contact.assigned_to_role || userById.get(contact.assigned_to)?.role || 'workspace user'}
                                </p>
                              </div>
                            ) : (
                              <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                Unassigned
                              </span>
                            )}
                          </td>
                        ) : null}

                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          {contact.next_follow_up_date ? (
                            <div className="space-y-0.5">
                              <p className="font-semibold text-gray-800 truncate">
                                {contact.next_action || 'Touchpoint'}
                              </p>
                              <div className="flex items-center gap-1 text-[11px]">
                                {isDueToday ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                    <Clock className="h-3 w-3 text-amber-600" /> Today
                                  </span>
                                ) : isOverdue ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                    <Clock className="h-3 w-3 text-rose-600" /> {contact.next_follow_up_date} (Touchpoint due)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                    <Calendar className="h-3 w-3 text-blue-600" /> {contact.next_follow_up_date}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-gray-400 italic">No touchpoint set</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <span className={clsx(
                            "inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold border capitalize",
                            STAGE_COLORS[contact.qualification_status || 'unqualified'] || 'bg-gray-100 text-gray-700 border-gray-200'
                          )}>
                            {(contact.qualification_status || 'unqualified').replace('_', ' ')}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Convert to Deal button */}
                            {lifecycleTab !== 'sphere' && (
                              <button
                                type="button"
                                onClick={() => setConvertingContact(contact)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs transition-colors cursor-pointer"
                                title="Convert to Active Deal Room"
                              >
                                <Rocket className="h-3 w-3" /> Convert Deal
                              </button>
                            )}

                            {/* Promote button for listing inquiries */}
                            {lifecycleTab === 'inquiries' && (
                              <button
                                type="button"
                                onClick={() => handlePromoteInquiry(contact.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs transition-colors cursor-pointer"
                                title="Promote to Active Lead"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Promote
                              </button>
                            )}

                            {/* Universal View Profile ↗ */}
                            <button
                              type="button"
                              onClick={() => navigate(`/marketing/crm/${contact.id}`)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 font-bold text-xs transition-colors cursor-pointer shadow-2xs"
                            >
                              <span>View Profile</span>
                              <ArrowUpRight className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {!loading && contacts.length === 0 && (
              <div className="text-center py-16 text-gray-500 bg-white">
                <Building2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <h3 className="text-sm font-bold text-gray-800">No contacts in this queue</h3>
                <p className="text-xs text-gray-400 mt-0.5">Add a new lead or adjust your filter criteria.</p>
                <button
                  onClick={openAddModal}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Lead
                </button>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={LIMIT}
              onPageChange={setPage}
              className="border-t border-gray-100 px-5 py-3 flex items-center justify-between text-xs text-gray-500"
            />
          )}
        </div>

        {/* ── 6. QUICK PREVIEW SIDEBAR ── */}
        {previewContact && (
          <aside className="hidden xl:block w-80 rounded-2xl border border-gray-200 bg-white shadow-xs p-4 h-fit sticky top-24 overflow-hidden space-y-4 animate-in fade-in">
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
              <div>
                <p className="font-extrabold text-gray-900 text-sm">{previewContact.first_name} {previewContact.last_name}</p>
                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200 capitalize">
                  {TYPE_LABELS[previewContact.type] || previewContact.type}
                </span>
              </div>
              <button onClick={() => setPreviewContact(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-2">
              {previewContact.phone ? (
                <a
                  href={`tel:${previewContact.phone}`}
                  className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200 text-center text-xs"
                >
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
              ) : (
                <button disabled className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-gray-100 text-gray-400 font-semibold text-xs cursor-not-allowed">
                  No Phone
                </button>
              )}

              {previewContact.email ? (
                <a
                  href={`mailto:${previewContact.email}`}
                  className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 font-bold border border-blue-200 text-center text-xs"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </a>
              ) : (
                <button disabled className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-gray-100 text-gray-400 font-semibold text-xs cursor-not-allowed">
                  No Email
                </button>
              )}
            </div>

            {/* Details */}
            <div className="space-y-2 bg-gray-50/80 p-3 rounded-xl border border-gray-200 text-xs">
              {previewContact.email && <p className="text-gray-700 truncate"><strong>Email:</strong> {previewContact.email}</p>}
              {previewContact.phone && <p className="text-gray-700"><strong>Phone:</strong> {previewContact.phone}</p>}
              {previewContact.budget_max ? (
                <p className="text-gray-700"><strong>Budget:</strong> ${Number(previewContact.budget_max).toLocaleString()}</p>
              ) : null}
              {['admin', 'broker'].includes(user?.role || '') ? (
                <p className="text-gray-700">
                  <strong>Assigned Agent:</strong>{' '}
                  {previewContact.assigned_to
                    ? previewContact.assigned_to_name || userById.get(previewContact.assigned_to)?.name || 'Unknown owner'
                    : 'Unassigned'}
                </p>
              ) : null}
              {previewContact.source_listing_id && (
                <button
                  type="button"
                  onClick={() => setLinkedListingId(previewContact.source_listing_id || null)}
                  className="flex w-full items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  <Building2 className="h-3.5 w-3.5" /> Open linked listing
                </button>
              )}

              {previewContact.next_follow_up_date ? (
                <div className="font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-1 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold text-amber-700">Scheduled Action</p>
                    <button
                      onClick={() => handleMarkFollowUpDone(previewContact)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200 hover:bg-emerald-50 cursor-pointer"
                    >
                      <CheckCircle2 className="h-3 w-3" /> Mark Done
                    </button>
                  </div>
                  <p className="text-xs font-bold text-gray-900">{previewContact.next_action || 'Touchpoint'}</p>
                  <p className="text-[11px] text-amber-700">Due: {previewContact.next_follow_up_date}</p>

                  <div className="flex items-center gap-1 pt-1 border-t border-amber-200/60 text-[10px]">
                    <span className="text-gray-500 font-medium">Postpone:</span>
                    <button
                      onClick={() => handleRescheduleFollowUp(previewContact, 1)}
                      className="px-1.5 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-100 font-bold cursor-pointer"
                    >
                      +1d
                    </button>
                    <button
                      onClick={() => handleRescheduleFollowUp(previewContact, 3)}
                      className="px-1.5 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-100 font-bold cursor-pointer"
                    >
                      +3d
                    </button>
                    <button
                      onClick={() => handleRescheduleFollowUp(previewContact, 7)}
                      className="px-1.5 py-0.5 rounded bg-white border border-gray-200 hover:bg-gray-100 font-bold cursor-pointer"
                    >
                      +1w
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-2 bg-white rounded-lg border border-dashed border-gray-200 text-[11px] text-gray-500">
                  <span>No scheduled action</span>
                  <button
                    onClick={() => handleRescheduleFollowUp(previewContact, 3)}
                    className="block mx-auto mt-1 font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    + Schedule Touchpoint
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setConvertingContact(previewContact)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-colors shadow-2xs cursor-pointer"
              >
                <Rocket className="h-3.5 w-3.5" /> Convert to Active Deal
              </button>

              <button
                onClick={() => navigate(`/marketing/crm/${previewContact.id}`)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs border border-gray-200 transition-colors shadow-2xs cursor-pointer"
              >
                <span>Full Client Profile</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>

              <button
                onClick={() => handleDeleteSingleContact(previewContact.id)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-rose-600 hover:bg-rose-50 font-semibold text-[11px] transition-colors cursor-pointer"
              >
                <Trash2 className="h-3 w-3" /> Delete Contact
              </button>
            </div>
          </aside>
        )}
      </div>

      </div>

      {/* ── 7. CONVERT TO DEAL MODAL ── */}
      {convertingContact && (
        <ConvertToDealModal
          contact={convertingContact}
          isOpen={!!convertingContact}
          onClose={() => setConvertingContact(null)}
          onSuccess={() => {
            loadContacts()
            loadStats()
          }}
        />
      )}

      <ListingDetailDrawer
        listingId={linkedListingId}
        isOpen={Boolean(linkedListingId)}
        onClose={() => setLinkedListingId(null)}
      />

      {/* ── 8. CREATE LEAD / CONTACT MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gray-50/80">
              <div>
                <h2 className="text-base font-bold text-gray-900">
                  {form.lifecycleStage === 'inquiry' ? 'New Listing Inquiry' : 'Add New Lead / Contact'}
                </h2>
                <p className="text-xs text-gray-500">Capture client information into your CRM</p>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Role / Persona</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden cursor-pointer"
                  >
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Lifecycle Stage</label>
                  <select
                    value={form.lifecycleStage}
                    onChange={(e) => setForm({ ...form, lifecycleStage: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden cursor-pointer"
                  >
                    <option value="lead">Lead & Prospect</option>
                    <option value="active_client">Active Client</option>
                    <option value="past_client">Past Client (Sphere)</option>
                    <option value="inquiry">Listing Inquiry Pool</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Target / Max Budget ($)</label>
                  <input
                    type="number"
                    value={form.budgetMax || ''}
                    onChange={(e) => setForm({ ...form, budgetMax: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g. 1200000"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Next Follow-up Date</label>
                  <input
                    type="date"
                    value={form.nextFollowUpDate}
                    onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Notes / Preferences</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Target neighborhoods, financing details, requirements..."
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold transition-colors cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 9. CSV IMPORT MODAL ── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-sm font-bold text-gray-900">Import Contacts (CSV)</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleImportCSV} className="space-y-4">
              <div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                />
              </div>

              {importSummary && (
                <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 font-bold">
                  {importSummary}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={!csvFile || isImporting}
                  className="rounded-xl bg-blue-600 text-white px-4 py-2 text-xs font-bold hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {isImporting ? 'Importing...' : 'Upload & Ingest'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
