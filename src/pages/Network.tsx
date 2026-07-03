import { useState } from 'react'
import {
  Network,
  Search,
  UserPlus,
  Mail,
  Phone,
  Building2,
  User2,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import type { NetworkConnection } from '@/types'

const MOCK_CONNECTIONS: NetworkConnection[] = [
  { id: '1', userId: 'u1', name: 'David Reyes', title: 'Licensed Broker', company: 'Metro Realty Group', email: 'dreyes@metrorealty.com', phone: '(212) 555-0011', type: 'broker', connectedAt: '2024-01-15' },
  { id: '2', userId: 'u2', name: 'Sandra Kim', title: 'Real Estate Attorney', company: 'Kim & Associates', email: 's.kim@kimlaw.com', phone: '(718) 555-0022', type: 'expert', connectedAt: '2024-02-20' },
  { id: '3', userId: 'u3', name: 'Marcus Thompson', title: 'Mortgage Advisor', company: 'Empire Lending', email: 'm.thompson@empirelend.com', phone: '(917) 555-0033', type: 'vendor', connectedAt: '2024-03-05' },
  { id: '4', userId: 'u4', name: 'Fatima Al-Hassan', title: 'Licensed Salesperson', email: 'fatima@example.com', type: 'licensed_professional', connectedAt: '2024-04-12' },
  { id: '5', userId: 'u5', name: 'Carlos Rivera', title: 'Home Inspector', company: 'Precision Inspections', email: 'c.rivera@precisionhome.com', phone: '(347) 555-0055', type: 'vendor', connectedAt: '2024-05-01' },
  { id: '6', userId: 'u6', name: 'Grace Park', title: 'Property Manager', company: 'UES Properties LLC', email: 'gpark@uesprops.com', phone: '(646) 555-0066', type: 'partner', connectedAt: '2024-05-18' },
]

const TYPE_CONFIG: Record<NetworkConnection['type'], { label: string; color: string }> = {
  broker: { label: 'Broker', color: 'bg-blue-100 text-blue-700' },
  licensed_professional: { label: 'Licensed Pro', color: 'bg-emerald-100 text-emerald-700' },
  expert: { label: 'Expert', color: 'bg-purple-100 text-purple-700' },
  vendor: { label: 'Vendor', color: 'bg-amber-100 text-amber-700' },
  partner: { label: 'Partner', color: 'bg-pink-100 text-pink-700' },
  colleague: { label: 'Colleague', color: 'bg-sky-100 text-sky-700' },
  assistant: { label: 'Assistant', color: 'bg-gray-100 text-gray-700' },
}

export function NetworkPage() {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const filtered = MOCK_CONNECTIONS.filter((c) => {
    const q = query.toLowerCase()
    if (q && !c.name.toLowerCase().includes(q) && !c.title.toLowerCase().includes(q) && !(c.company ?? '').toLowerCase().includes(q)) return false
    if (typeFilter && c.type !== typeFilter) return false
    return true
  })

  return (
    <Layout title="Network">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Network className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Your Professional Network</h2>
          <p className="text-sm text-gray-500">Connect with brokers, experts, vendors, partners, and colleagues</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { type: 'broker', label: 'Brokers' },
          { type: 'expert', label: 'Experts' },
          { type: 'vendor', label: 'Vendors' },
          { type: 'partner', label: 'Partners' },
        ].map((s) => {
          const cfg = TYPE_CONFIG[s.type as NetworkConnection['type']]
          return (
            <div key={s.type} className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
              <p className="text-2xl font-bold text-gray-800">
                {MOCK_CONNECTIONS.filter((c) => c.type === s.type).length}
              </p>
              <p className="text-sm text-gray-500">{s.label}</p>
              <span className={`inline-flex mt-2 text-xs rounded-full px-2 py-0.5 font-medium ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search network…"
            className="flex-1 text-sm focus:outline-none"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none"
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors">
          <UserPlus className="h-4 w-4" />
          Add Connection
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((conn) => {
          const cfg = TYPE_CONFIG[conn.type]
          return (
            <div key={conn.id} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 hover:shadow-card-hover transition-shadow">
              <div className="flex items-start gap-4 mb-3">
                <div className="h-12 w-12 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                  <User2 className="h-6 w-6 text-brand-navy" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{conn.name}</p>
                  <p className="text-xs text-gray-500 truncate">{conn.title}</p>
                  {conn.company && (
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                      <Building2 className="h-3 w-3" /> {conn.company}
                    </p>
                  )}
                </div>
                <span className={`flex-shrink-0 text-xs font-medium rounded-full px-2 py-0.5 ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>

              <div className="space-y-1.5 border-t border-gray-100 pt-3">
                <a href={`mailto:${conn.email}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-brand-navy transition-colors">
                  <Mail className="h-3.5 w-3.5 text-gray-400" /> {conn.email}
                </a>
                {conn.phone && (
                  <a href={`tel:${conn.phone}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-brand-navy transition-colors">
                    <Phone className="h-3.5 w-3.5 text-gray-400" /> {conn.phone}
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No connections found.</p>
        </div>
      )}
    </Layout>
  )
}
