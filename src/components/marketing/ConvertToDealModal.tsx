import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Loader2, DollarSign, CalendarDays, Rocket, CheckCircle2, Link2, Plus, Search, ChevronDown } from 'lucide-react'
import { getLocalDateString } from '@/utils/date'
import clsx from 'clsx'

interface ConvertToDealModalProps {
  contact: {
    id: string
    first_name: string
    last_name: string
    email?: string | null
    phone?: string | null
    type?: string
    budget_max?: number | null
    budget_min?: number | null
    notes?: string | null
  }
  isOpen: boolean
  onClose: () => void
  onSuccess: (newDealId?: string) => void
}

type Mode = 'create' | 'link'

interface ExistingDeal {
  id: string
  name: string
  type: string
  status: string
  price?: number | null
}

export function ConvertToDealModal({ contact, isOpen, onClose, onSuccess }: ConvertToDealModalProps) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('create')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // ── Create New Deal Form ──────────────────────────────────────────
  const defaultPrice = contact.budget_max || contact.budget_min || ''
  const isSeller = contact.type === 'seller' || contact.type === 'landlord'
  const isLease = contact.type === 'landlord' || contact.type === 'tenant'

  const [formData, setFormData] = useState({
    name: `${contact.first_name} ${contact.last_name} — ${isSeller ? 'Exclusive Listing' : isLease ? 'Rental Pursuit' : 'Buyer Pursuit'}`,
    type: isLease ? 'lease' : 'sale',
    role: isSeller ? 'seller' : 'buyer',
    price: defaultPrice ? String(defaultPrice) : '',
    commission_rate: '2.0',
    target_close_date: getLocalDateString(new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)),
    notes: contact.notes || ''
  })

  // ── Link to Existing Deal State ───────────────────────────────────
  const [existingDeals, setExistingDeals] = useState<ExistingDeal[]>([])
  const [dealsLoading, setDealsLoading] = useState(false)
  const [dealSearch, setDealSearch] = useState('')
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const [linkRole, setLinkRole] = useState<string>(isSeller ? 'seller' : 'buyer')
  const [isPrimary, setIsPrimary] = useState(true)

  useEffect(() => {
    if (mode === 'link' && existingDeals.length === 0) {
      setDealsLoading(true)
      fetch('/api/transactions?time_horizon=active')
        .then(r => r.json())
        .then(json => {
          const list = (json?.data || json?.transactions || []) as ExistingDeal[]
          setExistingDeals(list)
        })
        .catch(() => {})
        .finally(() => setDealsLoading(false))
    }
  }, [mode])

  if (!isOpen) return null

  const filteredDeals = existingDeals.filter(d =>
    d.name.toLowerCase().includes(dealSearch.toLowerCase())
  )

  const selectedDeal = existingDeals.find(d => d.id === selectedDealId)

  // ── Handlers ──────────────────────────────────────────────────────
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setErrorMsg('')

    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        price: formData.price ? parseFloat(formData.price) : null,
        commission_rate: formData.commission_rate ? parseFloat(formData.commission_rate) : null,
        target_close_date: formData.target_close_date || null,
        parties: [{ contact_id: contact.id, role: formData.role, is_primary: true }]
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Failed to create transaction deal')
      }

      const dealData = await res.json()
      const newDealId = dealData?.data?.id || dealData?.id

      await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lifecycleStage: 'active_client',
          status: 'active',
          qualificationStatus: 'qualified',
          representationStatus: 'represented_by_us'
        })
      })

      onSuccess(newDealId)
      onClose()
      if (newDealId) navigate(`/transactions/${newDealId}`)
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while creating the deal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDealId) {
      setErrorMsg('Please select an existing deal to link this contact to.')
      return
    }
    setIsSubmitting(true)
    setErrorMsg('')

    try {
      const res = await fetch(`/api/transactions/${selectedDealId}/parties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_id: contact.id,
          role: linkRole,
          is_primary: isPrimary
        })
      })

      if (!res.ok) {
        const errJson = await res.json()
        throw new Error(errJson.error || 'Failed to link contact to deal')
      }

      // Contact lifecycle is updated by the backend endpoint
      onSuccess(selectedDealId)
      onClose()
      navigate(`/transactions/${selectedDealId}`)
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred while linking to the deal')
    } finally {
      setIsSubmitting(false)
    }
  }

  const STATUS_BADGE: Record<string, string> = {
    lead: 'bg-gray-100 text-gray-600',
    active: 'bg-blue-50 text-blue-700',
    offer_received: 'bg-amber-50 text-amber-700',
    under_contract: 'bg-purple-50 text-purple-700',
    closed: 'bg-emerald-50 text-emerald-700',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur-xs">
              <Rocket className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">Convert to Active Deal</h2>
              <p className="text-xs text-blue-100 mt-0.5">Graduate client into the live Deals</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Contact Mini Summary Card */}
        <div className="bg-blue-50/70 border-b border-blue-100 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
              {contact.first_name[0]}{contact.last_name[0]}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900">{contact.first_name} {contact.last_name}</p>
              <p className="text-[11px] text-gray-500">{contact.email || contact.phone || 'Contact party'}</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-white px-2.5 py-1 rounded-full border border-blue-200">
            <CheckCircle2 className="h-3 w-3 text-blue-600" />
            {isSeller ? 'Seller' : 'Buyer'} Contact
          </span>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-100 bg-gray-50/60">
          <button
            type="button"
            onClick={() => { setMode('create'); setErrorMsg('') }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer',
              mode === 'create'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            Create New Deal Room
          </button>
          <button
            type="button"
            onClick={() => { setMode('link'); setErrorMsg('') }}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-bold transition-colors border-b-2 cursor-pointer',
              mode === 'link'
                ? 'border-indigo-600 text-indigo-700 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
            Link to Existing Deal
          </button>
        </div>

        {/* ── CREATE NEW DEAL FORM ─────────────────────────────────────── */}
        {mode === 'create' && (
          <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
            {errorMsg && (
              <div className="rounded-xl bg-red-50 p-3 border border-red-200 text-xs text-red-700 font-medium">
                {errorMsg}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Deal Room Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Transaction Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="sale">Sale</option>
                  <option value="lease">Lease / Rental</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Representation Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2 text-xs bg-white focus:border-blue-600 focus:outline-hidden"
                >
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="landlord">Landlord</option>
                  <option value="tenant">Tenant</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Target / Budget Price</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="number"
                    placeholder="e.g. 1200000"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 pl-8 pr-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Target Close Date</label>
                <div className="relative">
                  <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    type="date"
                    value={formData.target_close_date}
                    onChange={(e) => setFormData({ ...formData, target_close_date: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 pl-8 pr-3.5 py-2 text-xs focus:border-blue-600 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-gray-100">
              <button type="button" disabled={isSubmitting} onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-xs font-bold transition-all shadow-sm hover:shadow cursor-pointer disabled:opacity-50">
                {isSubmitting ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating Deal Room...</>
                ) : (
                  <><Rocket className="h-3.5 w-3.5" />Launch Deal Room</>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── LINK TO EXISTING DEAL FORM ──────────────────────────────── */}
        {mode === 'link' && (
          <form onSubmit={handleLinkSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
            {errorMsg && (
              <div className="rounded-xl bg-red-50 p-3 border border-red-200 text-xs text-red-700 font-medium">
                {errorMsg}
              </div>
            )}

            {/* Info banner */}
            <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-xs text-indigo-800 font-medium flex items-start gap-2">
              <Link2 className="h-3.5 w-3.5 mt-0.5 text-indigo-500 shrink-0" />
              <span>Attach <strong>{contact.first_name} {contact.last_name}</strong> to an existing deal room as a party. No duplicate deal card will be created.</span>
            </div>

            {/* Deal Picker */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Search Active Deals <span className="text-red-500">*</span>
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={dealSearch}
                  onChange={e => setDealSearch(e.target.value)}
                  placeholder="Search by deal name or address..."
                  className="w-full rounded-xl border border-gray-300 pl-9 pr-3.5 py-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              {dealsLoading ? (
                <div className="flex items-center gap-2 text-xs text-gray-500 py-3 px-3">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                  Loading active deals...
                </div>
              ) : (
                <div className="max-h-[200px] overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                  {filteredDeals.length === 0 ? (
                    <p className="text-xs text-gray-400 py-5 text-center">No active deals found.</p>
                  ) : filteredDeals.map(deal => (
                    <button
                      key={deal.id}
                      type="button"
                      onClick={() => setSelectedDealId(deal.id === selectedDealId ? null : deal.id)}
                      className={clsx(
                        'w-full flex items-center justify-between px-4 py-3 text-left text-xs transition-colors cursor-pointer',
                        selectedDealId === deal.id
                          ? 'bg-indigo-50 text-indigo-900'
                          : 'hover:bg-gray-50 text-gray-800'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {selectedDealId === deal.id && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        )}
                        <span className="font-semibold truncate">{deal.name}</span>
                        <span className="text-gray-400 capitalize shrink-0">{deal.type}</span>
                      </div>
                      <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 shrink-0', STATUS_BADGE[deal.status] || 'bg-gray-100 text-gray-600')}>
                        {deal.status?.replace(/_/g, ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {selectedDeal && (
                <p className="text-[11px] text-indigo-700 font-semibold mt-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Selected: {selectedDeal.name}
                  {selectedDeal.price ? ` · $${selectedDeal.price.toLocaleString()}` : ''}
                </p>
              )}
            </div>

            {/* Role + Primary */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Party Role</label>
                <div className="relative">
                  <select
                    value={linkRole}
                    onChange={e => setLinkRole(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3.5 pr-8 py-2 text-xs bg-white focus:border-indigo-500 focus:outline-hidden appearance-none"
                  >
                    <option value="buyer">Buyer</option>
                    <option value="seller">Seller</option>
                    <option value="landlord">Landlord</option>
                    <option value="tenant">Tenant</option>
                    <option value="co_buyer">Co-Buyer</option>
                    <option value="co_seller">Co-Seller</option>
                    <option value="attorney">Attorney</option>
                    <option value="other">Other</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer mt-5">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={e => setIsPrimary(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs font-bold text-gray-700">Primary Party</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-gray-100">
              <button type="button" disabled={isSubmitting} onClick={onClose}
                className="rounded-xl px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50">
                Cancel
              </button>
              <button type="submit" disabled={isSubmitting || !selectedDealId}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 text-xs font-bold transition-all shadow-sm hover:shadow cursor-pointer disabled:opacity-60">
                {isSubmitting ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />Linking...</>
                ) : (
                  <><Link2 className="h-3.5 w-3.5" />Link to Deal Room</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
