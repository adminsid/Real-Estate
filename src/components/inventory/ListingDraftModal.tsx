import { useState } from 'react'
import { X, Building2, Send, Loader2 } from 'lucide-react'


interface ListingDraftModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ListingDraftModal({
  isOpen,
  onClose,
  onSuccess,
}: ListingDraftModalProps) {
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('New York')
  const [state, setState] = useState('NY')
  const [zip, setZip] = useState('')
  const [price, setPrice] = useState('')
  const [propertyType, setPropertyType] = useState('residential')
  const [beds, setBeds] = useState('3')
  const [baths, setBaths] = useState('2')
  const [sqft, setSqft] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!address.trim()) {
      setError('Property address is required.')
      return
    }
    if (!price.trim()) {
      setError('Listing price is required.')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const payload = {
        title: address,
        address,
        city,
        state,
        zip,
        price: Number(price),
        type: propertyType,
        bedrooms: Number(beds),
        bathrooms: Number(baths),
        square_feet: sqft ? Number(sqft) : null,
        description,
        primary_photo_url: photoUrl || 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=800&q=80',
        approval_status: 'pending_approval',
      }

      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Failed to create listing draft')

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to submit draft')
    } finally {
      setIsSubmitting(false)
    }
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
              <h3 className="font-bold text-base text-white">Create Draft Listing</h3>
              <p className="text-xs text-white/70">Data-Entry Staging Tier • Submit for Inventory Admin Approval</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
              {error}
            </div>
          )}

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
            <div>
              <span className="font-bold block">Draft Staging Workflow</span>
              <span>This listing will be submitted to the Inventory Admin for verification before publishing live to MLS.</span>
            </div>
            <span className="px-2 py-1 rounded bg-amber-200 text-amber-900 font-extrabold text-[10px] uppercase">Staging</span>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Property Street Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 72-11 Austin Street, Apt 4B"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
            />
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
                placeholder="11375"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Asking Price ($) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                placeholder="650000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none font-semibold text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Property Type</label>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none bg-white"
              >
                <option value="residential">Residential Single Family</option>
                <option value="condo">Condominium</option>
                <option value="co-op">Co-Op</option>
                <option value="multi-family">Multi-Family</option>
                <option value="commercial">Commercial Property</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Beds</label>
              <input
                type="number"
                value={beds}
                onChange={(e) => setBeds(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Baths</label>
              <input
                type="number"
                step="0.5"
                value={baths}
                onChange={(e) => setBaths(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">SqFt</label>
              <input
                type="number"
                placeholder="1200"
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Primary Photo URL</label>
            <input
              type="url"
              placeholder="https://..."
              value={photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Public Remarks / Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter property highlights, renovated features, building amenities..."
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none resize-none"
            />
          </div>

          {/* Footer */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-brand-navy hover:bg-brand-navy-light text-white text-sm font-bold shadow-md transition-colors flex items-center gap-2"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin text-brand-gold" /> : <Send className="h-4 w-4 text-brand-gold" />}
              Submit Draft for Admin Approval
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
