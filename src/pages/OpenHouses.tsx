import { useState, useEffect, useMemo } from 'react'
import { Layout } from '@/components/layout/Layout'
import { Home, Calendar, Clock, User, ExternalLink, Loader2 } from 'lucide-react'
import { Pagination } from '@/components/common/Pagination'
import clsx from 'clsx'

function formatLocalTime(utcString: string, tz: string) {
  try {
    const d = new Date(utcString)
    return d.toLocaleString('en-US', {
      timeZone: tz || 'America/New_York',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return utcString
  }
}

interface OpenHouseEvent {
  id: string
  title: string
  property_address: string
  agent_name: string
  agent_email: string
  agent_phone?: string
  description?: string
  start_time: string
  end_time: string
  timezone: string
  listing_url?: string
  photo_key?: string
  status: string
  public_token: string
}

export function OpenHousesPage() {
  const [events, setEvents] = useState<OpenHouseEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 9

  const fetchOpenHouses = async () => {
    try {
      const res = await fetch('/api/openhouses')
      const json = await res.json()
      if (json.success && Array.isArray(json.data)) {
        setEvents(json.data)
      }
    } catch (e) {
      console.error('Failed to load open houses', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchOpenHouses()
  }, [])

  const [timeFilter, setTimeFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming')

  const timeFiltered = useMemo(() => {
    const now = new Date()
    return events.filter(e => {
      let isPast = false
      try {
        const endTime = new Date(e.end_time)
        if (endTime < now) isPast = true
      } catch { /* ignore */ }

      if (timeFilter === 'upcoming' && isPast) return false
      if (timeFilter === 'past' && !isPast) return false

      return (
        e.title.toLowerCase().includes(search.toLowerCase()) ||
        e.property_address.toLowerCase().includes(search.toLowerCase()) ||
        e.agent_name.toLowerCase().includes(search.toLowerCase())
      )
    })
  }, [events, search, timeFilter])

  const totalPages = Math.max(1, Math.ceil(timeFiltered.length / PAGE_SIZE))
  const pagedEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return timeFiltered.slice(start, start + PAGE_SIZE)
  }, [timeFiltered, page])

  const stats = useMemo(() => {
    const live = events.filter(e => e.status === 'happening_now').length
    const scheduled = events.filter(e => e.status === 'scheduled' || e.status === 'active').length
    return { live, scheduled, total: events.length }
  }, [events])

  return (
    <Layout title="Open Houses">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <Home className="h-5 w-5 text-pink-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Open Houses</h2>
            <p className="text-sm text-gray-500">Live visitor sign-in sessions and scheduled open houses</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search open houses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-xl px-4 py-2 bg-white w-56 focus:outline-none focus:ring-1 focus:ring-brand-navy"
          />
          <a
            href="https://openhouse.primeamericarealestate.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold shadow-sm transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Create Open House
          </a>
        </div>
      </div>

      {/* Quick Stats & Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-semibold uppercase">Scheduled Events</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.scheduled}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-semibold uppercase">Happening Now (Live)</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{stats.live}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
          <p className="text-xs text-gray-500 font-semibold uppercase">Total Recorded Events</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        {(['upcoming', 'past', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTimeFilter(t)}
            className={clsx(
              "px-4 py-2.5 text-xs font-bold capitalize border-b-2 transition-colors",
              timeFilter === t ? "border-pink-600 text-pink-600" : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {t} Events
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : timeFiltered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 shadow-card">
          <Home className="h-12 w-12 text-gray-300 animate-pulse mb-3" />
          <p className="text-gray-700 font-bold text-base">No open houses found</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm text-center">No open house events match your filter. Create a new event using the Open House Portal.</p>
          <a
            href="https://openhouse.primeamericarealestate.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs shadow-sm transition-colors"
          >
            <ExternalLink className="h-4 w-4" /> Launch Open House Portal
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {pagedEvents.map((event) => {
            const photoUrl = event.photo_key
              ? `https://openhouse.primeamericarealestate.com/api/photo/${encodeURIComponent(event.photo_key)}`
              : null
            return (
              <div key={event.id} className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden flex flex-col">
                {/* Cover Image / Placeholder */}
                {photoUrl ? (
                  <img src={photoUrl} alt={event.title} className="h-48 w-full object-cover" />
                ) : (
                  <div className="h-48 w-full bg-gradient-to-br from-brand-navy to-brand-navy-light flex items-center justify-center">
                    <Home className="h-12 w-12 text-white/20" />
                  </div>
                )}

                {/* Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                        {event.status === 'happening_now' ? 'LIVE NOW' : event.status}
                      </span>
                      {event.status === 'happening_now' ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-700 animate-pulse">
                          Live Now
                        </span>
                      ) : event.status === 'ended' ? (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-600">
                          Ended
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700">
                          Scheduled
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-gray-800 leading-snug mb-1 text-base">{event.title}</h3>
                    <p className="text-xs text-gray-500 mb-4">{event.property_address}</p>

                    {/* Meta info */}
                    <div className="space-y-2 text-xs text-gray-600 mb-6">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>Start: {formatLocalTime(event.start_time, event.timezone)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        <span>End: {formatLocalTime(event.end_time, event.timezone)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-gray-400" />
                        <span>Hosting Agent: {event.agent_name}</span>
                      </div>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
                    <a
                      href={`https://openhouse.primeamericarealestate.com/e/${event.public_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-navy hover:bg-brand-navy-light text-white text-xs font-semibold shadow-sm transition-all"
                    >
                      Sign-In Portal
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={`https://openhouse.primeamericarealestate.com/rsvp/${event.public_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-100 transition-all text-xs font-semibold"
                      title="RSVP for Event"
                    >
                      RSVP
                    </a>
                    {event.listing_url && (
                      <a
                        href={event.listing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 border border-gray-200 transition-colors"
                        title="View Listing Details"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!isLoading && timeFiltered.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={timeFiltered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="border border-gray-100 bg-white rounded-xl px-4 py-3 flex items-center justify-between text-xs text-gray-500"
        />
      )}
    </Layout>
  )
}
