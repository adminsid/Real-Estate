import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Save, Mail, FileText, Phone, MessageSquare, Calendar,
  User, Tag, MapPin, DollarSign, Clock, CheckCircle2, Plus, ChevronRight,
  Home, ArrowUpRight, AlertCircle, BarChart2, X
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { validateEmail, validateAddress } from '@/utils/reconciliation'
import { apiFetch } from '@/utils/api'

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

interface Activity {
  id: string
  type: string
  title: string
  body: string | null
  occurred_at: string
}

type Tab = 'overview' | 'activity' | 'qualification' | 'records' | 'communication' | 'notes'

// ── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { id: 'new', label: 'New Lead', color: 'bg-blue-500' },
  { id: 'needs_follow_up', label: 'Follow-up', color: 'bg-amber-500' },
  { id: 'overdue', label: 'Overdue', color: 'bg-red-500' },
  { id: 'qualified', label: 'Qualified', color: 'bg-emerald-500' },
  { id: 'nurture', label: 'Nurturing', color: 'bg-purple-500' },
  { id: 'converted', label: 'Converted', color: 'bg-teal-500' },
  { id: 'closed_lost', label: 'Closed Lost', color: 'bg-gray-400' },
]

const STAGE_BADGE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  needs_follow_up: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-800',
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

  // Activity log form
  const [showLogForm, setShowLogForm] = useState(false)
  const [logType, setLogType] = useState<'call' | 'email' | 'note' | 'meeting'>('note')
  const [logTitle, setLogTitle] = useState('')
  const [logBody, setLogBody] = useState('')
  const [logSaving, setLogSaving] = useState(false)

  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    type: 'buyer', status: 'prospect', source: '', notes: '',
    address: '', tagsText: '', assignedTo: '',
    timeline: '', budgetMin: 0, budgetMax: 0,
    financingReadiness: '', moveDate: '',
    sellerMotivation: '', representationStatus: '',
    urgency: '', preferredContactMethod: '', language: 'English',
    nextFollowUpDate: '', nextAction: '', leadStage: 'new',
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
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email || '',
        phone: c.phone || '',
        type: c.type || 'buyer',
        status: c.status || 'prospect',
        source: c.source || '',
        notes: c.notes || '',
        address: c.address || '',
        tagsText: Array.isArray(c.tags) ? c.tags.join(', ') : '',
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
        leadStage: c.lead_stage || 'new',
      })
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => { load() }, [id])

  const sortedActivities = useMemo(() =>
    [...activities].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()),
    [activities]
  )

  const saveContact = async () => {
    if (!id) return
    if (form.email && form.email.trim() && !validateEmail(form.email.trim())) {
      setEmailError('Invalid email format (e.g. client@domain.com)')
      return
    }
    setEmailError(null)
    if (form.address && form.address.trim()) {
      const addrResult = validateAddress(form.address.trim())
      if (!addrResult.valid) {
        setAddressError(addrResult.errors.join('; '))
        return
      }
      if (addrResult.normalized) setForm((f) => ({ ...f, address: addrResult.normalized! }))
    }
    setAddressError(null)
    setSaving(true)
    try {
      await apiFetch(`/api/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          email: form.email || null, phone: form.phone || null,
          type: form.type, status: form.status,
          source: form.source || null, notes: form.notes || null,
          address: form.address || null,
          tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
          assignedTo: form.assignedTo || null,
          timeline: form.timeline || null,
          budgetMin: form.budgetMin || null, budgetMax: form.budgetMax || null,
          financingReadiness: form.financingReadiness || null,
          moveDate: form.moveDate || null, sellerMotivation: form.sellerMotivation || null,
          representationStatus: form.representationStatus || null,
          urgency: form.urgency || null,
          preferredContactMethod: form.preferredContactMethod || null,
          language: form.language || null,
          nextFollowUpDate: form.nextFollowUpDate || null,
          nextAction: form.nextAction || null,
          leadStage: form.leadStage,
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

  const logActivity = async () => {
    if (!id || !logTitle.trim()) return
    setLogSaving(true)
    try {
      await apiFetch(`/api/contacts/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type: logType, title: logTitle, body: logBody || null }),
      })
      setLogTitle('')
      setLogBody('')
      setShowLogForm(false)
      await load()
      showToast('Activity logged')
    } catch (e: any) {
      showToast(e.message || 'Failed to log activity', 'error')
    } finally {
      setLogSaving(false)
    }
  }

  const currentStageIndex = PIPELINE_STAGES.findIndex(s => s.id === form.leadStage)

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'activity', label: 'Activity', icon: Clock },
    { id: 'qualification', label: 'Full Details', icon: BarChart2 },
    { id: 'records', label: 'Linked Records', icon: Home },
    { id: 'communication', label: 'Communication', icon: Mail },
    { id: 'notes', label: 'Notes & Tags', icon: Tag },
  ]

  const fullName = contact ? `${contact.first_name} ${contact.last_name}` : '...'
  const initials = contact ? `${contact.first_name[0] ?? ''}${contact.last_name[0] ?? ''}`.toUpperCase() : '?'

  return (
    <Layout title="Contact Details">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold animate-fade-in ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* ── Back + breadcrumb ───────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-5 text-sm text-gray-500">
          <button onClick={() => navigate('/marketing/crm')} className="flex items-center gap-1.5 hover:text-brand-navy transition-colors">
            <ArrowLeft className="h-4 w-4" /> Contacts
          </button>
          <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          <span className="text-gray-800 font-medium">{fullName}</span>
        </div>

        {/* ── Contact Hero Card ───────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start gap-5">
            {/* Avatar */}
            <div className="h-16 w-16 rounded-2xl bg-brand-navy flex items-center justify-center flex-shrink-0">
              <span className="text-brand-gold font-bold text-2xl">{initials}</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${STAGE_BADGE[form.leadStage] || 'bg-gray-100 text-gray-600'}`}>
                  {PIPELINE_STAGES.find(s => s.id === form.leadStage)?.label || form.leadStage}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                  {TYPE_LABELS[form.type] || form.type}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                {form.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{form.email}</span>}
                {form.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{form.phone}</span>}
                {form.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{form.address}</span></span>}
              </div>
              {/* Tags */}
              {form.tagsText && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.tagsText.split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-brand-navy/5 text-brand-navy font-medium border border-brand-navy/10">
                      <Tag className="h-3 w-3" />{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {form.phone && (
                <a href={`tel:${form.phone}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100 hover:bg-emerald-100 transition-colors">
                  <Phone className="h-4 w-4" /> Call
                </a>
              )}
              {form.email && (
                <a href={`mailto:${form.email}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-colors">
                  <Mail className="h-4 w-4" /> Email
                </a>
              )}
              <button
                onClick={() => { setShowLogForm(true); setTab('activity') }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Log Activity
              </button>
            </div>
          </div>

          {/* Pipeline Stage Progress */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Pipeline Stage</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {PIPELINE_STAGES.filter(s => s.id !== 'closed_lost').map((stage, idx) => (
                <button
                  key={stage.id}
                  onClick={() => setForm(f => ({ ...f, leadStage: stage.id }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
                    form.leadStage === stage.id
                      ? `${stage.color} text-white shadow-sm`
                      : idx < currentStageIndex
                        ? 'bg-gray-100 text-gray-500'
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

        {/* ── Tab navigation ──────────────────────────────────────── */}
        <div className="flex items-center gap-1 overflow-x-auto mb-5 bg-white rounded-2xl border border-gray-200 p-1.5 shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                tab === t.id
                  ? 'bg-brand-navy text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab Content ─────────────────────────────────────────── */}

        {/* OVERVIEW ─────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              {/* Contact Information */}
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <h3 className="font-bold text-gray-800 mb-4">Contact Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">First Name</label>
                    <input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Last Name</label>
                    <input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
                    {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Phone</label>
                    <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Contact Type</label>
                    <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white">
                      {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white">
                      <option value="prospect">Prospect</option>
                      <option value="active">Active</option>
                      <option value="closed">Closed</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Lead Source</label>
                    <input value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      placeholder="e.g. Website, Referral, MLS" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Language</label>
                    <input value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      placeholder="e.g. English, Spanish" />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Address</label>
                  <textarea value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    rows={2} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy resize-none" />
                  {addressError && <p className="text-xs text-red-600 mt-1">{addressError}</p>}
                </div>
              </div>

              <div className="flex justify-end">
                <button onClick={saveContact} disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy/90 disabled:opacity-50 transition-colors shadow-sm">
                  <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </div>

            {/* Sidebar: recent activity */}
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-800 text-sm">Recent Activity</h4>
                  <button onClick={() => setTab('activity')} className="text-xs text-brand-navy font-bold hover:underline">View all</button>
                </div>
                {sortedActivities.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No activities logged yet.</p>
                ) : (
                  <div className="space-y-3">
                    {sortedActivities.slice(0, 4).map((a) => {
                      const Icon = ACTIVITY_ICONS[a.type] || FileText
                      return (
                        <div key={a.id} className="flex gap-3">
                          <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <Icon className="h-3.5 w-3.5 text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate">{a.title}</p>
                            <p className="text-xs text-gray-400">{new Date(a.occurred_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Next action card */}
              {(form.nextFollowUpDate || form.nextAction) && (
                <div className="bg-amber-50 rounded-2xl border border-amber-100 p-4">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">Next Action</p>
                  {form.nextAction && <p className="text-sm font-semibold text-gray-800">{form.nextAction}</p>}
                  {form.nextFollowUpDate && (
                    <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(form.nextFollowUpDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ACTIVITY ────────────────────────────────────────────── */}
        {tab === 'activity' && (
          <div className="space-y-4">
            {/* Log Activity Form */}
            {showLogForm ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-gray-800">Log Activity</h4>
                  <button onClick={() => setShowLogForm(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    {(['call', 'email', 'note', 'meeting'] as const).map(t => {
                      const Icon = ACTIVITY_ICONS[t]
                      return (
                        <button key={t} onClick={() => setLogType(t)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all border ${
                            logType === t ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-brand-navy'
                          }`}>
                          <Icon className="h-3.5 w-3.5" />{t}
                        </button>
                      )
                    })}
                  </div>
                  <input value={logTitle} onChange={e => setLogTitle(e.target.value)}
                    placeholder="Activity summary (required)"
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
                  <textarea value={logBody} onChange={e => setLogBody(e.target.value)}
                    placeholder="Additional notes (optional)" rows={3}
                    className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy resize-none" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowLogForm(false)} className="px-4 py-2 rounded-xl border text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                    <button onClick={logActivity} disabled={logSaving || !logTitle.trim()}
                      className="px-5 py-2 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy/90 disabled:opacity-50">
                      {logSaving ? 'Saving...' : 'Log Activity'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowLogForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy/90 transition-colors shadow-sm">
                <Plus className="h-4 w-4" /> Log Activity
              </button>
            )}

            {/* Timeline */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h4 className="font-bold text-gray-800 mb-4">Activity Timeline</h4>
              {sortedActivities.length === 0 ? (
                <div className="py-10 text-center">
                  <Clock className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No activities logged yet.</p>
                  <p className="text-xs text-gray-300 mt-1">Log a call, email, note, or meeting above.</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-100" />
                  <div className="space-y-5">
                    {sortedActivities.map((a) => {
                      const Icon = ACTIVITY_ICONS[a.type] || FileText
                      return (
                        <div key={a.id} className="flex gap-4 relative">
                          <div className="h-7 w-7 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center flex-shrink-0 z-10">
                            <Icon className="h-3.5 w-3.5 text-gray-500" />
                          </div>
                          <div className="flex-1 pb-1">
                            <p className="font-semibold text-sm text-gray-900">{a.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{new Date(a.occurred_at).toLocaleString()}</p>
                            {a.body && <p className="text-sm text-gray-600 mt-1.5 bg-gray-50 rounded-lg px-3 py-2">{a.body}</p>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LEAD QUALIFICATION ────────────────────────────────── */}
        {tab === 'qualification' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
            <h3 className="font-bold text-gray-800">Lead Qualification</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Timeline</label>
                <input value={form.timeline} onChange={e => setForm(f => ({ ...f, timeline: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="e.g. 3-6 months, ASAP" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Urgency</label>
                <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white">
                  <option value="">— Select —</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="immediate">Immediate</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Budget Min
                </label>
                <input type="number" value={form.budgetMin || ''} onChange={e => setForm(f => ({ ...f, budgetMin: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Budget Max
                </label>
                <input type="number" value={form.budgetMax || ''} onChange={e => setForm(f => ({ ...f, budgetMax: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Financing Readiness</label>
                <select value={form.financingReadiness} onChange={e => setForm(f => ({ ...f, financingReadiness: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white">
                  <option value="">— Select —</option>
                  <option value="pre_approved">Pre-Approved</option>
                  <option value="pre_qualified">Pre-Qualified</option>
                  <option value="cash">Cash Buyer</option>
                  <option value="needs_pre_approval">Needs Pre-Approval</option>
                  <option value="not_started">Not Started</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Target Move Date</label>
                <input type="date" value={form.moveDate} onChange={e => setForm(f => ({ ...f, moveDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Representation Status</label>
                <select value={form.representationStatus} onChange={e => setForm(f => ({ ...f, representationStatus: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white">
                  <option value="">— Select —</option>
                  <option value="unrepresented">Unrepresented</option>
                  <option value="represented_by_us">Represented by Us</option>
                  <option value="represented_by_other">Represented by Other Agent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Preferred Contact Method</label>
                <select value={form.preferredContactMethod} onChange={e => setForm(f => ({ ...f, preferredContactMethod: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white">
                  <option value="">— Select —</option>
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="text">Text</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Seller Motivation</label>
                <input value={form.sellerMotivation} onChange={e => setForm(f => ({ ...f, sellerMotivation: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="e.g. Relocating for work, downsizing, estate sale" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={saveContact} disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy/90 disabled:opacity-50 transition-colors">
                <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Qualification'}
              </button>
            </div>
          </div>
        )}

        {/* LINKED RECORDS ─────────────────────────────────────── */}
        {tab === 'records' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h4 className="font-bold text-gray-800 mb-4">Linked Transactions</h4>
              {linkedTransactions.length === 0 ? (
                <div className="py-8 text-center">
                  <Home className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No transactions linked to this contact.</p>
                  <Link to="/transactions/pipeline" className="mt-2 inline-flex items-center gap-1 text-xs text-brand-navy font-bold hover:underline">
                    Go to Deals Pipeline <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {linkedTransactions.map((tx: any) => (
                    <Link key={tx.id} to={`/transactions/${tx.id}`}
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors group">
                      <div>
                        <p className="font-semibold text-sm text-gray-900 group-hover:text-brand-navy">{tx.name || tx.address}</p>
                        <p className="text-xs text-gray-400 capitalize">{tx.type} · {tx.status?.replace(/_/g, ' ')}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-brand-navy" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMMUNICATION ──────────────────────────────────────── */}
        {tab === 'communication' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
            <h3 className="font-bold text-gray-800">Communication & Follow-up</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Next Follow-Up Date</label>
                <input type="date" value={form.nextFollowUpDate} onChange={e => setForm(f => ({ ...f, nextFollowUpDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Next Planned Action</label>
                <input value={form.nextAction} onChange={e => setForm(f => ({ ...f, nextAction: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="e.g. Send listing matches, Schedule showing" />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={saveContact} disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy/90 disabled:opacity-50 transition-colors">
                <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* NOTES & TAGS ─────────────────────────────────────── */}
        {tab === 'notes' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
            <h3 className="font-bold text-gray-800">Notes & Tags</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Tags</label>
              <input value={form.tagsText} onChange={e => setForm(f => ({ ...f, tagsText: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                placeholder="Separate tags with commas, e.g. VIP, hot-lead, investor" />
              <p className="text-xs text-gray-400 mt-1">Separate multiple tags with commas</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">Internal Notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={6} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy resize-none"
                placeholder="Private notes about this contact — not visible to the client" />
            </div>
            <div className="flex justify-end">
              <button onClick={saveContact} disabled={saving}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy/90 disabled:opacity-50 transition-colors">
                <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}