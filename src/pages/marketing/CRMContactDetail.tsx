import { ListingInquiriesPanel } from '@/components/marketing/ListingInquiriesPanel'
import { RelatedContacts } from '@/components/next/RelatedContacts'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Save, Mail, FileText, Phone, MessageSquare, Calendar,
  User, MapPin, DollarSign, Clock, CheckCircle2, Plus, ChevronRight,
  Home, ArrowUpRight, X, Rocket, Trash2, Pencil, Tag, UserMinus
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { validateEmail, validateAddress } from '@/utils/reconciliation'
import { ConvertToDealModal } from '@/components/marketing/ConvertToDealModal'
import { apiFetch } from '@/utils/api'
import { getDaysUntilDate } from '@/utils/date'
import { ListingDetailDrawer } from '@/components/transactions/ListingDetailDrawer'
import clsx from 'clsx'

// ── Types ────────────────────────────────────────────────────────────────────

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

interface Activity {
  id: string
  type: string
  title: string
  body: string | null
  occurred_at: string
}

type Tab = 'listings' | 'overview' | 'activity' | 'qualification' | 'records' | 'communication' | 'notes'

// ── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: 'unqualified', label: 'Unqualified', color: 'bg-blue-500' },
  { id: 'attempted_contact', label: 'Attempted Contact', color: 'bg-amber-500' },
  { id: 'engaged', label: 'Engaged', color: 'bg-purple-500' },
  { id: 'qualified', label: 'Qualified', color: 'bg-emerald-500' },
  { id: 'disqualified', label: 'Disqualified', color: 'bg-gray-400' },
]

const STAGE_BADGE: Record<string, string> = {
  unqualified: 'bg-blue-50 text-blue-800 border-blue-200',
  attempted_contact: 'bg-amber-50 text-amber-800 border-amber-200 font-bold',
  engaged: 'bg-purple-50 text-purple-800 border-purple-200',
  qualified: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold',
  disqualified: 'bg-gray-100 text-gray-600 border-gray-200',
}

const TYPE_LABELS: Record<string, string> = {
  buyer: 'Buyer', seller: 'Seller', both: 'Buyer/Seller',
  referral: 'Referral', vendor: 'Vendor', landlord: 'Landlord',
  tenant: 'Tenant', agent: 'Agent', other: 'Other',
}

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  email: Mail, call: Phone, note: FileText, meeting: Calendar, sms: MessageSquare,
}

// ── Toast hook ────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const show = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])
  return { toast, show }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CRMContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast, show: showToast } = useToast()

  const [tab, setTab] = useState<Tab>('overview')
  const [saving, setSaving] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [linkedTransactions, setLinkedTransactions] = useState<any[]>([])
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [dealActionLoading, setDealActionLoading] = useState<string | null>(null)
  const [linkedListingId, setLinkedListingId] = useState<string | null>(null)

  // Tag chip input state
  const [showAddTag, setShowAddTag] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')

  // Activity log form
  const [showLogForm, setShowLogForm] = useState(false)
  const [logType, setLogType] = useState<'call' | 'email' | 'note' | 'meeting'>('note')
  const [logTitle, setLogTitle] = useState('')
  const [logBody, setLogBody] = useState('')
  const [logNextDate, setLogNextDate] = useState('')
  const [logNextAction, setLogNextAction] = useState('')
  const [logSaving, setLogSaving] = useState(false)

  // Edit activity state
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [editActTitle, setEditActTitle] = useState('')
  const [editActBody, setEditActBody] = useState('')

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    type: 'buyer', status: 'prospect', source: '', notes: '',
    address: '', tags: [] as string[], assignedTo: '',
    timeline: '', budgetMin: 0, budgetMax: 0,
    financingReadiness: '', moveDate: '',
    sellerMotivation: '', representationStatus: '',
    urgency: '', preferredContactMethod: '', language: 'English',
    nextFollowUpDate: '', nextAction: '', leadStage: 'unqualified',
    lifecycleStage: 'lead',
  })

  const [emailError, setEmailError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    try {
      const detail = await apiFetch(`/api/contacts/${id}`)
      const c = detail.contact as Contact
      setContact(c)
      setActivities(detail.activities || [])
      setLinkedTransactions(detail.transactions || [])
      setForm({
        firstName: c.first_name || '',
        lastName: c.last_name || '',
        email: c.email || '',
        phone: c.phone || '',
        type: c.type || 'buyer',
        status: c.status || 'prospect',
        source: c.source || '',
        notes: c.notes || '',
        address: c.address || '',
        tags: Array.isArray(c.tags) ? c.tags : [],
        assignedTo: c.assigned_to || '',
        timeline: c.timeline || '',
        budgetMin: c.budget_min || 0,
        budgetMax: c.budget_max || 0,
        financingReadiness: c.financing_readiness || '',
        moveDate: c.move_date || '',
        sellerMotivation: c.seller_motivation || '',
        representationStatus: c.representation_status || '',
        urgency: c.urgency || '',
        preferredContactMethod: c.preferred_contact_method || '',
        language: c.language || 'English',
        nextFollowUpDate: c.next_follow_up_date || '',
        nextAction: c.next_action || '',
        leadStage: c.qualification_status || 'unqualified',
        lifecycleStage: c.lifecycle_stage || 'lead',
      })
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => { load() }, [id])

  const handleUnlinkDeal = async (txId: string, partyId: string, txName: string) => {
    if (!confirm(`Remove ${contact?.first_name} ${contact?.last_name} from "${txName}"? The deal room will remain for other parties.`)) return
    setDealActionLoading(partyId)
    try {
      const res = await apiFetch(`/api/transactions/${txId}/parties/${partyId}`, { method: 'DELETE' })
      if (!res?.success && res?.error) throw new Error(res.error)
      await load()
    } catch (err: any) {
      alert(err.message || 'Failed to unlink from deal')
    } finally {
      setDealActionLoading(null)
    }
  }

  const handleDeleteDeal = async (txId: string, txName: string) => {
    if (!confirm(`Permanently delete the deal room "${txName}"? This cannot be undone.`)) return
    setDealActionLoading(txId)
    try {
      const res = await apiFetch(`/api/transactions/${txId}`, { method: 'DELETE' })
      if (!res?.success && res?.error) throw new Error(res.error)
      await load()
    } catch (err: any) {
      alert(err.message || 'Failed to delete deal')
    } finally {
      setDealActionLoading(null)
    }
  }

  const sortedActivities = useMemo(() =>
    [...activities].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()),
    [activities]
  )

  const saveContact = async (overrideForm?: Partial<typeof form>) => {
    if (!id) return
    const activeForm = { ...form, ...overrideForm }
    if (activeForm.email && activeForm.email.trim() && !validateEmail(activeForm.email.trim())) {
      setEmailError('Invalid email format (e.g. client@domain.com)')
      return
    }
    setEmailError(null)
    if (activeForm.address && activeForm.address.trim()) {
      const addrResult = validateAddress(activeForm.address.trim())
      if (!addrResult.valid) {
        setAddressError(addrResult.errors.join('; '))
        return
      }
      if (addrResult.normalized) activeForm.address = addrResult.normalized
    }
    setAddressError(null)
    setSaving(true)
    try {
      await apiFetch(`/api/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: activeForm.firstName, lastName: activeForm.lastName,
          email: activeForm.email || null, phone: activeForm.phone || null,
          type: activeForm.type, status: activeForm.status,
          source: activeForm.source || null, notes: activeForm.notes || null,
          address: activeForm.address || null,
          tags: activeForm.tags,
          assignedTo: activeForm.assignedTo || null,
          timeline: activeForm.timeline || null,
          budgetMin: activeForm.budgetMin || null, budgetMax: activeForm.budgetMax || null,
          financingReadiness: activeForm.financingReadiness || null,
          moveDate: activeForm.moveDate || null, sellerMotivation: activeForm.sellerMotivation || null,
          representationStatus: activeForm.representationStatus || null,
          urgency: activeForm.urgency || null,
          preferredContactMethod: activeForm.preferredContactMethod || null,
          language: activeForm.language || null,
          nextFollowUpDate: activeForm.nextFollowUpDate || null,
          nextAction: activeForm.nextAction || null,
          qualificationStatus: activeForm.leadStage,
          lifecycleStage: activeForm.lifecycleStage,
        }),
      })
      await load()
      showToast('Contact updated successfully')
    } catch (e: any) {
      showToast(e.message || 'Failed to save contact', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteContact = async () => {
    if (!id) return
    if (!confirm(`Are you sure you want to delete ${fullName}?`)) return
    try {
      await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' })
      navigate('/marketing/crm')
    } catch (e: any) {
      showToast(e.message || 'Failed to delete contact', 'error')
    }
  }

  const handleAddTag = async () => {
    if (!newTagInput.trim()) return
    const tag = newTagInput.trim()
    if (form.tags.includes(tag)) {
      setNewTagInput('')
      setShowAddTag(false)
      return
    }
    const updatedTags = [...form.tags, tag]
    setForm(f => ({ ...f, tags: updatedTags }))
    setNewTagInput('')
    setShowAddTag(false)
    await saveContact({ tags: updatedTags })
  }

  const handleRemoveTag = async (tagToRemove: string) => {
    const updatedTags = form.tags.filter(t => t !== tagToRemove)
    setForm(f => ({ ...f, tags: updatedTags }))
    await saveContact({ tags: updatedTags })
  }

  const handleMarkFollowUpDone = async () => {
    if (!id) return
    try {
      await apiFetch(`/api/contacts/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'note',
          title: `Completed Follow-up: ${form.nextAction || 'Touchpoint'}`,
          body: `Marked completed on ${new Date().toLocaleDateString()}`
        })
      })
      await apiFetch(`/api/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nextFollowUpDate: null,
          nextAction: null,
          qualificationStatus: form.leadStage
        })
      })
      await load()
      showToast('Touchpoint marked completed')
    } catch (e: any) {
      showToast(e.message || 'Failed to update touchpoint', 'error')
    }
  }

  const logActivity = async () => {
    if (!id || !logTitle.trim()) return
    setLogSaving(true)
    try {
      await apiFetch(`/api/contacts/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: logType, title: logTitle, body: logBody || null }),
      })

      // If scheduled next step is also provided, update contact atomically
      if (logNextDate) {
        await apiFetch(`/api/contacts/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            nextFollowUpDate: logNextDate,
            nextAction: logNextAction || 'Scheduled Touchpoint'
          })
        })
      }

      setLogTitle('')
      setLogBody('')
      setLogNextDate('')
      setLogNextAction('')
      setShowLogForm(false)
      await load()
      showToast('Activity logged successfully')
    } catch (e: any) {
      showToast(e.message || 'Failed to log activity', 'error')
    } finally {
      setLogSaving(false)
    }
  }

  const handleUpdateActivity = async () => {
    if (!id || !editingActivity) return
    try {
      await apiFetch(`/api/contacts/${id}/activities/${editingActivity.id}`, {
        method: 'PUT',
        body: JSON.stringify({ title: editActTitle, body: editActBody })
      })
      setEditingActivity(null)
      await load()
      showToast('Activity updated')
    } catch (e: any) {
      showToast(e.message || 'Failed to update activity', 'error')
    }
  }

  const handleDeleteActivity = async (activityId: string) => {
    if (!id) return
    if (!confirm('Are you sure you want to delete this activity log?')) return
    try {
      await apiFetch(`/api/contacts/${id}/activities/${activityId}`, { method: 'DELETE' })
      await load()
      showToast('Activity deleted')
    } catch (e: any) {
      showToast(e.message || 'Failed to delete activity', 'error')
    }
  }

  const currentStageIndex = PIPELINE_STAGES.findIndex(s => s.id === form.leadStage)
  const fullName = `${form.firstName} ${form.lastName}`.trim() || 'Contact'
  const initials = `${form.firstName[0] || ''}${form.lastName[0] || ''}`.toUpperCase() || 'C'

  const diffDays = getDaysUntilDate(form.nextFollowUpDate)
  const isDueToday = diffDays === 0
  const isOverdue = diffDays !== null && diffDays < 0

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'listings', label: 'Listings & Showings', icon: Home },
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'records', label: `Linked Deals (${linkedTransactions.length})`, icon: Home },
    { id: 'activity', label: `Activity (${activities.length})`, icon: Clock },
    { id: 'qualification', label: 'Qualification & Specs', icon: DollarSign },
    { id: 'communication', label: 'Touchpoint Plan', icon: Calendar },
    { id: 'notes', label: 'Notes & Preferences', icon: FileText },
  ]

  return (
    <Layout title={`CRM — ${fullName}`}>
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white transition-all ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-5">
        {/* ── Back + Breadcrumbs ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <button onClick={() => navigate('/marketing/crm')} className="flex items-center gap-1 hover:text-blue-600 font-bold transition-colors cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" /> CRM Hub
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
            <span className="text-gray-900 font-bold">{fullName}</span>
          </div>

          <button
            onClick={handleDeleteContact}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-bold transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Contact
          </button>
        </div>

        {/* ── Contact Hero Card ── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar */}
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-black text-2xl shrink-0 shadow-xs">
              {initials}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-xl font-extrabold text-gray-900">{fullName}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${STAGE_BADGE[form.leadStage] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {PIPELINE_STAGES.find(s => s.id === form.leadStage)?.label || form.leadStage}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                  {TYPE_LABELS[form.type] || form.type}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 capitalize">
                  {form.lifecycleStage?.replace('_', ' ') || 'Lead'}
                </span>
                <span className={clsx(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border',
                  contact?.assigned_to ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200',
                )}>
                  {contact?.assigned_to ? `Assigned: ${contact.assigned_to_name || 'Unknown owner'}` : 'Unassigned'}
                </span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-1.5">
                {form.email && <span className="flex items-center gap-1 text-gray-700 font-medium"><Mail className="h-3.5 w-3.5 text-gray-400" />{form.email}</span>}
                {form.phone && <span className="flex items-center gap-1 text-gray-700 font-medium"><Phone className="h-3.5 w-3.5 text-gray-400" />{form.phone}</span>}
                {form.address && <span className="flex items-center gap-1 text-gray-600"><MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" /><span className="truncate">{form.address}</span></span>}
              </div>

              {contact?.source_listing_id ? (
                <button
                  type="button"
                  onClick={() => setLinkedListingId(contact.source_listing_id || null)}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
                >
                  <Home className="h-3.5 w-3.5" /> View linked property
                </button>
              ) : null}

              {/* Interactive Tag Chips */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {form.tags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    <Tag className="h-3 w-3 text-blue-600" />
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-red-600 p-0.5 cursor-pointer ml-0.5"
                      title="Remove tag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}

                {showAddTag ? (
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      autoFocus
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddTag(); else if (e.key === 'Escape') setShowAddTag(false); }}
                      placeholder="Tag name..."
                      className="px-2 py-0.5 text-xs rounded border border-blue-300 focus:outline-hidden"
                    />
                    <button onClick={handleAddTag} className="text-xs font-bold text-blue-600 hover:underline cursor-pointer">Add</button>
                    <button onClick={() => setShowAddTag(false)} className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddTag(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-gray-600 border border-dashed border-gray-300 hover:bg-gray-50 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" /> Tag
                  </button>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* 1-Click Convert to Deal */}
              <button
                type="button"
                onClick={() => setShowConvertModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Rocket className="h-3.5 w-3.5" /> Convert to Active Deal
              </button>

              {form.phone && (
                <a href={`tel:${form.phone}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 hover:bg-emerald-100 transition-colors">
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
              )}
              {form.email && (
                <a href={`mailto:${form.email}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-800 text-xs font-bold border border-blue-200 hover:bg-blue-100 transition-colors">
                  <Mail className="h-3.5 w-3.5" /> Email
                </a>
              )}
              <button
                onClick={() => { setShowLogForm(true); setTab('activity') }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold border border-gray-200 hover:bg-gray-200 transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Log Interaction
              </button>
            </div>
          </div>

          {/* Pipeline Stage Bar */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Lifecycle Stage Progression</p>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {PIPELINE_STAGES.map((stage, idx) => (
                <button
                  key={stage.id}
                  onClick={() => setForm(f => ({ ...f, leadStage: stage.id }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                    form.leadStage === stage.id
                      ? `${stage.color} text-white shadow-xs`
                      : idx < currentStageIndex
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  {idx < currentStageIndex && <CheckCircle2 className="h-3 w-3" />}
                  {stage.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {id && <RelatedContacts contactId={id} />}
        {/* ── Tab Navigation ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-white rounded-2xl border border-gray-200 p-1.5 shadow-2xs">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer",
                tab === t.id
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'listings' && contact && <ListingInquiriesPanel contact={contact} />}

        {/* ── OVERVIEW TAB ── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              {/* Linked Deals Banner if exists */}
              {linkedTransactions.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-200 p-5 shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-blue-700" />
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-950">
                        Active Deals in Pipeline ({linkedTransactions.length})
                      </h3>
                    </div>
                    <Link to="/transactions/pipeline" className="text-xs font-bold text-blue-700 hover:underline inline-flex items-center gap-1">
                      Deals <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {linkedTransactions.map((tx: any) => (
                      <div key={tx.id} className="bg-white rounded-xl p-3 border border-blue-100 shadow-2xs flex items-center justify-between gap-2 group">
                        <Link to={`/transactions/${tx.id}`} className="flex-1 min-w-0 hover:text-blue-600 transition-colors">
                          <p className="font-bold text-xs text-gray-900 group-hover:text-blue-600 truncate">{tx.name || 'Untitled Deal'}</p>
                          <p className="text-[11px] text-gray-500 capitalize mt-0.5">
                            {tx.type} · {tx.party_role?.replace(/_/g, ' ')} · Stage: <span className="font-bold text-gray-800">{tx.status?.replace(/_/g, ' ')}</span>
                            {tx.price ? ` · $${Number(tx.price).toLocaleString()}` : ''}
                          </p>
                        </Link>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleUnlinkDeal(tx.id, tx.party_id, tx.name)}
                            disabled={dealActionLoading === tx.party_id}
                            title="Unlink from this deal"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDeal(tx.id, tx.name)}
                            disabled={dealActionLoading === tx.id}
                            title="Delete this deal room"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <Link to={`/transactions/${tx.id}`} className="p-1.5 rounded-lg text-blue-400 hover:text-blue-700 hover:bg-blue-50 transition-colors">
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Information Form */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
                <h3 className="font-bold text-sm text-gray-900">Profile & Contact Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">First Name</label>
                    <input
                      value={form.firstName}
                      onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Last Name</label>
                    <input
                      value={form.lastName}
                      onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                    />
                    {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Phone</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Role / Persona</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden"
                    >
                      {Object.entries(TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Lifecycle Tier</label>
                    <select
                      value={form.lifecycleStage}
                      onChange={(e) => setForm((f) => ({ ...f, lifecycleStage: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden"
                    >
                      <option value="lead">Lead & Prospect</option>
                      <option value="active_client">Active Client (In-Deal)</option>
                      <option value="past_client">Past Client (Sphere)</option>
                      <option value="inquiry">Listing Inquiry Pool</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Physical Address</label>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                  {addressError && <p className="text-xs text-red-600 mt-1">{addressError}</p>}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => saveContact()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side: Scheduled Touchpoints & Next Actions */}
            <div className="space-y-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
                <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-500" />
                  Scheduled Touchpoint
                </h4>

                {form.nextFollowUpDate ? (
                  <div className="bg-amber-50/80 rounded-xl p-3.5 border border-amber-200 space-y-2">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-amber-700">Planned Action</p>
                      <p className="text-xs font-bold text-gray-900 mt-0.5">{form.nextAction || 'Touchpoint Follow-up'}</p>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      {isDueToday ? (
                        <span className="font-bold text-amber-800">Due Today</span>
                      ) : isOverdue ? (
                        <span className="font-bold text-rose-700">Due on {form.nextFollowUpDate} (Overdue)</span>
                      ) : (
                        <span className="font-semibold text-blue-700">Due on {form.nextFollowUpDate}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-amber-200/60">
                      <button
                        type="button"
                        onClick={handleMarkFollowUpDone}
                        className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark Done
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab('communication')}
                        className="inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Reschedule
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-5 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-xs text-gray-500 font-medium">No touchpoint scheduled</p>
                    <button
                      onClick={() => setTab('communication')}
                      className="mt-2 text-xs font-bold text-blue-600 hover:underline"
                    >
                      + Schedule Next Follow-up
                    </button>
                  </div>
                )}
              </div>

              {/* Financial Quick Glance */}
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3 text-xs">
                <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                  Financial Qualification
                </h4>
                <div className="space-y-1.5 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-gray-700">
                    <strong>Max Budget:</strong> {form.budgetMax ? `$${Number(form.budgetMax).toLocaleString()}` : 'Not specified'}
                  </p>
                  <p className="text-gray-700 capitalize">
                    <strong>Financing:</strong> {form.financingReadiness ? form.financingReadiness.replace('_', ' ') : 'Unstated'}
                  </p>
                  <p className="text-gray-700 capitalize">
                    <strong>Representation:</strong> {form.representationStatus ? form.representationStatus.replace(/_/g, ' ') : 'Unrepresented'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVITY TIMELINE TAB ── */}
        {tab === 'activity' && (
          <div className="space-y-4">
            {showLogForm ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider">Log Interaction</h4>
                  <button onClick={() => setShowLogForm(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex gap-2">
                  {(['call', 'email', 'note', 'meeting'] as const).map(t => {
                    const Icon = ACTIVITY_ICONS[t]
                    return (
                      <button
                        key={t}
                        onClick={() => setLogType(t)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all border cursor-pointer ${
                          logType === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-600'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />{t}
                      </button>
                    )
                  })}
                </div>
                <input
                  value={logTitle}
                  onChange={e => setLogTitle(e.target.value)}
                  placeholder="Summary of interaction..."
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                />
                <textarea
                  value={logBody}
                  onChange={e => setLogBody(e.target.value)}
                  placeholder="Detailed notes / outcome..."
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden resize-none"
                />

                {/* Integrated Next-Step Scheduling */}
                <div className="rounded-xl bg-blue-50/60 p-3 border border-blue-100 space-y-2">
                  <p className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    Schedule Next Step (Optional)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={logNextDate}
                      onChange={e => setLogNextDate(e.target.value)}
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-blue-600 focus:outline-hidden"
                    />
                    <input
                      type="text"
                      value={logNextAction}
                      onChange={e => setLogNextAction(e.target.value)}
                      placeholder="e.g. Follow-up phone call..."
                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs focus:border-blue-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowLogForm(false)} className="px-3 py-1.5 rounded-xl border text-xs font-bold text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button
                    onClick={logActivity}
                    disabled={logSaving || !logTitle.trim()}
                    className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-50"
                  >
                    {logSaving ? 'Saving...' : 'Save Activity & Next Step'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowLogForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Log Interaction
              </button>
            )}

            {/* Edit Activity Inline Modal */}
            {editingActivity && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h4 className="text-xs font-bold text-gray-900 uppercase">Edit Activity Entry</h4>
                    <button onClick={() => setEditingActivity(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    value={editActTitle}
                    onChange={e => setEditActTitle(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                  <textarea
                    value={editActBody}
                    onChange={e => setEditActBody(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden resize-none"
                  />
                  <div className="flex justify-end gap-2 pt-2 border-t">
                    <button onClick={() => setEditingActivity(null)} className="px-3 py-1.5 rounded-xl border text-xs font-bold text-gray-600">Cancel</button>
                    <button onClick={handleUpdateActivity} className="px-4 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700">Save</button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
              <h4 className="font-bold text-xs text-gray-900 uppercase tracking-wider mb-4">Interaction Timeline</h4>
              {sortedActivities.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-xs">
                  <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  No activity logged yet.
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedActivities.map((a) => {
                    const Icon = ACTIVITY_ICONS[a.type] || FileText
                    return (
                      <div key={a.id} className="flex gap-3 relative pb-2 border-b border-gray-50 last:border-0 group">
                        <div className="h-7 w-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-blue-700" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-xs text-gray-900">{a.title}</p>
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingActivity(a)
                                  setEditActTitle(a.title)
                                  setEditActBody(a.body || '')
                                }}
                                className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                title="Edit activity"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                onClick={() => handleDeleteActivity(a.id)}
                                className="p-1 text-gray-400 hover:text-rose-600 rounded"
                                title="Delete activity"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-0.5">{new Date(a.occurred_at).toLocaleString()}</p>
                          {a.body && <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded-lg p-2">{a.body}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── QUALIFICATION TAB ── */}
        {tab === 'qualification' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-gray-900">Lead Qualification & Specs</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Timeline</label>
                <input
                  value={form.timeline}
                  onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  placeholder="e.g. 3-6 months, Immediate"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Urgency</label>
                <select
                  value={form.urgency}
                  onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="">— Select —</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="immediate">Immediate</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Target Budget Max ($)</label>
                <input
                  type="number"
                  value={form.budgetMax || ''}
                  onChange={e => setForm(f => ({ ...f, budgetMax: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Financing Readiness</label>
                <select
                  value={form.financingReadiness}
                  onChange={e => setForm(f => ({ ...f, financingReadiness: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="">— Select —</option>
                  <option value="pre_approved">Pre-Approved</option>
                  <option value="pre_qualified">Pre-Qualified</option>
                  <option value="cash">Cash Buyer</option>
                  <option value="needs_pre_approval">Needs Pre-Approval</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => saveContact()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" /> Save Qualification
              </button>
            </div>
          </div>
        )}

        {/* ── LINKED DEALS TAB ── */}
        {tab === 'records' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-gray-900">Linked Transactions & Deals</h3>
              <button
                onClick={() => setShowConvertModal(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
              >
                <Rocket className="h-3 w-3" /> New Deal Room
              </button>
            </div>

            {linkedTransactions.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-xs">
                <Home className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                No transactions linked yet. Click "New Deal Room" above to convert this contact into a live transaction.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedTransactions.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between p-3.5 rounded-xl border border-gray-200 hover:border-blue-200 transition-colors group gap-2">
                    <Link to={`/transactions/${tx.id}`} className="flex-1 min-w-0">
                      <p className="font-bold text-xs text-gray-900 group-hover:text-blue-600 truncate">{tx.name}</p>
                      <p className="text-[11px] text-gray-500 capitalize mt-0.5">
                        {tx.type} · <span className="capitalize">{tx.party_role?.replace(/_/g, ' ')}</span> · Stage: <span className="font-bold text-gray-800">{tx.status?.replace(/_/g, ' ')}</span>
                        {tx.price ? ` · $${Number(tx.price).toLocaleString()}` : ''}
                      </p>
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleUnlinkDeal(tx.id, tx.party_id, tx.name)}
                        disabled={dealActionLoading === tx.party_id}
                        title="Unlink from this deal"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <UserMinus className="h-3 w-3" />
                        Unlink
                      </button>
                      <button
                        onClick={() => handleDeleteDeal(tx.id, tx.name)}
                        disabled={dealActionLoading === tx.id}
                        title="Delete this deal room"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete Deal
                      </button>
                      <Link
                        to={`/transactions/${tx.id}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── COMMUNICATION & FOLLOW-UP TAB ── */}
        {tab === 'communication' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-gray-900">Scheduled Touchpoint & Action Plan</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Next Touchpoint Date</label>
                <input
                  type="date"
                  value={form.nextFollowUpDate}
                  onChange={e => setForm(f => ({ ...f, nextFollowUpDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Next Action / Milestone</label>
                <input
                  value={form.nextAction}
                  onChange={e => setForm(f => ({ ...f, nextAction: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  placeholder="e.g. Schedule discovery call, Send counter-offer..."
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => saveContact()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" /> Save Touchpoint Plan
              </button>
            </div>
          </div>
        )}

        {/* ── NOTES TAB ── */}
        {tab === 'notes' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-gray-900">Private Notes & Criteria</h3>
            <div>
              <textarea
                rows={6}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 p-3.5 text-xs focus:border-blue-600 focus:outline-hidden"
                placeholder="Internal notes about client preferences, co-op qualifications, timing..."
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => saveContact()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer"
              >
                <Save className="h-3.5 w-3.5" /> Save Notes
              </button>
            </div>
          </div>
        )}
      </div>

      <ListingDetailDrawer
        listingId={linkedListingId}
        isOpen={Boolean(linkedListingId)}
        onClose={() => setLinkedListingId(null)}
      />

      {/* ── Convert to Deal Modal ── */}
      {contact && (
        <ConvertToDealModal
          contact={contact}
          isOpen={showConvertModal}
          onClose={() => setShowConvertModal(false)}
          onSuccess={() => load()}
        />
      )}
    </Layout>
  )
}
