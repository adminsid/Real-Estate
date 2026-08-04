import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Mail, FileText } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { validateEmail, validateAddress } from '@/utils/reconciliation'

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

export function CRMContactDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [saving, setSaving] = useState(false)
  const [activities, setActivities] = useState<Activity[]>([])

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    type: 'buyer',
    status: 'prospect',
    source: '',
    notes: '',
    address: '',
    tagsText: '',
    assignedTo: '',
    timeline: '',
    budgetMin: 0,
    budgetMax: 0,
    financingReadiness: '',
    moveDate: '',
    sellerMotivation: '',
    representationStatus: '',
    urgency: '',
    preferredContactMethod: '',
    language: 'English',
    nextFollowUpDate: '',
    nextAction: '',
    leadStage: 'new',
  })

  const [emailError, setEmailError] = useState<string | null>(null)
  const [addressError, setAddressError] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    try {
      const detail = await apiFetch(`/api/contacts/${id}`)
      const c = detail.contact as Contact
      setActivities(detail.activities || [])
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

  useEffect(() => {
    load()
  }, [id])

  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
  }, [activities])

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
      if (addrResult.normalized) {
        setForm((f) => ({ ...f, address: addrResult.normalized! }))
      }
    }
    setAddressError(null)

    setSaving(true)
    try {
      await apiFetch(`/api/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email || null,
          phone: form.phone || null,
          type: form.type,
          status: form.status,
          source: form.source || null,
          notes: form.notes || null,
          address: form.address || null,
          tags: form.tagsText.split(',').map((t) => t.trim()).filter(Boolean),
          assignedTo: form.assignedTo || null,
          timeline: form.timeline || null,
          budgetMin: form.budgetMin || null,
          budgetMax: form.budgetMax || null,
          financingReadiness: form.financingReadiness || null,
          moveDate: form.moveDate || null,
          sellerMotivation: form.sellerMotivation || null,
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
      alert('Contact qualification details updated successfully.')
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const apiFetch = async (path: string, opts?: RequestInit) => {
    const res = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...opts?.headers },
      ...opts,
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error ?? 'Request failed')
    return data.data
  }

  return (
    <Layout title="Contact Details">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                {addressError && <p className="text-xs text-red-600 mt-1">{addressError}</p>}
              </div>

              <div className="mt-6">
                <button
                  onClick={saveContact}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light disabled:opacity-50"
                >
                  <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="font-bold text-gray-900 mb-4">Activities</h3>
              {sortedActivities.map((activity) => (
                <div key={activity.id} className="flex gap-3 pb-4 mb-4 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    {activity.type === 'email' ? (
                      <Mail className="h-4 w-4 text-gray-600" />
                    ) : (
                      <FileText className="h-4 w-4 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900">{activity.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{new Date(activity.occurred_at).toLocaleString()}</p>
                    {activity.body && <p className="text-xs text-gray-600 mt-1">{activity.body}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}