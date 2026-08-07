import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  SlidersHorizontal,
  MapPin,
  BedDouble,
  Bath,
  Maximize2,
  Building2,
  Phone,
  Mail,
  Grid,
  Table,
  Edit3,
  Clock,
  ChevronRight
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { Pagination } from '@/components/common/Pagination'
import { SkeletonTable } from '@/components/common/SkeletonLoader'
import { LISTING_STATUSES, PROPERTY_TYPES } from '@/utils/constants'
import { useAuth } from '@/context/AuthContext'
import type { MLSListing } from '@/types'
import clsx from 'clsx'

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(Number(n))) return 'N/A'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function isResidentialListing(listing: MLSListing | any) {
  const type = String(listing.type || listing.propertyType || '').toLowerCase()
  return ['residential', 'condo', 'co-op', 'multi-family'].some((t) => type.includes(t))
}

function getListingAgent(listing: MLSListing | any) {
  const pick = (...vals: Array<string | null | undefined>) => vals.find((v) => v && String(v).trim()) || ''
  return {
    name: pick(listing.listing_agent_name, listing.listingAgentName, listing.listAgentName, listing.agent_name),
    email: pick(listing.listing_agent_email, listing.listingAgentEmail, listing.listAgentEmail, listing.agent_email),
    phone: pick(listing.listing_agent_phone, listing.listingAgentPhone, listing.listAgentPhone, listing.agent_phone),
    brokerage: pick(listing.listing_agent_brokerage, listing.listingAgentBrokerage, listing.listOfficeName, listing.brokerage_name),
  }
}

function getDaysOnMarket(listing: any) {
  const dateStr = listing.listingDate || listing.listing_date || listing.listDate || listing.createdAt || listing.created_at
  if (!dateStr) return null
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(0, days)
}

function ListingStatusBadge({ status }: { status: string }) {
  const s = (status || 'active').toLowerCase()
  let classes = 'bg-gray-100 text-gray-700 border-gray-200'
  let label = status || 'Active'

  if (s === 'active') {
    classes = 'bg-emerald-100 text-emerald-700 border-emerald-200'
    label = 'Active'
  } else if (s === 'pending') {
    classes = 'bg-amber-100 text-amber-700 border-amber-200'
    label = 'Pending'
  } else if (s === 'sold') {
    classes = 'bg-blue-100 text-blue-700 border-blue-200'
    label = 'Sold'
  } else if (s === 'rented') {
    classes = 'bg-indigo-100 text-indigo-700 border-indigo-200'
    label = 'Rented'
  } else if (s === 'expired') {
    classes = 'bg-red-100 text-red-700 border-red-200'
    label = 'Expired'
  } else if (s === 'withdrawn') {
    classes = 'bg-gray-100 text-gray-700 border-gray-200'
    label = 'Withdrawn'
  } else {
    label = s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border", classes)}>
      {label}
    </span>
  )
}

import { PlusCircle } from 'lucide-react'

// Inside MLSPage:
export function MLSPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [page, setPage] = useState(1)


  const [listings, setListings] = useState<MLSListing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [pageSize, setPageSize] = useState(25)

  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)

  const handleApproveListing = async (id: string) => {
    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: 'active', status: 'active' }),
      })
      const json = await res.json()
      if (json.success) {
        fetchListings()
      }
    } catch (e) {
      console.error('Failed to approve listing', e)
    }
  }


  const fetchListings = async () => {
    try {
      const res = await fetch('/api/listings')
      const json = await res.json()
      if (Array.isArray(json)) setListings(json)
      else if (json.listings && Array.isArray(json.listings)) setListings(json.listings)
      else if (json.data && Array.isArray(json.data)) setListings(json.data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchListings() }, [])

  const filtered = useMemo(() => {
    return listings.filter((l: any) => {
      const q = query.toLowerCase()
      if (q && !l.address.toLowerCase().includes(q) && !l.city.toLowerCase().includes(q) && !(l.mlsNumber || '').toLowerCase().includes(q)) return false
      if (statusFilter && l.status !== statusFilter) return false
      if (typeFilter) {
        const propType = String(l.propertyType || l.type || '').toLowerCase()
        if (typeFilter === 'condo') {
          if (!propType.includes('condo') && !propType.includes('co-op') && !propType.includes('coop')) return false
        } else if (typeFilter === 'residential') {
          if (!propType.includes('residential') && !propType.includes('single family') && !propType.includes('house')) return false
        } else {
          if (!propType.includes(typeFilter.toLowerCase())) return false
        }
      }
      return true
    })
  }, [listings, query, statusFilter, typeFilter])



  const [sortBy, setSortBy] = useState<'price_asc' | 'price_desc' | 'newest' | 'oldest'>('newest')

  const sortedListings = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      if (sortBy === 'price_asc') return (a.price || 0) - (b.price || 0)
      if (sortBy === 'price_desc') return (b.price || 0) - (a.price || 0)
      const dateA = new Date(a.createdAt || a.created_at || 0).getTime()
      const dateB = new Date(b.createdAt || b.created_at || 0).getTime()
      if (sortBy === 'oldest') return dateA - dateB
      return dateB - dateA
    })
  }, [filtered, sortBy])

  useEffect(() => {
    setPage(1)
  }, [query, statusFilter, typeFilter, pageSize, sortBy])

  const totalPages = Math.max(1, Math.ceil(sortedListings.length / pageSize))
  const pagedListings = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedListings.slice(start, start + pageSize)
  }, [sortedListings, page, pageSize])

  const QUICK_STATUS_PILLS = [
    { label: 'All', value: '' },
    { label: 'Active', value: 'active' },
    { label: 'Pending', value: 'pending' },
    { label: 'Sold', value: 'sold' },
    { label: 'Rented', value: 'rented' },
  ]

  return (
    <Layout title="Listings">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by address, city, MLS#…"
            className="flex-1 text-sm focus:outline-none"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            title="Grid View"
            className={clsx(
              "p-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5",
              viewMode === 'grid' ? "bg-brand-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            <Grid className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Grid</span>
          </button>
          <button
            onClick={() => setViewMode('table')}
            title="Table View"
            className={clsx(
              "p-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5",
              viewMode === 'table' ? "bg-brand-navy text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"
            )}
          >
            <Table className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">Table</span>
          </button>
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:outline-none text-gray-700 shadow-sm"
        >
          <option value="newest">Sort: Newest Listed</option>
          <option value="oldest">Sort: Oldest Listed</option>
          <option value="price_asc">Sort: Price Low to High</option>
          <option value="price_desc">Sort: Price High to Low</option>
        </select>

        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none shadow-sm"
        >
          <option value={12}>12 per page</option>
          <option value={25}>25 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
        </select>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-colors shadow-sm ${
            showFilters ? 'bg-brand-navy text-white border-brand-navy' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
        </button>

        <button
          onClick={() => {
            window.location.href = 'https://listing-input.lama-4db.workers.dev'
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy hover:bg-brand-navy-light text-white text-sm font-bold shadow-md transition-colors"
        >
          <PlusCircle className="h-4 w-4 text-brand-gold" />
          Create Listing Draft (Inventory Admin)
        </button>
      </div>




      {/* Quick Status Filter Pills */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1 flex-shrink-0">Status:</span>
        {QUICK_STATUS_PILLS.map((pill) => {
          const isActive = statusFilter === pill.value
          return (
            <button
              key={pill.value}
              onClick={() => setStatusFilter(pill.value)}
              className={clsx(
                "px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs flex-shrink-0 border",
                isActive
                  ? "bg-brand-navy text-white border-brand-navy shadow-sm"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              {pill.label}
            </button>
          )
        })}
      </div>

      {isLoading ? (
        <div className="py-6">
          <SkeletonTable rows={7} cols={5} />
        </div>
      ) : (
        <>
          {/* Detailed Filters Dropdown */}
          {showFilters && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in shadow-sm">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <option value="">All Statuses</option>
                {LISTING_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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

          {/* Results count */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500 font-semibold">{filtered.length} listing{filtered.length !== 1 ? 's' : ''} found</p>
          </div>

          {/* Grid View */}
          {viewMode === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {pagedListings.map((listing) => {
                const residential = isResidentialListing(listing)
                const agent = getListingAgent(listing)
                const dom = getDaysOnMarket(listing)

                return (
                  <div
                    key={listing.id}
                    onClick={() => navigate(`/inventory/listings/${listing.id}`)}
                    className="group cursor-pointer bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden hover:shadow-card-hover transition-all flex flex-col justify-between relative"
                  >
                    {/* Image header area */}
                    <div className="h-40 w-full relative overflow-hidden bg-gray-100 border-b border-gray-100 flex-shrink-0 flex items-center justify-center">
                      {listing.heroMediaUrl ? (
                        <img
                          src={
                            listing.heroMediaUrl.startsWith('http')
                              ? listing.heroMediaUrl
                              : `https://inventory.primeamericarealestate.com${listing.heroMediaUrl}`
                          }
                          alt={listing.address}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div
                          className="h-full w-full flex items-center justify-center text-white text-xs font-medium"
                          style={{ background: `linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-primary-light) 100%)` }}
                        >
                          <div className="text-center">
                            <p className="font-bold text-brand-gold text-lg">{listing.mlsNumber}</p>
                            <p className="text-white/50 text-xs mt-1">No photo available</p>
                          </div>
                        </div>
                      )}

                      {/* Top Badges overlay */}
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                        <ListingStatusBadge status={listing.status} />
                        {dom !== null && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-black/60 text-white backdrop-blur-md shadow-sm">
                            <Clock className="h-3 w-3 text-amber-400" />
                            {dom}d on market
                          </span>
                        )}
                      </div>

                      {/* Admin/Broker Edit Shortcut Button on Hover */}
                      {isBrokerOrAdmin && (
                        <a
                          href={`https://inventory.primeamericarealestate.com/listings/${listing.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="absolute bottom-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 text-gray-800 hover:text-blue-600 px-2.5 py-1 rounded-lg text-xs font-bold shadow-md border border-gray-200 flex items-center gap-1 backdrop-blur-sm"
                          title="Open in Inventory Admin"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit in Admin
                        </a>
                      )}
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <p className="font-extrabold text-gray-900 text-xl tracking-tight">{fmt(listing.price)}</p>
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 line-clamp-1 font-medium">
                              <MapPin className="h-3 w-3 text-gray-400 flex-shrink-0" />
                              {listing.address}, {listing.city}, {listing.state} {listing.zip}
                            </p>
                          </div>
                        </div>

                        {residential ? (
                          <div className="flex items-center gap-4 text-xs font-semibold text-gray-600 border-t border-gray-100 pt-2.5 mt-2.5">
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
                              {listing.sqft ? listing.sqft.toLocaleString() : '—'} sf
                            </span>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 border-t border-gray-100 pt-2.5 mt-2.5">
                            <div className="rounded-lg bg-gray-50 px-2 py-1 text-center">
                              <p className="text-[9px] text-gray-400 uppercase">Type</p>
                              <p className="font-semibold truncate capitalize">{listing.type || (listing as any).propertyType || 'Commercial'}</p>
                            </div>
                            <div className="rounded-lg bg-gray-50 px-2 py-1 text-center">
                              <p className="text-[9px] text-gray-400 uppercase">Subtype</p>
                              <p className="font-semibold truncate capitalize">{(listing as any).propertySubtype || 'General'}</p>
                            </div>
                            <div className="rounded-lg bg-gray-50 px-2 py-1 text-center">
                              <p className="text-[9px] text-gray-400 uppercase">Size</p>
                              <p className="font-semibold">{listing.sqft ? `${listing.sqft.toLocaleString()} sf` : '—'}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Inline Agent Avatar + Popover Tooltip on Hover */}
                      <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                        <div className="relative group/agent flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center font-bold text-[10px]">
                            {(agent.name || 'A')[0].toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-700 truncate max-w-[140px] group-hover/agent:text-blue-600">
                            {agent.name || 'Listing Agent'}
                          </span>

                          {/* Hover Popover Tooltip */}
                          <div className="absolute bottom-full left-0 mb-2 hidden group-hover/agent:block z-30 w-56 p-3 bg-white rounded-xl shadow-xl border border-gray-200 text-xs text-gray-700 pointer-events-none">
                            <p className="font-bold text-gray-900">{agent.name || 'Listing Agent'}</p>
                            {agent.brokerage && (
                              <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
                                <Building2 className="h-3 w-3 text-gray-400" />
                                {agent.brokerage}
                              </p>
                            )}
                            {agent.phone && (
                              <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-1">
                                <Phone className="h-3 w-3 text-blue-500" />
                                {agent.phone}
                              </p>
                            )}
                            {agent.email && (
                              <p className="text-[11px] text-gray-600 mt-0.5 flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3 text-blue-500" />
                                {agent.email}
                              </p>
                            )}
                          </div>
                        </div>

                        <span className="text-[11px] text-blue-600 font-semibold group-hover:translate-x-0.5 transition-transform flex items-center">
                          Details <ChevronRight className="h-3 w-3" />
                        </span>
                      </div>

                      {/* Inventory Admin Approve Action Button */}
                      {isBrokerOrAdmin && listing.approval_status === 'pending_approval' && (
                        <div className="mt-3 pt-2 border-t border-amber-200">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleApproveListing(listing.id)
                            }}
                            className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                          >
                            ✓ Approve & Publish Live to MLS
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                )
              })}
            </div>
          )}

          {/* Compact Table View */}
          {viewMode === 'table' && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/70 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Property Address</th>
                    <th className="py-3 px-4">Price</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Specs</th>
                    <th className="py-3 px-4">DOM</th>
                    <th className="py-3 px-4">Listing Agent</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {pagedListings.map((listing) => {
                    const agent = getListingAgent(listing)
                    const dom = getDaysOnMarket(listing)
                    return (
                      <tr
                        key={listing.id}
                        onClick={() => navigate(`/inventory/listings/${listing.id}`)}
                        className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {listing.heroMediaUrl ? (
                              <img
                                src={listing.heroMediaUrl.startsWith('http') ? listing.heroMediaUrl : `https://inventory.primeamericarealestate.com${listing.heroMediaUrl}`}
                                alt=""
                                className="h-10 w-12 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0">
                                No Pic
                              </div>
                            )}
                            <div>
                              <p className="font-bold text-gray-900 hover:text-blue-600">{listing.address}</p>
                              <p className="text-[11px] text-gray-500">{listing.city}, {listing.state} {listing.zip}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-extrabold text-gray-900 text-sm">
                          {fmt(listing.price)}
                        </td>
                        <td className="py-3 px-4">
                          <ListingStatusBadge status={listing.status} />
                        </td>
                        <td className="py-3 px-4 text-gray-600 font-medium">
                          {listing.bedrooms || listing.bathrooms ? (
                            <span>{listing.bedrooms || 0}bd | {listing.bathrooms || 0}ba {listing.sqft ? `| ${listing.sqft.toLocaleString()}sf` : ''}</span>
                          ) : (
                            <span className="capitalize">{listing.type || 'Commercial'}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold text-gray-700">
                          {dom !== null ? `${dom} days` : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="relative group/agent inline-flex items-center gap-1.5 cursor-help">
                            <div className="h-5 w-5 rounded-full bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center font-bold text-[9px]">
                              {(agent.name || 'A')[0].toUpperCase()}
                            </div>
                            <span className="font-medium text-gray-800">{agent.name || 'Agent'}</span>

                            {/* Hover Popover Tooltip */}
                            <div className="absolute bottom-full left-0 mb-2 hidden group-hover/agent:block z-30 w-52 p-3 bg-white rounded-xl shadow-xl border border-gray-200 text-xs text-gray-700 pointer-events-none">
                              <p className="font-bold text-gray-900">{agent.name || 'Listing Agent'}</p>
                              {agent.brokerage && <p className="text-[10px] text-gray-500 mt-0.5">{agent.brokerage}</p>}
                              {agent.phone && <p className="text-[11px] text-gray-600 mt-1">📞 {agent.phone}</p>}
                              {agent.email && <p className="text-[11px] text-gray-600 mt-0.5 truncate">✉️ {agent.email}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/inventory/listings/${listing.id}`)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                            >
                              View
                            </button>
                            {isBrokerOrAdmin && (
                              <a
                                href={`https://inventory.primeamericarealestate.com/listings/${listing.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center gap-1"
                                title="Edit in Inventory Admin"
                              >
                                <Edit3 className="h-3 w-3" /> Edit
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-medium">No listings match your search.</p>
              <p className="text-sm mt-1">Try adjusting your filters.</p>
            </div>
          )}

          {filtered.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setPage}
              className="mt-4 border border-gray-100 bg-white rounded-xl px-4 py-3 flex items-center justify-between text-xs text-gray-500"
            />
          )}
        </>
      )}
    </Layout>
  )
}
