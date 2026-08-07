import { useState, useEffect } from 'react'
import {
  X, Building2, MapPin, Bed, Bath, Maximize2,
  User, Phone, Mail, ExternalLink, Loader2
} from 'lucide-react'

import { Link } from 'react-router-dom'

interface ListingDetailDrawerProps {
  listingId: string | null
  isOpen: boolean
  onClose: () => void
}

export function ListingDetailDrawer({
  listingId,
  isOpen,
  onClose,
}: ListingDetailDrawerProps) {
  const [listing, setListing] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !listingId) {
      setListing(null)
      return
    }

    async function fetchListing() {
      setLoading(true)
      try {
        const res = await fetch(`/api/listings/${listingId}`)
        const json = await res.json()
        if (json.success && json.data) {
          setListing(json.data)
        } else {
          // fallback search in list
          const listRes = await fetch('/api/listings')
          const listJson = await listRes.json()
          const data = listJson.listings || listJson.data || []
          const found = data.find((l: any) => l.id === listingId)
          if (found) setListing(found)
        }
      } catch (e) {
        console.error('Failed to fetch listing drawer data', e)
      } finally {
        setLoading(false)
      }
    }

    fetchListing()
  }, [listingId, isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-gray-200 flex flex-col transform transition-transform duration-300">
          {/* Header */}
          <div className="px-6 py-4 bg-brand-navy text-white flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-white/10 text-brand-gold">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">Linked Property Details</h3>
                <p className="text-xs text-white/70">Off-Canvas MLS Inventory Drawer</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Loader2 className="h-8 w-8 animate-spin text-brand-gold mb-2" />
                <p className="text-sm font-medium">Fetching listing specifications...</p>
              </div>
            ) : listing ? (
              <>
                {/* Hero / Cover Image */}
                <div className="relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 aspect-video">
                  <img
                    src={listing.primary_photo_url || listing.photos?.[0] || 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=800&q=80'}
                    alt={listing.title || listing.address || 'Property Listing'}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-md uppercase tracking-wide">
                      {listing.status || 'Active'}
                    </span>
                  </div>
                  <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-white font-extrabold text-lg shadow-md">
                    ${listing.price ? Number(listing.price).toLocaleString() : 'Price TBD'}
                  </div>
                </div>

                {/* Title & Address */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{listing.title || listing.address || 'Property Listing'}</h2>
                  <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                    <MapPin className="h-4 w-4 text-brand-gold flex-shrink-0" />
                    {[listing.address, listing.city, listing.state, listing.zip].filter(Boolean).join(', ')}
                  </p>
                </div>

                {/* Key Metrics Pill Grid */}
                <div className="grid grid-cols-3 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-200 text-center">
                  <div>
                    <div className="text-xs font-bold uppercase text-gray-400 flex items-center justify-center gap-1 mb-1">
                      <Bed className="h-3.5 w-3.5 text-blue-500" /> Bedrooms
                    </div>
                    <span className="text-base font-extrabold text-gray-900">{listing.bedrooms || listing.beds || 'N/A'}</span>
                  </div>
                  <div className="border-x border-gray-200">
                    <div className="text-xs font-bold uppercase text-gray-400 flex items-center justify-center gap-1 mb-1">
                      <Bath className="h-3.5 w-3.5 text-teal-500" /> Bathrooms
                    </div>
                    <span className="text-base font-extrabold text-gray-900">{listing.bathrooms || listing.baths || 'N/A'}</span>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-gray-400 flex items-center justify-center gap-1 mb-1">
                      <Maximize2 className="h-3.5 w-3.5 text-purple-500" /> Square Feet
                    </div>
                    <span className="text-base font-extrabold text-gray-900">{listing.square_feet || listing.sqft ? `${Number(listing.square_feet || listing.sqft).toLocaleString()} sqft` : 'N/A'}</span>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Property Description</h4>
                  <p className="text-sm text-gray-700 leading-relaxed bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                    {listing.description || 'No detailed public remarks provided for this listing.'}
                  </p>
                </div>

                {/* Agent & Listing Details */}
                <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-gold block">Listing Agent Contact</span>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-brand-gold text-brand-navy font-bold flex items-center justify-center">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{listing.agent_name || listing.listing_agent_name || 'Prime America Agent'}</p>
                      <p className="text-xs text-slate-300">{listing.brokerage || 'Prime America Real Estate'}</p>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-800 flex items-center gap-4 text-xs text-slate-300">
                    {listing.agent_phone && (
                      <a href={`tel:${listing.agent_phone}`} className="flex items-center gap-1 hover:text-white">
                        <Phone className="h-3.5 w-3.5 text-brand-gold" /> {listing.agent_phone}
                      </a>
                    )}
                    {listing.agent_email && (
                      <a href={`mailto:${listing.agent_email}`} className="flex items-center gap-1 hover:text-white">
                        <Mail className="h-3.5 w-3.5 text-brand-gold" /> {listing.agent_email}
                      </a>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-gray-400">
                <Building2 className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">Property Listing Data Not Found</p>
                <p className="text-xs text-gray-400 mt-1">Listing ID reference could not be loaded from inventory.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          {listing && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
              <Link
                to={`/inventory/listings/${listing.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-navy hover:text-brand-navy-light"
              >
                Open Full Listing Page <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold transition-colors"
              >
                Close Drawer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
