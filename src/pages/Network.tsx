import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Network, Search, UserPlus, Mail, Phone,
  Building2, User2, Loader2, Trash2, Lock, Globe, Send, Check, X, FileText, Pencil, Star, TrendingUp, MapPin, ZoomIn,
  Printer, Eye, Users
} from 'lucide-react'

import { Layout } from '@/components/layout/Layout'
import { NewConnectionModal } from '@/components/network/NewConnectionModal'
import { Pagination } from '@/components/common/Pagination'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import { getClientFacingTitle } from '@/utils/reconciliation'

interface UserTarget {
  id: string
  name: string
  role: string
  email: string
}



const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  broker: { label: 'Broker', color: 'bg-blue-100 text-blue-700' },
  attorney: { label: 'Attorney', color: 'bg-indigo-100 text-indigo-700' },
  inspector: { label: 'Home Inspector', color: 'bg-purple-100 text-purple-700' },
  contractor: { label: 'Contractor', color: 'bg-amber-100 text-amber-700' },
  title: { label: 'Title Agent', color: 'bg-pink-100 text-pink-700' },
  mortgage: { label: 'Mortgage Broker', color: 'bg-sky-100 text-sky-700' },
  colleague: { label: 'Colleague', color: 'bg-gray-100 text-gray-700' },
}

export function NetworkPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [createdByFilter, setCreatedByFilter] = useState<'all' | 'me' | string>('all')
  const [users, setUsers] = useState<UserTarget[]>([])
  const [connections, setConnections] = useState<any[]>([])
  const [referrals, setReferrals] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tab, setTab] = useState<'directory' | 'team' | 'referrals'>('directory')

  interface CustomTeamMember {

    id: string
    roleTitle: string
    connectionId: string
  }

  const [customTeamMembers, setCustomTeamMembers] = useState<CustomTeamMember[]>(() => {
    try {
      const saved = localStorage.getItem(`custom_team_members_v2_${user?.id || 'default'}`)
      if (saved) return JSON.parse(saved)
    } catch {
      // Fallback
    }
    return [
      { id: 'slot-1', roleTitle: 'Real Estate Attorney', connectionId: '' },
      { id: 'slot-2', roleTitle: 'Home Inspector', connectionId: '' },
      { id: 'slot-3', roleTitle: 'Mortgage Lender', connectionId: '' },
      { id: 'slot-4', roleTitle: 'Title & Settlement Agent', connectionId: '' },
      { id: 'slot-5', roleTitle: 'Home Contractor / Stager', connectionId: '' },
      { id: 'slot-6', roleTitle: 'Insurance / Partner', connectionId: '' },
    ]
  })
  const [isTeamPreviewOpen, setIsTeamPreviewOpen] = useState(false)

  const saveTeamMembers = (members: CustomTeamMember[]) => {
    setCustomTeamMembers(members)
    localStorage.setItem(`custom_team_members_v2_${user?.id || 'default'}`, JSON.stringify(members))
  }

  const handleAddTeamMember = () => {
    const newMember: CustomTeamMember = {
      id: `slot-${Date.now()}`,
      roleTitle: 'Preferred Specialist',
      connectionId: ''
    }
    saveTeamMembers([...customTeamMembers, newMember])
  }

  const handleUpdateMember = (id: string, updates: Partial<CustomTeamMember>) => {
    const next = customTeamMembers.map((m) => (m.id === id ? { ...m, ...updates } : m))
    saveTeamMembers(next)
  }

  const handleRemoveMember = (id: string) => {
    const next = customTeamMembers.filter((m) => m.id !== id)
    saveTeamMembers(next)
  }

  const handlePrintTeamPackage = () => {
    const printWindow = window.open('', '_blank', 'width=900,height=1100')
    if (!printWindow) {
      alert('Please allow popups for this site to export the PDF/Print presentation.')
      return
    }

    const itemsHtml = customTeamMembers
      .map((member) => {
        const conn = connections.find((c: any) => c.id === member.connectionId)
        if (!conn) {
          return `
            <div style="border: 1px dashed #cbd5e1; border-radius: 12px; padding: 16px; background: #f8fafc; text-align: center; page-break-inside: avoid;">
              <p style="font-weight: 800; color: #475569; margin: 0 0 4px 0; font-size: 13px;">${member.roleTitle}</p>
              <p style="color: #94a3b8; font-size: 11px; margin: 0;">Specialist pending selection</p>
            </div>
          `
        }
        return `
          <div style="border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px; background: #ffffff; page-break-inside: avoid; box-shadow: 0 1px 3px rgba(0,0,0,0.04); display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="background: rgba(1, 105, 111, 0.1); color: #01696F; font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 3px 10px; border-radius: 999px;">
                  ${member.roleTitle}
                </span>
                ${conn.experience_rating ? `<span style="font-size: 10px; font-weight: bold; color: #b45309; background: #fffbeb; padding: 2px 6px; border-radius: 4px; border: 1px solid #fde68a;">★ ${conn.experience_rating}/5 Rated</span>` : ''}
              </div>
              <h4 style="font-size: 16px; font-weight: 900; color: #0f172a; margin: 0 0 2px 0;">${conn.name}</h4>
              ${conn.company ? `<p style="font-size: 12px; font-weight: 600; color: #334155; margin: 0 0 2px 0;">${conn.company}</p>` : ''}
              ${conn.title ? `<p style="font-size: 12px; color: #64748b; margin: 0;">${conn.title}</p>` : ''}
            </div>
            <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #f1f5f9; font-size: 12px;">
              ${conn.phone ? `<p style="margin: 3px 0; color: #01696F; font-weight: bold;">📞 ${conn.phone}</p>` : ''}
              ${conn.email ? `<p style="margin: 3px 0; color: #2563eb; font-weight: 600;">✉️ ${conn.email}</p>` : ''}
              ${conn.address ? `<p style="margin: 3px 0; color: #64748b; font-size: 11px;">📍 ${conn.address}</p>` : ''}
            </div>
          </div>
        `
      })
      .join('')

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recommended Specialist Team — Prime America Real Estate</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800;900&display=swap');
    * { box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, -apple-system, sans-serif; margin: 0; padding: 36px; color: #0f172a; background: #ffffff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .header { border-bottom: 3px solid #01696F; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .brand { font-size: 10px; font-weight: 900; letter-spacing: 2px; color: #01696F; text-transform: uppercase; background: #f0fdf4; padding: 4px 10px; border-radius: 6px; display: inline-block; margin-bottom: 8px; border: 1px solid #bbf7d0; }
    .title { font-size: 24px; font-weight: 900; color: #01696F; margin: 0; letter-spacing: -0.5px; }
    .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 500; }
    .agent-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 18px; text-align: right; min-width: 220px; }
    .agent-name { font-weight: 800; color: #01696F; font-size: 14px; margin: 0; }
    .agent-title { font-size: 11px; color: #64748b; margin: 2px 0 0 0; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-bottom: 28px; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; font-weight: 500; }
    @media print {
      body { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <span class="brand">PRIME AMERICA REAL ESTATE</span>
      <h1 class="title">Your Recommended Real Estate Specialist Team</h1>
      <p class="subtitle">Official Client Referral Package curated by ${user?.name || 'Your Agent'} for your property transaction.</p>
    </div>
    <div class="agent-card">
      <p class="agent-name">${user?.name || 'Prime America Agent'}</p>
      <p class="agent-title">${getClientFacingTitle(user)}</p>
      ${user?.email ? `<p class="agent-title">${user.email}</p>` : ''}
    </div>
  </div>

  <div class="grid">
    ${itemsHtml}
  </div>

  <div class="footer">
    <span>© ${new Date().getFullYear()} Prime America Real Estate — Verified Vendor Network</span>
    <span>Prepared exclusively for client reference</span>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  }



  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<any | null>(null)
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null)
  const [directoryPage, setDirectoryPage] = useState(1)
  const [referralPage, setReferralPage] = useState(1)
  const DIRECTORY_PAGE_SIZE = 9
  const REFERRAL_PAGE_SIZE = 10
  const [typeConfig, setTypeConfig] = useState<Record<string, { label: string; color: string }>>(TYPE_CONFIG)

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/network')
      const json = await res.json()
      if (json && json.success && Array.isArray(json.data)) setConnections(json.data)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchReferrals = async () => {
    try {
      const res = await fetch('/api/network/referrals')
      const json = await res.json()
      if (json && json.success && Array.isArray(json.data)) setReferrals(json.data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchConnections()
    fetchReferrals()
    async function loadModuleSettings() {
      try {
        const res = await fetch('/api/workspace-settings?key=module_settings')
        const json = await res.json()
        if (json.success && json.data?.value) {
          const settings = typeof json.data.value === 'string' ? JSON.parse(json.data.value) : json.data.value
          const customTypes = settings.network_connection_types || []
          if (customTypes.length > 0) {
            const next: Record<string, { label: string; color: string }> = {}
            const colors = [
              'bg-blue-100 text-blue-700',
              'bg-indigo-100 text-indigo-700',
              'bg-purple-100 text-purple-700',
              'bg-amber-100 text-amber-700',
              'bg-pink-100 text-pink-700',
              'bg-sky-100 text-sky-700',
              'bg-gray-100 text-gray-700',
              'bg-emerald-100 text-emerald-700',
              'bg-teal-100 text-teal-700',
            ]
            customTypes.forEach((t: string, i: number) => {
              const label = t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
              const color = colors[i % colors.length]
              next[t] = { label, color }
            })
            setTypeConfig(next)
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadModuleSettings()
  }, [])

  useEffect(() => {
    if (user) {
      setCreatedByFilter(['admin', 'broker'].includes(user.role) ? 'me' : 'all')
    }
  }, [user])

  useEffect(() => {
    async function loadUsers() {
      if (!['admin', 'broker'].includes(user?.role || '')) {
        setUsers([])
        return
      }
      try {
        const res = await fetch('/api/contacts/tools/users')
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          setUsers(json.data)
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadUsers()
  }, [user])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this connection?')) return
    try {
      await fetch(`/api/network/${id}`, { method: 'DELETE' })
      fetchConnections()
    } catch (e) {
      console.error(e)
    }
  }


  const [handshakeNotice, setHandshakeNotice] = useState<{
    clientName: string
    vendorName: string
    vendorEmail?: string
    vendorPhone?: string
    mailtoUrl: string
    smsUrl: string
  } | null>(null)

  const filtered = useMemo(() => {
    return connections.filter((c) => {
      const q = query.toLowerCase()
      if (q && !c.name.toLowerCase().includes(q) && !(c.title || '').toLowerCase().includes(q) && !(c.company || '').toLowerCase().includes(q)) return false
      if (typeFilter && c.type !== typeFilter) return false
      if (['admin', 'broker'].includes(user?.role || '') && createdByFilter !== 'all') {
        const targetUserId = createdByFilter === 'me' ? user?.id : createdByFilter
        if (targetUserId && c.created_by !== targetUserId) return false
      }
      return true
    })
  }, [connections, query, typeFilter, createdByFilter, user])

  useEffect(() => {
    setDirectoryPage(1)
  }, [query, typeFilter, createdByFilter])




  useEffect(() => {
    if (tab === 'referrals') setReferralPage(1)
  }, [tab])

  const directoryTotalPages = Math.max(1, Math.ceil(filtered.length / DIRECTORY_PAGE_SIZE))
  const pagedConnections = useMemo(() => {
    const start = (directoryPage - 1) * DIRECTORY_PAGE_SIZE
    return filtered.slice(start, start + DIRECTORY_PAGE_SIZE)
  }, [filtered, directoryPage])

  const referralTotalPages = Math.max(1, Math.ceil(referrals.length / REFERRAL_PAGE_SIZE))
  const pagedReferrals = useMemo(() => {
    const start = (referralPage - 1) * REFERRAL_PAGE_SIZE
    return referrals.slice(start, start + REFERRAL_PAGE_SIZE)
  }, [referrals, referralPage])

  const analytics = useMemo(() => {
    const totalConnections = connections.length
    const totalReferrals = referrals.length
    const completedReferrals = referrals.filter((r: any) => r.status === 'completed').length
    const conversionRate = totalReferrals > 0 ? Math.round((completedReferrals / totalReferrals) * 100) : 0

    const ratings = connections
      .map((c: any) => Number(c.experience_rating || 0))
      .filter((n: number) => n > 0)
    const avgRating = ratings.length > 0
      ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10
      : 0

    const typeCounts: Record<string, number> = {}
    connections.forEach((c: any) => {
      typeCounts[c.type] = (typeCounts[c.type] || 0) + 1
    })
    const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'n/a'

    return {
      totalConnections,
      totalReferrals,
      completedReferrals,
      conversionRate,
      avgRating,
      topType,
    }
  }, [connections, referrals])

  if (isLoading) {
    return (
      <Layout title="Network">
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    )
  }

  const handleUpdateReferralStatus = async (id: string, newStatus: string) => {
    try {
      let experience_rating: number | undefined
      let experience_notes: string | undefined

      if (newStatus === 'completed') {
        const ratingInput = prompt('Rate client/customer experience for this referral (1-5):', '5')
        const parsed = Number(ratingInput || '')
        if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 5) {
          experience_rating = parsed
        }
        const notesInput = prompt('Optional experience notes for future business decisions:')
        if (notesInput && notesInput.trim()) {
          experience_notes = notesInput.trim()
        }
      }

      await fetch(`/api/network/referrals/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, experience_rating, experience_notes })
      })
      fetchReferrals()
      fetchConnections()
    } catch (e) {
      console.error(e)
    }
  }


  const handleSendReferral = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedConnection) return
    const formData = new FormData(e.currentTarget)
    const data = Object.fromEntries(formData.entries())
    
    try {
      const res = await fetch('/api/network/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient_connection_id: selectedConnection.id,
          client_name: data.client_name,
          client_email: data.client_email,
          client_phone: data.client_phone,
          referral_type: data.referral_type,
          notes: data.notes
        })
      })
      if (res.ok) {
        setIsReferralModalOpen(false)

        // Build automated referral handshake manual links
        const clientName = String(data.client_name || 'Client')
        const vendorName = selectedConnection.name
        const subject = encodeURIComponent(`Prime America Referral Handshake: ${clientName}`)
        const body = encodeURIComponent(
          `Hello ${vendorName},\n\nI am introducing ${clientName} (${data.client_phone || data.client_email || 'Contact Info attached'}). They are looking for your services.\n\nNotes: ${data.notes || 'None'}\n\nBest regards,\n${user?.name || 'Prime America Agent'}`
        )
        const mailtoUrl = selectedConnection.email ? `mailto:${selectedConnection.email}?subject=${subject}&body=${body}` : '#'
        const smsUrl = selectedConnection.phone ? `sms:${selectedConnection.phone}?body=${encodeURIComponent(`Hi ${vendorName}, referring ${clientName} to you! Details: ${data.notes || ''}`)}` : '#'

        setHandshakeNotice({
          clientName,
          vendorName,
          vendorEmail: selectedConnection.email,
          vendorPhone: selectedConnection.phone,
          mailtoUrl,
          smsUrl,
        })

        setSelectedConnection(null)
        fetchReferrals()
      }
    } catch (e) {
      console.error(e)
    }
  }


  return (
    <Layout title="Network">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Network className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Professional Network</h2>
            <p className="text-sm text-gray-500">Track professional B2B relations, cards, and client referrals</p>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
          <button
            onClick={() => setTab('directory')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === 'directory' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            B2B Directory
          </button>
          <button
            onClick={() => setTab('team')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5',
              tab === 'team' ? 'bg-brand-navy text-brand-gold shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Users className="h-4 w-4 text-brand-gold" />
            Team Builder
          </button>
          <button
            onClick={() => setTab('referrals')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === 'referrals' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Referral Exchange Board
          </button>
        </div>
      </div>

      {tab === 'directory' && (
        <div className="space-y-6">

          {/* Analytics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
              <p className="text-2xl font-bold text-gray-800">{analytics.totalConnections}</p>
              <p className="text-sm text-gray-500">Total Partners</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
              <p className="text-2xl font-bold text-gray-800">{analytics.conversionRate}%</p>
              <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                {referrals.filter((r: any) => r.status === 'closed' || r.status === 'converted').length} of {referrals.length} converted
              </p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
              <p className="text-2xl font-bold text-gray-800">{analytics.avgRating > 0 ? analytics.avgRating : '—'}</p>
              <p className="text-sm text-gray-500">Avg Experience Rating</p>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
              <p className="text-2xl font-bold text-gray-800 capitalize">{analytics.topType === 'n/a' ? '—' : analytics.topType}</p>
              <p className="text-sm text-gray-500">Top Partner Type</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { type: 'broker', label: 'Brokers' },
              { type: 'attorney', label: 'Attorneys' },
              { type: 'inspector', label: 'Inspectors' },
              { type: 'mortgage', label: 'Lenders' },
            ].map((s) => {
              const cfg = typeConfig[s.type] || TYPE_CONFIG[s.type]
              return (
                <div key={s.type} className="bg-white rounded-2xl p-4 shadow-card border border-gray-100">
                  <p className="text-2xl font-bold text-gray-800">
                    {connections.filter((c: any) => c.type === s.type).length}
                  </p>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <span className={`inline-flex mt-2 text-xs rounded-full px-2 py-0.5 font-medium ${cfg?.color || 'bg-gray-100'}`}>
                    {cfg?.label || s.label}
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
                  placeholder="Search network directory…"
                  className="flex-1 text-sm focus:outline-none"
                />
              </div>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white"
              >
                <option value="">All Types</option>
                {Object.entries(typeConfig).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>

              {['admin', 'broker'].includes(user?.role || '') && (
                <select
                  value={createdByFilter}
                  onChange={(e) => setCreatedByFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none bg-white"
                >
                  <option value="me">Created by me</option>
                  <option value="all">All users</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              )}

              <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors">
                <UserPlus className="h-4 w-4" />
                Add Connection
              </button>
            </div>


            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedConnections.map((conn) => {
                const cfg = typeConfig[conn.type] || { label: conn.type.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), color: 'bg-gray-100 text-gray-600' }
              return (
                <div key={conn.id} className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 hover:shadow-card-hover transition-shadow flex flex-col justify-between">
                  <div>
                    <div className="flex items-start gap-4 mb-3">
                      <div
                        className="h-12 w-12 rounded-full bg-brand-navy/10 flex items-center justify-center flex-shrink-0 overflow-hidden cursor-pointer relative group"
                        onClick={() => conn.picture_url && setEnlargedImage(conn.picture_url)}
                        title={conn.picture_url ? 'Click to enlarge' : undefined}
                      >
                        {conn.picture_url ? (
                          <>
                            <img src={conn.picture_url} alt={conn.name} className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                              <ZoomIn className="h-3.5 w-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </>
                        ) : (
                          <User2 className="h-6 w-6 text-brand-navy" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold text-gray-800 truncate">{conn.name}</p>
                          {conn.is_private ? (
                            <span title="Private to creator"><Lock className="h-3.5 w-3.5 text-gray-400" /></span>
                          ) : (
                            <span title="Shared with workspace"><Globe className="h-3.5 w-3.5 text-gray-300" /></span>
                          )}
                        </div>
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

                    {conn.business_card_key && (
                      <div
                        className="mb-4 rounded-xl border border-gray-100 overflow-hidden bg-gray-50 max-h-28 flex items-center justify-center cursor-pointer hover:border-gray-300 transition-colors relative group"
                        onClick={() => setEnlargedImage(conn.business_card_key)}
                        title="Click to enlarge"
                      >
                        <img src={conn.business_card_key} alt="Business Card" className="max-h-24 w-full object-contain" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all flex items-center justify-center">
                          <ZoomIn className="h-4 w-4 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 border-t border-gray-100 pt-3">
                      <a href={`mailto:${conn.email}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-brand-navy transition-colors">
                        <Mail className="h-3.5 w-3.5 text-gray-400" /> {conn.email || 'No email'}
                      </a>
                      {conn.phone && (
                        <a href={`tel:${conn.phone}`} className="flex items-center gap-2 text-xs text-gray-500 hover:text-brand-navy transition-colors">
                          <Phone className="h-3.5 w-3.5 text-gray-400" /> {conn.phone}
                        </a>
                      )}
                      {conn.telephone && conn.telephone !== conn.phone && (
                        <p className="flex items-center gap-2 text-xs text-gray-500">
                          <Phone className="h-3.5 w-3.5 text-gray-400" /> Tel: {conn.telephone}
                        </p>
                      )}
                      {conn.fax && <p className="text-xs text-gray-500">Fax: {conn.fax}</p>}
                      {conn.website && (
                        <a href={conn.website} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">{conn.website}</a>
                      )}
                      {conn.poi && <p className="text-xs text-gray-500">POC: {conn.poi}</p>}
                      {conn.address && (
                        <p className="flex items-center gap-2 text-xs text-gray-500">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" /> {conn.address}
                        </p>
                      )}
                      {Number(conn.experience_rating || 0) > 0 && (
                        <p className="text-xs text-amber-700 font-medium inline-flex items-center gap-1">
                          <Star className="h-3 w-3" /> Experience: {conn.experience_rating}/5
                        </p>
                      )}
                      {(Number(conn.successful_referrals || 0) > 0 || Number(conn.total_referrals || 0) > 0) && (
                        <p className="text-xs text-emerald-700 inline-flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" /> Success: {conn.successful_referrals || 0}/{conn.total_referrals || 0}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setSelectedConnection(conn); setIsReferralModalOpen(true); }}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors bg-blue-50 px-2.5 py-1.5 rounded-lg"
                      >
                        <Send className="h-3 w-3" /> Refer Client
                      </button>
                      <button
                        onClick={() => navigate(`/network/${conn.id}`)}
                        className="text-gray-500 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title="View details"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(conn.id)}
                        className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {filtered.length > 0 && (
            <Pagination
              page={directoryPage}
              totalPages={directoryTotalPages}
              totalItems={filtered.length}
              pageSize={DIRECTORY_PAGE_SIZE}
              onPageChange={setDirectoryPage}
              className="mt-4 border border-gray-100 bg-white rounded-xl px-4 py-3 flex items-center justify-between text-xs text-gray-500"
            />
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 shadow-card">
              <Network className="h-16 w-16 mx-auto mb-4 text-brand-navy opacity-20 animate-pulse" />
              <h3 className="text-lg font-semibold text-gray-800">No connections match search</h3>
              <p className="text-sm text-gray-400 mt-1 max-w-sm mx-auto">Add B2B contacts, attorneys, title agents, and home inspectors to grow your ecosystem.</p>
              <button onClick={() => setIsModalOpen(true)} className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors">
                <UserPlus className="h-4 w-4" />
                Add Connection
              </button>
            </div>
          )}
        </div>
      )}


      {tab === 'team' && (
        <div className="space-y-6">
          {/* Team Builder Banner & Actions */}
          <div className="bg-gradient-to-r from-brand-navy via-brand-navy-light to-blue-950 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-brand-gold/20 text-brand-gold text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-full border border-brand-gold/30">
                  Customizable Client Referral Package
                </span>
                <span className="text-xs text-gray-300 font-medium">Unlimited Specialists</span>
              </div>
              <h3 className="text-xl font-extrabold text-white">Curate Your Custom Preferred Specialist Team</h3>
              <p className="text-xs text-gray-300 max-w-xl mt-1">
                Add as many specialists as you need per category (Attorneys, Inspectors, Lenders, Contractors, etc.). Generate a branded presentation package card for buyers and sellers with single-click PDF export!
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleAddTeamMember}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-bold text-sm px-4 py-2.5 rounded-xl border border-white/20 transition-all"
              >
                <UserPlus className="h-4 w-4 text-brand-gold" /> + Add Specialist Slot
              </button>
              <button
                onClick={() => setIsTeamPreviewOpen(true)}
                className="flex items-center gap-2 bg-brand-gold hover:bg-amber-400 text-brand-navy font-extrabold text-sm px-4 py-2.5 rounded-xl shadow-md transition-all transform hover:scale-[1.02]"
              >
                <Eye className="h-4 w-4" /> Live Client Preview
              </button>
              <button
                onClick={handlePrintTeamPackage}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-md transition-all"
              >
                <Printer className="h-4 w-4 text-white" /> Print / Export PDF
              </button>

            </div>
          </div>

          {/* Dynamic Specialist Selection Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {customTeamMembers.map((member, idx) => {
              const selectedConn = connections.find((c: any) => c.id === member.connectionId)

              return (
                <div key={member.id} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-card hover:shadow-md transition-all relative group">
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100 gap-2">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="h-6 w-6 rounded-full bg-brand-navy/10 text-brand-navy font-bold text-xs flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        value={member.roleTitle}
                        onChange={(e) => handleUpdateMember(member.id, { roleTitle: e.target.value })}
                        placeholder="Role Title (e.g. Closing Attorney)"
                        className="font-extrabold text-gray-900 text-sm border-b border-transparent hover:border-gray-300 focus:border-brand-navy focus:outline-none bg-transparent py-0.5 px-1 rounded w-full"
                      />
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(member.id)}
                      className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                      title="Remove Specialist Slot"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    Select Network Specialist:
                  </label>
                  <select
                    value={member.connectionId}
                    onChange={(e) => handleUpdateMember(member.id, { connectionId: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs font-semibold bg-white text-gray-800 focus:ring-2 focus:ring-brand-navy focus:outline-none mb-3"
                  >
                    <option value="">-- Choose Connection --</option>
                    {connections.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.company ? `(${c.company})` : ''} - {c.title || c.type}
                      </option>
                    ))}
                  </select>

                  {/* Selected Card Details */}
                  {selectedConn ? (
                    <div className="p-3 bg-brand-navy/5 rounded-xl border border-brand-navy/10 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="font-extrabold text-brand-navy text-sm">{selectedConn.name}</p>
                        {selectedConn.experience_rating && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            ★ {selectedConn.experience_rating}/5
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 font-semibold">{selectedConn.title || member.roleTitle}</p>
                      {selectedConn.company && (
                        <p className="text-gray-500 flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-gray-400" /> {selectedConn.company}
                        </p>
                      )}
                      <div className="pt-1.5 flex flex-wrap gap-2 text-[11px]">
                        {selectedConn.phone && (
                          <a href={`tel:${selectedConn.phone}`} className="text-brand-navy font-bold hover:underline flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {selectedConn.phone}
                          </a>
                        )}
                        {selectedConn.email && (
                          <a href={`mailto:${selectedConn.email}`} className="text-blue-600 font-bold hover:underline flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" /> {selectedConn.email}
                          </a>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center text-xs text-gray-400">
                      Slot empty — select a connection above to include in client referral cards.
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleAddTeamMember}
              className="inline-flex items-center gap-2 bg-brand-navy hover:bg-brand-navy-light text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-sm transition-all"
            >
              <UserPlus className="h-4 w-4 text-brand-gold" /> + Add Another Specialist Slot
            </button>
          </div>
        </div>
      )}


      {tab === 'referrals' && (

        /* Referral Exchange Board */
        <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              B2B Client Referrals (Give & Get Clients)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100 text-left bg-gray-50/50">
                  <th className="px-6 py-4">Client Name</th>
                  <th className="px-6 py-4">Referral Type</th>
                  <th className="px-6 py-4">Sender</th>
                  <th className="px-6 py-4">Recipient Professional</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Experience</th>
                  <th className="px-6 py-4">Notes</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedReferrals.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/30 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-800">
                      <p>{r.client_name}</p>
                      <p className="text-xs font-normal text-gray-400">{r.client_email} | {r.client_phone}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        'text-xs font-semibold px-2 py-0.5 rounded-full capitalize',
                        r.referral_type === 'buy' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      )}>
                        {r.referral_type === 'buy' ? 'Buying client' : 'Selling client'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-medium">{r.sender_name}</td>
                    <td className="px-6 py-4 font-medium text-gray-800">
                      <p>{r.connection_name}</p>
                      <span className="text-[10px] uppercase font-bold text-gray-400">{r.connection_type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={clsx(
                        'text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize',
                        r.status === 'pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        r.status === 'accepted' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        r.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                      )}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600">{r.experience_rating ? `${r.experience_rating}/5` : '—'}</td>
                    <td className="px-6 py-4 text-xs text-gray-500 max-w-[200px] truncate" title={r.notes}>{r.notes || 'No notes'}</td>
                    <td className="px-6 py-4 text-right">
                      {r.status === 'pending' && (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => handleUpdateReferralStatus(r.id, 'accepted')}
                            className="bg-blue-600 hover:bg-blue-700 text-white p-1 rounded-lg transition-colors"
                            title="Accept Referral"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleUpdateReferralStatus(r.id, 'rejected')}
                            className="bg-red-50 text-red-600 hover:bg-red-100 p-1 rounded-lg transition-colors"
                            title="Reject Referral"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {r.status === 'accepted' && (
                        <button
                          onClick={() => handleUpdateReferralStatus(r.id, 'completed')}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2 py-1 rounded-lg transition-colors"
                        >
                          Complete Deal
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {referrals.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      No referrals logged. Click "Refer Client" in directory list to send clients B2B!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {referrals.length > 0 && (
            <Pagination
              page={referralPage}
              totalPages={referralTotalPages}
              totalItems={referrals.length}
              pageSize={REFERRAL_PAGE_SIZE}
              onPageChange={setReferralPage}
              className="border-t border-gray-100 px-6 py-3 flex items-center justify-between text-xs text-gray-500"
            />
          )}
        </div>
      )}

      {/* Refer Client Modal */}
      {isReferralModalOpen && selectedConnection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Send B2B Referral</h2>
                <p className="text-xs text-gray-500">To: {selectedConnection.name} ({selectedConnection.type})</p>
              </div>
              <button onClick={() => { setIsReferralModalOpen(false); setSelectedConnection(null); }} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSendReferral} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Client/Customer Name *</label>
                <input required name="client_name" placeholder="Johnathan Miller" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Client Email</label>
                  <input type="email" name="client_email" placeholder="john@email.com" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Client Phone</label>
                  <input type="tel" name="client_phone" placeholder="555-0192" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Referral Type</label>
                <select name="referral_type" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                  <option value="buy">Buying Client (Giving a buyer)</option>
                  <option value="sell">Selling Client (Giving a seller/listing)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes & Deal Details</label>
                <textarea name="notes" placeholder="Client is looking for inspection/contracting work on their new property..." rows={3} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setIsReferralModalOpen(false); setSelectedConnection(null); }} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white">Send Referral</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && (
        <NewConnectionModal 
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false)
            fetchConnections()
          }}
        />
      )}

      {/* Referral Handshake Notice Modal */}
      {handshakeNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200">
            <div className="p-6 bg-emerald-600 text-white text-center">
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 text-white">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="font-extrabold text-xl">Referral Handshake Created</h3>
              <p className="text-xs text-emerald-100 mt-1">Tracked record logged in database</p>
            </div>

            <div className="p-6 space-y-4 text-center">
              <p className="text-sm text-gray-700">
                You referred client <strong>"{handshakeNotice.clientName}"</strong> to vendor <strong>"{handshakeNotice.vendorName}"</strong>.
              </p>

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-600">
                <p className="font-bold text-gray-800 mb-1">Manual Introduction Handshake Triggers:</p>
                <p>Click below to open pre-formatted email or SMS introduction with all client details attached.</p>
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                {handshakeNotice.vendorEmail && (
                  <a
                    href={handshakeNotice.mailtoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand-navy hover:bg-brand-navy-light text-white font-bold text-sm py-2.5 shadow-md transition-colors"
                  >
                    <Mail className="h-4 w-4 text-brand-gold" /> Send Email Introduction
                  </a>
                )}
                {handshakeNotice.vendorPhone && (
                  <a
                    href={handshakeNotice.smsUrl}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm py-2.5 shadow-md transition-colors"
                  >
                    <Phone className="h-4 w-4 text-white" /> Send SMS Introduction
                  </a>
                )}
                <button
                  onClick={() => setHandshakeNotice(null)}
                  className="w-full rounded-xl border border-gray-200 text-gray-700 font-semibold text-sm py-2 hover:bg-gray-50 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Team Client Referral Package Modal & Printable PDF */}
      {isTeamPreviewOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #printable-team-package, #printable-team-package * { visibility: visible !important; }
              #printable-team-package {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 16px !important;
                background: #ffffff !important;
                border: none !important;
                box-shadow: none !important;
              }
              .print-hide { display: none !important; }
              .print-avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
            }
          `}</style>

          <div id="printable-team-package" className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200 my-8 print:shadow-none print:border-none print:w-full print:max-w-none print:my-0">
            {/* Modal Header Actions (Hidden when printing) */}
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between print:hidden print-hide">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-brand-gold" />
                <span className="font-extrabold text-sm tracking-wide">YOUR PREFERRED REAL ESTATE TEAM PACKAGE</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintTeamPackage}
                  className="inline-flex items-center gap-1.5 bg-brand-gold hover:bg-amber-400 text-brand-navy font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all shadow-sm"
                >
                  <Printer className="h-4 w-4" /> Print / Save PDF
                </button>

                <button
                  onClick={() => setIsTeamPreviewOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Printable Referral Card Content */}
            <div className="p-8 space-y-6 print:p-6">
              {/* Agent Branding Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-brand-navy/10 pb-6 print-avoid-break">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-brand-navy text-brand-gold text-[10px] font-extrabold uppercase px-2 py-0.5 rounded tracking-widest">
                      PRIME AMERICA REAL ESTATE
                    </span>
                    <span className="text-xs font-semibold text-gray-500">Official Client Referral Package</span>
                  </div>
                  <h2 className="text-2xl font-black text-brand-navy tracking-tight">Your Recommended Real Estate Specialist Team</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Curated by {user?.name || 'Your Prime America Agent'} for your property transaction.
                  </p>
                </div>

                <div className="p-3 bg-brand-navy/5 rounded-2xl border border-brand-navy/10 text-xs">
                  <p className="font-bold text-brand-navy">{user?.name || 'Prime America Agent'}</p>
                  <p className="text-gray-500 text-[11px]">
                    {getClientFacingTitle(user)}
                  </p>
                  {user?.email && <p className="text-gray-600 font-medium text-[11px]">{user.email}</p>}
                </div>
              </div>

              {/* Dynamic Specialist Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
                {customTeamMembers.map((member) => {
                  const conn = connections.find((c: any) => c.id === member.connectionId)

                  if (!conn) {
                    return (
                      <div key={member.id} className="p-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-center text-xs text-gray-400 print-avoid-break">
                        <p className="font-bold text-gray-500 mb-0.5">{member.roleTitle}</p>
                        <p className="text-[11px]">Specialist pending selection</p>
                      </div>
                    )
                  }

                  return (
                    <div key={member.id} className="p-5 rounded-2xl border border-gray-200 bg-white shadow-xs flex flex-col justify-between space-y-3 print-avoid-break">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="bg-brand-navy/10 text-brand-navy text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                            {member.roleTitle}
                          </span>
                          {conn.experience_rating && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              ★ {conn.experience_rating}/5 Rated
                            </span>
                          )}
                        </div>
                        <h4 className="font-extrabold text-gray-900 text-base">{conn.name}</h4>
                        {conn.company && <p className="text-xs font-semibold text-gray-600">{conn.company}</p>}
                        {conn.title && <p className="text-xs text-gray-500">{conn.title}</p>}
                      </div>

                      <div className="pt-2 border-t border-gray-100 space-y-1 text-xs">
                        {conn.phone && (
                          <a href={`tel:${conn.phone}`} className="flex items-center gap-1.5 text-brand-navy font-bold hover:underline">
                            <Phone className="h-3.5 w-3.5 text-brand-navy flex-shrink-0" /> {conn.phone}
                          </a>
                        )}
                        {conn.email && (
                          <a href={`mailto:${conn.email}`} className="flex items-center gap-1.5 text-blue-600 font-semibold hover:underline truncate">
                            <Mail className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" /> {conn.email}
                          </a>
                        )}
                        {conn.address && (
                          <p className="text-gray-500 text-[11px] flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" /> {conn.address}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Footer Note */}
              <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-400 gap-2 print-avoid-break">
                <p>© {new Date().getFullYear()} Prime America Real Estate — Verified Vendor Network</p>
                <p className="font-medium">Confidential & Prepared exclusively for client reference.</p>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Image Lightbox */}
      {enlargedImage && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            <img src={enlargedImage} alt="Enlarged" className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl object-contain" />
            <button
              onClick={() => setEnlargedImage(null)}
              className="absolute -top-3 -right-3 bg-white rounded-full p-1.5 shadow-lg hover:bg-gray-100 transition-colors"
            >
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
      )}

    </Layout>
  )
}


