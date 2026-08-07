import { useState, useEffect } from 'react'
import { X, Loader2, DollarSign, CalendarDays } from 'lucide-react'
import clsx from 'clsx'

interface NewDealModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function NewDealModal({ onClose, onSuccess }: NewDealModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [listings, setListings] = useState<any[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
  const [selectedListingId, setSelectedListingId] = useState('')
  const [listingSearchQuery, setListingSearchQuery] = useState('')
  const [isListingDropdownOpen, setIsListingDropdownOpen] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    type: 'sale',
    price: '',
    commission_amount: '',
    commission_rate: '',
    commission_split_buyer_percent: '',
    commission_split_co_broker_percent: '',
    commission_split_referral_percent: '',
    target_close_date: '',
  })

  useEffect(() => {
    async function loadListings() {
      setLoadingListings(true)
      try {
        const res = await fetch('/api/listings')
        const json = await res.json()
        if (json.success) {
          const list = json.data?.listings || json.data?.projects || json.data || []
          setListings(list)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setLoadingListings(false)
      }
    }
    loadListings()
  }, [])

  const handleSelectListing = (listingId: string) => {
    setSelectedListingId(listingId)
    setIsListingDropdownOpen(false)
    const listing = listings.find(l => l.id === listingId)
    if (listing) {
      setListingSearchQuery(listing.name || listing.address || `Listing ${listing.id.slice(0, 8)}`)
      setFormData(prev => ({
        ...prev,
        name: listing.name || listing.address || prev.name,
        price: listing.price || prev.price || '',
        type: listing.propertyType?.toLowerCase().includes('lease') ? 'lease' : 'sale'
      }))
    } else {
      setListingSearchQuery('')
    }
  }

  const filteredListings = listings.filter(l => {
    const q = listingSearchQuery.toLowerCase()
    return (l.name || '').toLowerCase().includes(q) || (l.address || '').toLowerCase().includes(q) || (l.id || '').toLowerCase().includes(q)
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        price: formData.price ? parseFloat(formData.price) : null,
        commission_amount: formData.commission_amount ? parseFloat(formData.commission_amount) : null,
        commission_rate: formData.commission_rate ? parseFloat(formData.commission_rate) : null,
        commission_split_buyer_percent: formData.commission_split_buyer_percent ? parseFloat(formData.commission_split_buyer_percent) : null,
        commission_split_co_broker_percent: formData.commission_split_co_broker_percent ? parseFloat(formData.commission_split_co_broker_percent) : null,
        commission_split_referral_percent: formData.commission_split_referral_percent ? parseFloat(formData.commission_split_referral_percent) : null,
        target_close_date: formData.target_close_date || null,
        inventory_listing_id: selectedListingId || null,
        parties: []
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        onSuccess()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to create transaction')
      }
    } catch (e) {
      console.error(e)
      alert('An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Create New Deal</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form id="new-deal-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6">
            <div className="space-y-6">
              
              {/* Basic Details */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Deal Information</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Search Inventory Listing (Optional)</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        placeholder="Type to search listings..."
                        value={listingSearchQuery}
                        onChange={(e) => {
                          setListingSearchQuery(e.target.value)
                          setSelectedListingId('')
                          setIsListingDropdownOpen(true)
                        }}
                        onFocus={() => setIsListingDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsListingDropdownOpen(false), 200)}
                        disabled={loadingListings}
                      />
                      {loadingListings && (
                        <div className="absolute right-3 top-2.5">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                      )}
                      {isListingDropdownOpen && filteredListings.length > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                          {filteredListings.map(l => (
                            <li
                              key={l.id}
                              onClick={() => handleSelectListing(l.id)}
                              className="cursor-pointer px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
                            >
                              <span className="font-medium text-gray-900">{l.name || l.address || 'Unnamed Listing'}</span>
                              <span className="text-xs text-gray-500 truncate ml-2">MLS: {l.id?.slice(0, 8)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      Selecting an inventory listing will automatically link it and pre-fill deal information.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Deal Name *</label>
                    <input
                      required
                      type="text"
                      placeholder="e.g. 123 Main St - Sale"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Deal Type</label>
                    <select
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value })}
                    >
                      <option value="sale">Sale</option>
                      <option value="lease">Lease</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Target Close Date</label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="date"
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        value={formData.target_close_date}
                        onChange={e => setFormData({ ...formData, target_close_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Financials */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Financials & Commission Splits</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Target Price ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        value={formData.price}
                        onChange={e => {
                          const val = e.target.value
                          setFormData(prev => {
                            const priceVal = val ? parseFloat(val) : 0
                            const rateVal = prev.commission_rate ? parseFloat(prev.commission_rate) : 0
                            const commAmt = priceVal && rateVal ? String((priceVal * (rateVal / 100)).toFixed(2)) : prev.commission_amount
                            return { ...prev, price: val, commission_amount: commAmt }
                          })
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Commission Rate (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 5"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      value={formData.commission_rate}
                      onChange={e => {
                        const val = e.target.value
                        setFormData(prev => {
                          const rateVal = val ? parseFloat(val) : 0
                          const priceVal = prev.price ? parseFloat(prev.price) : 0
                          const commAmt = priceVal && rateVal ? String((priceVal * (rateVal / 100)).toFixed(2)) : prev.commission_amount
                          return { ...prev, commission_rate: val, commission_amount: commAmt }
                        })
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Projected Commission ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="number"
                        placeholder="0.00"
                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        value={formData.commission_amount}
                        onChange={e => setFormData({ ...formData, commission_amount: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Buyer Agent Split (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 50"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      value={formData.commission_split_buyer_percent}
                      onChange={e => setFormData({ ...formData, commission_split_buyer_percent: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Co-Broker Split (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 50"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      value={formData.commission_split_co_broker_percent}
                      onChange={e => setFormData({ ...formData, commission_split_co_broker_percent: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Referral Split (%)</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 10"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      value={formData.commission_split_referral_percent}
                      onChange={e => setFormData({ ...formData, commission_split_referral_percent: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Connections removed as requested */}

            </div>
          </form>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 bg-gray-50 rounded-b-2xl mt-auto">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-deal-form"
            disabled={isSubmitting}
            className={clsx(
              "flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors",
              isSubmitting ? "opacity-70 cursor-not-allowed" : "hover:bg-blue-700"
            )}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Deal
          </button>
        </div>

      </div>
    </div>
  )
}
