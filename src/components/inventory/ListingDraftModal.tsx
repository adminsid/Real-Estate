import { useState } from 'react'
import {
  X,
  Building2,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  MapPin
} from 'lucide-react'

interface ListingDraftModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newListing?: any) => void
}

const PROPERTY_TYPES = [
  { id: 'Residential', name: 'Residential', icon: '🏠', desc: 'Single-family detached home' },
  { id: 'Residential', subtype: 'Condominium', name: 'Residential Condo', icon: '🏢', desc: 'Individually owned unit' },
  { id: 'Residential', subtype: 'Stock Cooperative', name: 'Residential Co-op', icon: '🤝', desc: 'Cooperative share ownership' },
  { id: 'Residential Income', name: 'Residential Multi 2-4', icon: '🏘', desc: 'Two to four dwelling units' },
  { id: 'Rental', name: 'Rental', icon: '🔑', desc: 'Lease / rental listing' },
  { id: 'Land', name: 'Land', icon: '🌿', desc: 'Vacant land or lot' },
  { id: 'Commercial Sale', name: 'Commercial Sale', icon: '🏪', desc: 'Commercial property for sale' },
  { id: 'Commercial Lease', name: 'Commercial Lease', icon: '📋', desc: 'Commercial space for lease' },
  { id: 'Commercial Sale', subtype: 'Multi Family', name: 'Commercial Multi 5+', icon: '🏬', desc: 'Five or more units' },
  { id: 'Business Opportunity', name: 'Business Opportunity', icon: '💼', desc: 'Business for sale / transfer' }
]

const PROPERTY_SUBTYPES: Record<string, string[]> = {
  Residential: ['Single Family Residence', 'Condominium', 'Stock Cooperative', 'Townhouse', 'Manufactured Home', 'Mobile Home'],
  'Residential Income': ['Duplex', 'Triplex', 'Quadruplex', 'Multi Family (2-4 Units)'],
  'Commercial Sale': ['Retail', 'Office', 'Industrial', 'Warehouse', 'Mixed Use', 'Multi Family', 'Hotel/Motel', 'Business', 'Unimproved Land'],
  'Commercial Lease': ['Retail', 'Office', 'Industrial', 'Warehouse', 'Mixed Use', 'Multi Family', 'Hotel/Motel', 'Business'],
  'Business Opportunity': ['Retail', 'Office', 'Restaurant/Bar', 'Service', 'Industrial', 'Business'],
  Land: ['Residential Land', 'Commercial Land', 'Industrial Land', 'Agricultural'],
  Rental: ['Apartment', 'Single Family Residence', 'Townhouse', 'Condominium', 'Stock Cooperative', 'Multi Family']
}

export function ListingDraftModal({
  isOpen,
  onClose,
  onSuccess,
}: ListingDraftModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedSubtype, setSelectedSubtype] = useState<string>('')
  const [address, setAddress] = useState('')
  const [listingName, setListingName] = useState('')
  const [city, setCity] = useState('New York')
  const [state, setState] = useState('NY')
  const [zip, setZip] = useState('')
  const [price, setPrice] = useState('')

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdListing, setCreatedListing] = useState<{
    id: string
    name: string
    editUrl: string
    readOnlyUrl: string
  } | null>(null)
  const [copiedEdit, setCopiedEdit] = useState(false)
  const [copiedReadOnly, setCopiedReadOnly] = useState(false)

  if (!isOpen) return null

  const handleSelectType = (item: (typeof PROPERTY_TYPES)[0]) => {
    setSelectedType(item.id)
    if (item.subtype) {
      setSelectedSubtype(item.subtype)
    } else {
      const defaultSubtypes = PROPERTY_SUBTYPES[item.id] || []
      setSelectedSubtype(defaultSubtypes[0] || '')
    }
    setStep(2)
  }

  const handleAddressChange = (val: string) => {
    setAddress(val)
    if (!listingName || listingName === address) {
      setListingName(val)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) {
      setError('Property address is required.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const finalName = listingName.trim() || address.trim()
      const payload = {
        name: finalName,
        propertyType: selectedType || 'Residential',
        data: {
          propertyType: selectedType || 'Residential',
          propertySubtype: selectedSubtype,
          streetAddress: address.trim(),
          city: city.trim() || 'New York',
          stateOrProvince: state.trim() || 'NY',
          postalCode: zip.trim(),
          listPrice: price ? Number(price) : null
        }
      }

      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const json = await res.json()
      if (!res.ok && json.error) {
        throw new Error(json.error)
      }

      const id = json.id || json.data?.id
      const editUrl = json.editUrl || (json.access?.editToken ? `https://inventory.primeamericarealestate.com/share/edit/${id}/${json.access.editToken}` : `https://inventory.primeamericarealestate.com/listings/${id}`)
      const readOnlyUrl = json.readOnlyUrl || (json.access?.inviteOnlyToken ? `https://inventory.primeamericarealestate.com/share/invite/${id}/${json.access.inviteOnlyToken}` : '')

      const created = {
        id,
        name: finalName,
        editUrl,
        readOnlyUrl
      }

      setCreatedListing(created)
      setStep(3)
      onSuccess(created)
    } catch (err: any) {
      setError(err.message || 'Failed to create listing draft')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopyLink = async (url: string, type: 'edit' | 'readonly') => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      if (type === 'edit') {
        setCopiedEdit(true)
        setTimeout(() => setCopiedEdit(false), 2000)
      } else {
        setCopiedReadOnly(true)
        setTimeout(() => setCopiedReadOnly(false), 2000)
      }
    } catch (e) {
      console.error('Failed to copy link', e)
    }
  }

  const handleResetAndClose = () => {
    setStep(1)
    setSelectedType('')
    setSelectedSubtype('')
    setAddress('')
    setListingName('')
    setPrice('')
    setCreatedListing(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 bg-brand-navy text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10 text-brand-gold">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {step === 3 ? 'Listing Draft Created!' : 'New Listing Draft'}
              </h3>
              <p className="text-xs text-white/70">
                {step === 1 && 'Step 1 of 2: Select the property type to begin'}
                {step === 2 && 'Step 2 of 2: Enter property address and details'}
                {step === 3 && 'Access and share links ready'}
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
              {error}
            </div>
          )}

          {/* STEP 1: PROPERTY TYPE TILES */}
          {step === 1 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                Select Property Category
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PROPERTY_TYPES.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectType(item)}
                    className="flex items-start gap-3.5 p-3.5 rounded-xl border border-gray-200 hover:border-brand-navy/60 hover:bg-gray-50/80 transition-all text-left group shadow-xs hover:shadow-sm"
                  >
                    <span className="text-2xl p-2 rounded-lg bg-gray-100 group-hover:bg-brand-navy/10 flex-shrink-0">
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-gray-900 group-hover:text-brand-navy flex items-center justify-between">
                        {item.name}
                        <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-brand-navy transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">{item.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: ADDRESS & DETAILS FORM */}
          {step === 2 && (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/80 border border-blue-100 text-xs text-blue-900">
                <span className="font-semibold flex items-center gap-1.5">
                  <span className="text-base">{PROPERTY_TYPES.find((t) => t.id === selectedType)?.icon || '🏠'}</span>
                  Property Type: <strong className="font-bold">{selectedType}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-blue-700 hover:text-blue-900 font-bold underline text-xs flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Change
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Property Street Address <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. 127-15 Rockaway Blvd, South Ozone Park, NY"
                    value={address}
                    onChange={(e) => handleAddressChange(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Listing Name
                </label>
                <input
                  type="text"
                  placeholder="Listing name"
                  value={listingName}
                  onChange={(e) => setListingName(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                  Listing name auto-fills from address and can be modified.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Property Subtype
                  </label>
                  <select
                    value={selectedSubtype}
                    onChange={(e) => setSelectedSubtype(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none bg-white font-medium text-gray-800"
                  >
                    {(PROPERTY_SUBTYPES[selectedType] || ['Standard']).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Asking Price ($) <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    placeholder="650000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none font-semibold text-gray-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">ZIP Code</label>
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="11420"
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !address.trim()}
                  className="px-5 py-2.5 rounded-xl bg-brand-navy hover:bg-brand-navy-light text-white text-sm font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-brand-gold" />
                      Creating Listing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-brand-gold" />
                      Create Listing Draft
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: SUCCESS & ACCESS LINKS */}
          {step === 3 && createdListing && (
            <div className="space-y-6 text-center py-2">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-sm">
                <Check className="h-6 w-6 stroke-[2.5]" />
              </div>

              <div>
                <h4 className="font-extrabold text-gray-900 text-lg">Listing Draft Ready</h4>
                <p className="text-xs text-gray-500 mt-1">
                  <strong>{createdListing.name}</strong> has been created in your inventory.
                </p>
              </div>

              <div className="space-y-3.5 text-left bg-gray-50 p-4 rounded-xl border border-gray-200">
                {/* Scoped Edit Link */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      ✏️ Edit Full Listing Form (Direct Link)
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(createdListing.editUrl, 'edit')}
                      className="text-xs font-bold text-brand-navy hover:text-blue-600 flex items-center gap-1"
                    >
                      {copiedEdit ? (
                        <span className="text-emerald-600 flex items-center gap-1">
                          <Check className="h-3 w-3" /> Copied!
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Copy className="h-3 w-3" /> Copy Link
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdListing.editUrl}
                      className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-600 select-all font-mono"
                    />
                    <a
                      href={createdListing.editUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-1.5 rounded-lg bg-brand-navy hover:bg-brand-navy-light text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-brand-gold" />
                      Open Form
                    </a>
                  </div>
                </div>

                {/* Read-Only Link */}
                {createdListing.readOnlyUrl && (
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                        🔗 Read-Only / Invite Link (Client Preview)
                      </label>
                      <button
                        type="button"
                        onClick={() => handleCopyLink(createdListing.readOnlyUrl, 'readonly')}
                        className="text-xs font-bold text-brand-navy hover:text-blue-600 flex items-center gap-1"
                      >
                        {copiedReadOnly ? (
                          <span className="text-emerald-600 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Copied!
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Copy className="h-3 w-3" /> Copy Link
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={createdListing.readOnlyUrl}
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-xs text-gray-600 select-all font-mono"
                      />
                      <a
                        href={createdListing.readOnlyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3.5 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Preview
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition-colors"
                >
                  Done & View in MLS Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
