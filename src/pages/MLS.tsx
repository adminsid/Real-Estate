import { useState } from 'react'
import {
  Search,
  SlidersHorizontal,
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  ExternalLink,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { StatusBadge } from '@/components/common/Badge'
import { LISTING_STATUSES, NY_BOROUGHS, PROPERTY_TYPES } from '@/utils/constants'
import type { MLSListing } from '@/types'

// ── Mock data ────────────────────────────────────────────────────────────────
const MOCK_LISTINGS: MLSListing[] = [
  {
    id: '1', mlsNumber: 'REBNY-2024-001', address: '125 Park Ave', city: 'Manhattan', state: 'NY', zip: '10017',
    price: 1_250_000, bedrooms: 2, bathrooms: 2, sqft: 1100, status: 'active', type: 'condo',
    description: 'Stunning luxury condo in the heart of Midtown East.',
    listedDate: '2024-05-15',
  },
  {
    id: '2', mlsNumber: 'REBNY-2024-002', address: '45 Ocean Pkwy', city: 'Brooklyn', state: 'NY', zip: '11218',
    price: 875_000, bedrooms: 3, bathrooms: 2, sqft: 1400, status: 'pending', type: 'residential',
    description: 'Beautiful detached home in Kensington, Brooklyn.',
    listedDate: '2024-05-20',
  },
  {
    id: '3', mlsNumber: 'REBNY-2024-003', address: '88-10 Sutphin Blvd', city: 'Jamaica', state: 'NY', zip: '11435',
    price: 620_000, bedrooms: 4, bathrooms: 2, sqft: 1800, status: 'active', type: 'multi-family',
    description: 'Two-family home in Jamaica, Queens — great investment.',
    listedDate: '2024-06-01',
  },
  {
    id: '4', mlsNumber: 'REBNY-2024-004', address: '200 Riverside Dr', city: 'Manhattan', state: 'NY', zip: '10025',
    price: 2_100_000, bedrooms: 3, bathrooms: 3, sqft: 1650, status: 'active', type: 'condo',
    description: 'Pre-war co-op with stunning Hudson River views.',
    listedDate: '2024-06-10',
  },
  {
    id: '5', mlsNumber: 'REBNY-2024-005', address: '503 Court St', city: 'Brooklyn', state: 'NY', zip: '11231',
    price: 1_450_000, bedrooms: 4, bathrooms: 3, sqft: 2200, status: 'sold', type: 'residential',
    description: 'Renovated townhouse in Carroll Gardens.',
    listedDate: '2024-04-01',
  },
]

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function MLSPage() {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [boroughFilter, setBoroughFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const filtered = MOCK_LISTINGS.filter((l) => {
    const q = query.toLowerCase()
    if (q && !l.address.toLowerCase().includes(q) && !l.city.toLowerCase().includes(q) && !l.mlsNumber.toLowerCase().includes(q)) return false
    if (statusFilter && l.status !== statusFilter) return false
    if (boroughFilter && l.city !== boroughFilter) return false
    if (typeFilter && l.type !== typeFilter) return false
    return true
  })

  return (
    <Layout title="MLS Listings">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address, city, MLS#…"
            className="flex-1 text-sm focus:outline-none"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>

        <a
          href="https://inventory.primeamericany.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          Full MLS Portal
        </a>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <option value="">All Statuses</option>
            {LISTING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <select
            value={boroughFilter}
            onChange={(e) => setBoroughFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <option value="">All Boroughs</option>
            {NY_BOROUGHS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <option value="">All Property Types</option>
            {PROPERTY_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      )}

      {/* Results */}
      <p className="text-sm text-gray-500 mb-3">{filtered.length} listing{filtered.length !== 1 ? 's' : ''} found</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((listing) => (
          <div key={listing.id} className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden hover:shadow-card-hover transition-shadow">
            {/* Placeholder image area */}
            <div
              className="h-36 flex items-center justify-center text-white text-xs font-medium"
              style={{ background: `linear-gradient(135deg, #0F2040 0%, #1B3A6B 100%)` }}
            >
              <div className="text-center">
                <p className="font-bold text-brand-gold text-lg">{listing.mlsNumber}</p>
                <p className="text-white/50 text-xs mt-1">No photo available</p>
              </div>
            </div>

            <div className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-bold text-gray-800 text-lg">{fmt(listing.price)}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3" />
                    {listing.address}, {listing.city}, {listing.state} {listing.zip}
                  </p>
                </div>
                <StatusBadge status={listing.status === 'active' ? 'active' : listing.status === 'pending' ? 'under_construction' : 'external'} />
              </div>

              {listing.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{listing.description}</p>
              )}

              <div className="flex items-center gap-4 text-sm text-gray-600 border-t border-gray-100 pt-3">
                <span className="flex items-center gap-1">
                  <BedDouble className="h-3.5 w-3.5 text-gray-400" />
                  {listing.bedrooms} bd
                </span>
                <span className="flex items-center gap-1">
                  <Bath className="h-3.5 w-3.5 text-gray-400" />
                  {listing.bathrooms} ba
                </span>
                <span className="flex items-center gap-1">
                  <Maximize2 className="h-3.5 w-3.5 text-gray-400" />
                  {listing.sqft.toLocaleString()} sf
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium">No listings match your search.</p>
          <p className="text-sm mt-1">Try adjusting your filters.</p>
        </div>
      )}
    </Layout>
  )
}
