import { useState } from 'react'
import {
  TrendingUp,
  Search,
  Plus,
  Mail,
  Phone,
  MoreHorizontal,
  User2,
  Filter,
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import type { CRMContact } from '@/types'

const MOCK_CONTACTS: CRMContact[] = [
  { id: '1', firstName: 'Maria', lastName: 'Garcia', email: 'maria@example.com', phone: '(212) 555-0101', type: 'buyer', status: 'active', source: 'Website', createdAt: '2024-05-01', updatedAt: '2024-06-01' },
  { id: '2', firstName: 'James', lastName: 'Wilson', email: 'jwilson@example.com', phone: '(718) 555-0202', type: 'seller', status: 'prospect', source: 'Referral', createdAt: '2024-05-15', updatedAt: '2024-05-15' },
  { id: '3', firstName: 'Priya', lastName: 'Patel', email: 'priya.p@example.com', phone: '(347) 555-0303', type: 'both', status: 'active', source: 'Open House', createdAt: '2024-06-01', updatedAt: '2024-06-05' },
  { id: '4', firstName: 'Robert', lastName: 'Chen', email: 'rchen@example.com', type: 'buyer', status: 'closed', source: 'MLS', createdAt: '2024-01-01', updatedAt: '2024-03-15' },
  { id: '5', firstName: 'Angela', lastName: 'Davis', email: 'angela.d@example.com', phone: '(516) 555-0505', type: 'vendor', status: 'active', source: 'Networking', createdAt: '2024-04-20', updatedAt: '2024-06-10' },
]

const STATUS_COLORS: Record<CRMContact['status'], string> = {
  active: 'bg-emerald-100 text-emerald-700',
  prospect: 'bg-sky-100 text-sky-700',
  closed: 'bg-gray-100 text-gray-600',
  inactive: 'bg-red-100 text-red-600',
}

const TYPE_LABELS: Record<CRMContact['type'], string> = {
  buyer: 'Buyer',
  seller: 'Seller',
  both: 'Buyer/Seller',
  referral: 'Referral',
  vendor: 'Vendor',
  other: 'Other',
}

export function CRMPage() {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)

  const filtered = MOCK_CONTACTS.filter((c) => {
    const full = `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase()
    if (query && !full.includes(query.toLowerCase())) return false
    if (statusFilter && c.status !== statusFilter) return false
    return true
  })

  return (
    <Layout title="CRM — Contacts">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Contacts', value: MOCK_CONTACTS.length, color: '#3B82F6' },
          { label: 'Active', value: MOCK_CONTACTS.filter((c) => c.status === 'active').length, color: '#10B981' },
          { label: 'Prospects', value: MOCK_CONTACTS.filter((c) => c.status === 'prospect').length, color: '#F59E0B' },
          { label: 'Closed', value: MOCK_CONTACTS.filter((c) => c.status === 'closed').length, color: '#8B5CF6' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
            <p className="text-2xl font-bold text-gray-800">{stat.value}</p>
            <p className="text-sm text-gray-500">{stat.label}</p>
            <div className="h-1 w-12 rounded-full mt-2" style={{ backgroundColor: stat.color }} />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts…"
            className="flex-1 text-sm focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-sm focus:outline-none bg-transparent"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="prospect">Prospect</option>
            <option value="closed">Closed</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Contact
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0">
                        <User2 className="h-4 w-4 text-brand-navy" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{contact.firstName} {contact.lastName}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-navy transition-colors">
                            <Mail className="h-3 w-3" /> {contact.email}
                          </a>
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-gray-400 hover:text-brand-navy transition-colors">
                              <Phone className="h-3 w-3" /> {contact.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 hidden md:table-cell">
                    <span className="text-gray-600 capitalize">{TYPE_LABELS[contact.type]}</span>
                  </td>
                  <td className="px-4 py-4 hidden sm:table-cell">
                    <span className="text-gray-500 text-xs">{contact.source ?? '—'}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[contact.status]}`}>
                      {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                      <MoreHorizontal className="h-4 w-4 text-gray-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No contacts found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Contact modal (simplified) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Add New Contact</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="First Name" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
                <input placeholder="Last Name" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
              </div>
              <input type="email" placeholder="Email" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
              <input type="tel" placeholder="Phone" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" />
              <select className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white">
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="both">Buyer / Seller</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={() => setShowModal(false)} className="flex-1 rounded-xl bg-brand-navy text-white py-2.5 text-sm font-semibold hover:bg-brand-navy-light transition-colors">Save Contact</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
