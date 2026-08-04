import { useState, useEffect, useCallback } from 'react'
import {
  Users, CheckCircle2, Circle, AlertCircle, AlertTriangle,
  Briefcase, Key, Trash2, UserPlus, Mail, Loader2, Clock,
  RefreshCw, Edit3, Save, X, Shield
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import { Layout } from '@/components/layout/Layout'

interface Invitation {
  id: string
  email: string
  name: string | null
  role: string
  invited_by_name: string
  expires_at: string
  created_at: string
}

interface HRUser {
  id: string
  name: string
  email: string
  role: string
  title?: string
  phone?: string
  license_number?: string
  license_state?: string
  license_expiration_date?: string
  is_active: number
  email_verified: number
  last_login_at: string | null
  created_at: string
}

const ONBOARDING_STEPS = [
  { id: 'ica', label: 'Sign Independent Contractor Agreement (ICA)' },
  { id: 'background', label: 'Complete background screening' },
  { id: 'license', label: 'Submit real estate license details' },
  { id: 'email', label: 'Set up corporate email & Google Workspace' },
  { id: 'mls', label: 'Verify MLS IDs & lockbox credentials' }
]

const OFFBOARDING_STEPS = [
  { id: 'revoke', label: 'Revoke corporate email & workspace access' },
  { id: 'crm', label: 'Handover active CRM clients' },
  { id: 'license_term', label: 'Notify DOS of license termination' },
  { id: 'termination_agreement', label: 'Sign mutual termination agreement' },
  { id: 'keys', label: 'Return lockboxes & office keys' }
]

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Request failed')
  return data.data
}

export function HRPage() {
  const { user, branding, refreshUser } = useAuth()
  const [users, setUsers] = useState<HRUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<HRUser | null>(null)
  const [tab, setTab] = useState<'agents' | 'invitations' | 'commission'>('agents')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('salesperson')
  const [isInviting, setIsInviting] = useState(false)

  // Roster Sync states
  const [isSyncingRoster, setIsSyncingRoster] = useState(false)
  const [syncDiff, setSyncDiff] = useState<any | null>(null)

  // Agent Setup / Index Modal states
  const [agentModalTab, setAgentModalTab] = useState<'profile' | 'onboarding' | 'offboarding' | 'access'>('profile')
  const [agentForm, setAgentForm] = useState<{
    name: string
    email: string
    phone: string
    title: string
    role: string
    licenseNumber: string
    licenseState: string
    licenseExpirationDate: string
  }>({
    name: '',
    email: '',
    phone: '',
    title: '',
    role: 'salesperson',
    licenseNumber: '',
    licenseState: 'NY',
    licenseExpirationDate: '',
  })
  const [isSavingAgentForm, setIsSavingAgentForm] = useState(false)

  // Manual Creation Modal states
  const [isManualModalOpen, setIsManualModalOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualRole, setManualRole] = useState('salesperson')
  const [manualLicense, setManualLicense] = useState('')
  const [manualSendEmail, setManualSendEmail] = useState(true)
  const [isManualSubmitting, setIsManualSubmitting] = useState(false)
  
  // Checklist states stored in local storage
  const [checklists, setChecklists] = useState<Record<string, Record<string, boolean>>>({})

  // Commission split config per agent
  interface CommissionSplit {
    agentId: string
    splitType: 'percent' | 'flat'
    agentPercent: number
    flatFeePerDeal: number
  }
  const [commissionSplits, setCommissionSplits] = useState<Record<string, CommissionSplit>>({})
  const [commissionEditAgent, setCommissionEditAgent] = useState<string | null>(null)
  const [splitDraft, setSplitDraft] = useState<Omit<CommissionSplit, 'agentId'>>({ splitType: 'percent', agentPercent: 70, flatFeePerDeal: 500 })

  // 1099 Generator state
  const [report1099Agent, setReport1099Agent] = useState<string>('')
  const [report1099Year, setReport1099Year] = useState<number>(new Date().getFullYear())
  const [report1099Data, setReport1099Data] = useState<{ transactions: any[]; total: number; agentShare: number } | null>(null)
  const [isGenerating1099, setIsGenerating1099] = useState(false)

  const openAgentSetup = (u: HRUser) => {
    setSelectedUser(u)
    setAgentForm({
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      title: u.title || '',
      role: u.role || 'salesperson',
      licenseNumber: u.license_number || '',
      licenseState: u.license_state || 'NY',
      licenseExpirationDate: u.license_expiration_date || '',
    })
    setAgentModalTab('profile')
  }

  const saveAgentProfile = async () => {
    if (!selectedUser) return
    setIsSavingAgentForm(true)
    try {
      const res = await fetch(`/api/hr/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agentForm),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to save agent profile')
      
      alert('✅ Agent profile saved successfully!')
      await loadUsers()
      if (data.data?.user) {
        setSelectedUser(data.data.user)
      }
    } catch (e: any) {
      alert(e.message || 'Failed to save agent profile')
    } finally {
      setIsSavingAgentForm(false)
    }
  }

  const handleSyncRoster = async () => {
    setIsSyncingRoster(true)
    try {
      const res = await fetch('/api/tenant/sync-ny-license', { method: 'POST' })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Failed to sync roster')
      
      setSyncDiff(data.data?.licenseSync || data.licenseSync || null)
      await loadUsers()
      await refreshUser()
    } catch (e: any) {
      alert(e.message || 'Failed to sync NY DOS license dataset')
    } finally {
      setIsSyncingRoster(false)
    }
  }

  const loadChecklists = () => {
    try {
      const saved = localStorage.getItem('hr_agent_checklists')
      if (saved) setChecklists(JSON.parse(saved))
    } catch (e) { console.error(e) }
  }

  const loadCommissionSplits = () => {
    try {
      const saved = localStorage.getItem('hr_commission_splits')
      if (saved) setCommissionSplits(JSON.parse(saved))
    } catch (e) { console.error(e) }
  }

  const saveCommissionSplit = (agentId: string, split: Omit<CommissionSplit, 'agentId'>) => {
    const updated = { ...commissionSplits, [agentId]: { agentId, ...split } }
    setCommissionSplits(updated)
    localStorage.setItem('hr_commission_splits', JSON.stringify(updated))
    setCommissionEditAgent(null)
  }

  const saveChecklists = (newChecklists: Record<string, Record<string, boolean>>) => {
    setChecklists(newChecklists)
    localStorage.setItem('hr_agent_checklists', JSON.stringify(newChecklists))
  }

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api(`/api/hr/users?q=${encodeURIComponent(search)}`)
      // Only keep agents/brokers (salesperson, broker, assistant)
      const hrUsers = (data.users || []).filter((u: HRUser) => 
        ['salesperson', 'broker', 'assistant'].includes(u.role)
      )
      setUsers(hrUsers)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [search])

  const loadInvitations = useCallback(async () => {
    try {
      const data = await api('/api/hr/invitations')
      setInvitations(data.invitations || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    if (tab === 'invitations') {
      loadInvitations()
    }
  }, [tab, loadInvitations])

  useEffect(() => {
    loadUsers()
    loadChecklists()
    loadCommissionSplits()
  }, [loadUsers])

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsInviting(true)
    try {
      await api('/api/hr/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail, name: inviteName, role: inviteRole })
      })
      setInviteEmail('')
      setInviteName('')
      loadInvitations()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsInviting(false)
    }
  }

  const handleRevokeInvite = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this invitation?')) return
    try {
      await api(`/api/hr/invitations/${id}`, { method: 'DELETE' })
      loadInvitations()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleSendWelcomeCredentials = async (u: HRUser) => {
    if (!confirm(`Send a new temporary password via email to ${u.name}?`)) return
    try {
      await api(`/api/hr/users/${u.id}/send-welcome`, { method: 'POST' })
      alert(`✅ Credentials email sent to ${u.email}.\n\nThe temporary password was sent directly to their inbox. They will need to set a new password on first login.`)
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleCreateManualUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsManualSubmitting(true)
    try {
      await api('/api/hr/users/manual', {
        method: 'POST',
        body: JSON.stringify({
          name: manualName,
          email: manualEmail,
          role: manualRole,
          licenseNumber: manualLicense,
        })
      })
      alert(`✅ User "${manualName}" created successfully!\n\nA welcome email with their temporary password has been sent to ${manualEmail}.\nThey should sign in and update their password immediately.`)
      setIsManualModalOpen(false)
      setManualName('')
      setManualEmail('')
      setManualLicense('')
      loadUsers()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsManualSubmitting(false)
    }
  }

  const handleDeleteUser = async (u: HRUser) => {
    if (!confirm(`Are you sure you want to permanently delete user ${u.name}?`)) return
    try {
      await api(`/api/hr/users/${u.id}`, { method: 'DELETE' })
      setSelectedUser(null)
      loadUsers()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const handleImpersonate = async (u: HRUser) => {
    if (u.id === user?.id) return
    const reason = prompt(`Reason for impersonating ${u.name} (optional):`) || ''
    try {
      await api(`/api/hr/impersonate/${u.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      })
      window.location.href = '/'
    } catch (e: any) {
      alert(e.message)
    }
  }

  const toggleWorkspaceAccess = async (u: HRUser) => {
    const action = u.is_active ? 'deactivate' : 'reactivate'
    if (!confirm(`${action === 'deactivate' ? 'Revoke' : 'Grant'} workspace access for ${u.name}?`)) return
    try {
      await api(`/api/hr/users/${u.id}/${action}`, { method: 'POST' })
      await loadUsers()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const getProgress = (userId: string, type: 'onboarding' | 'offboarding') => {
    const steps = type === 'onboarding' ? ONBOARDING_STEPS : OFFBOARDING_STEPS
    const userMap = checklists[userId] || {}
    const completed = steps.filter(s => userMap[`${type}_${s.id}`]).length
    return {
      completed,
      total: steps.length,
      percentage: Math.round((completed / steps.length) * 100)
    }
  }

  const handleToggleStep = (userId: string, stepId: string, type: 'onboarding' | 'offboarding') => {
    const userMap = checklists[userId] || {}
    const key = `${type}_${stepId}`
    const updatedUserMap = {
      ...userMap,
      [key]: !userMap[key]
    }
    const updatedChecklists = {
      ...checklists,
      [userId]: updatedUserMap
    }
    saveChecklists(updatedChecklists)
  }

  const startOffboarding = (u: HRUser) => {
    if (!confirm(`Are you sure you want to begin offboarding for ${u.name}?`)) return
    const userMap = checklists[u.id] || {}
    const updatedUserMap = {
      ...userMap,
      'offboarding_started': true
    }
    const updatedChecklists = {
      ...checklists,
      [u.id]: updatedUserMap
    }
    saveChecklists(updatedChecklists)
  }

  const resetOnboarding = (u: HRUser) => {
    if (!confirm(`Reset onboarding progress for ${u.name}?`)) return
    const userMap = checklists[u.id] || {}
    const cleanedMap = { ...userMap }
    ONBOARDING_STEPS.forEach(s => {
      delete cleanedMap[`onboarding_${s.id}`]
    })
    const updatedChecklists = {
      ...checklists,
      [u.id]: cleanedMap
    }
    saveChecklists(updatedChecklists)
  }

  if (!user || !['admin', 'broker'].includes(user.role)) {
    return (
      <Layout title="HR Onboarding & Offboarding">
        <div className="flex items-center justify-center h-64 bg-white rounded-2xl border border-gray-100 p-6 shadow-card">
          <p className="text-gray-500">You don't have broker/admin access to the HR portal.</p>
        </div>
      </Layout>
    )
  }

  // Summary Metrics
  const activeWorkspaceAccess = users.filter(u => u.is_active).length
  const onboardingActive = users.filter(u => getProgress(u.id, 'onboarding').percentage < 100).length
  const offboardingActive = users.filter(u => checklists[u.id]?.offboarding_started).length

  return (
    <Layout title="HR Portal">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HR Agent Management</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage agent onboarding checklists, offboarding tasks, and workspace access</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-gray-500 font-medium">NY DOS Dataset Sync</p>
              <p className="text-xs text-gray-400">
                Last Synced: {branding.companyLicenseSyncedAt ? new Date(branding.companyLicenseSyncedAt).toLocaleString() : 'Never'}
              </p>
            </div>
            <button
              onClick={handleSyncRoster}
              disabled={isSyncingRoster}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={clsx('h-3.5 w-3.5', isSyncingRoster && 'animate-spin')} />
              {isSyncingRoster ? 'Syncing...' : 'Sync Roster Now'}
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card flex items-center gap-4">
            <div className="bg-brand-navy/10 p-3 rounded-xl">
              <Users className="h-5 w-5 text-brand-navy" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Agents</p>
              <h3 className="text-xl font-bold text-gray-800">{users.length}</h3>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card flex items-center gap-4">
            <div className="bg-emerald-50 p-3 rounded-xl">
              <Briefcase className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Onboarding Active</p>
              <h3 className="text-xl font-bold text-gray-800">{onboardingActive}</h3>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card flex items-center gap-4">
            <div className="bg-red-50 p-3 rounded-xl">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Offboarding Active</p>
              <h3 className="text-xl font-bold text-gray-800">{offboardingActive}</h3>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-card flex items-center gap-4">
            <div className="bg-indigo-50 p-3 rounded-xl">
              <Key className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">Workspace Access Enabled</p>
              <h3 className="text-xl font-bold text-gray-800">{activeWorkspaceAccess}</h3>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => setTab('agents')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === 'agents' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Agents & Onboarding Index
          </button>
          <button
            onClick={() => setTab('invitations')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === 'invitations' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Invitations
          </button>
          <button
            onClick={() => setTab('commission')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-bold transition-colors flex items-center gap-1.5',
              tab === 'commission' ? 'bg-brand-navy text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 bg-amber-50 text-amber-900 border border-amber-200'
            )}
          >
            <span>✨ Commission & 1099</span>
          </button>
        </div>

        {tab === 'agents' ? (
          <>
            {/* Search & Actions */}
            <div className="flex gap-3 items-center justify-between flex-wrap">
              <input
                type="search"
                placeholder="Search agents by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy max-w-md"
              />
              <button
                onClick={() => setIsManualModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Add Agent Manually
              </button>
            </div>

            {/* Simple Scannable Agents Index Table */}
            {loading ? (
              <div className="flex justify-center py-12">
                <span className="h-6 w-6 border-2 border-brand-navy/30 border-t-brand-navy rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead>
                      <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100 text-left bg-gray-50/50">
                        <th className="px-6 py-4">Agent Name & Email</th>
                        <th className="px-6 py-4">Title & Role</th>
                        <th className="px-6 py-4">NY License #</th>
                        <th className="px-6 py-4">Account Status</th>
                        <th className="px-6 py-4">Onboarding</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.map((u) => {
                        const isUnclaimed = u.email.startsWith('unclaimed_')
                        const onb = getProgress(u.id, 'onboarding')

                        return (
                          <tr
                            key={u.id}
                            onClick={() => openAgentSetup(u)}
                            className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                          >
                            {/* Agent Info */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-brand-navy/10 text-brand-navy font-bold text-sm flex items-center justify-center group-hover:bg-brand-navy group-hover:text-brand-gold transition-colors">
                                  {u.name.split(' ').map(n => n[0]).join('')}
                                </div>
                                <div>
                                  <p className="font-bold text-gray-900 group-hover:text-brand-navy transition-colors">{u.name}</p>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <span className="text-xs text-gray-500">{u.email}</span>
                                    {isUnclaimed && (
                                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                                        Unclaimed Profile
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role / Title */}
                            <td className="px-6 py-4">
                              <p className="text-xs font-semibold text-gray-800">{u.title || 'Agent'}</p>
                              <span className="text-[11px] text-gray-400 capitalize">{u.role}</span>
                            </td>

                            {/* License */}
                            <td className="px-6 py-4">
                              <span className="text-xs font-medium text-gray-700">{u.license_number || '—'}</span>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4">
                              <span className={clsx(
                                'inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border',
                                u.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                              )}>
                                <span className={clsx('h-1.5 w-1.5 rounded-full', u.is_active ? 'bg-emerald-500' : 'bg-amber-500')} />
                                {u.is_active ? 'Active' : 'Unclaimed / Pending'}
                              </span>
                            </td>

                            {/* Onboarding */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className={clsx(
                                      'h-full rounded-full transition-all duration-300',
                                      onb.percentage === 100 ? 'bg-emerald-500' : 'bg-amber-500'
                                    )}
                                    style={{ width: `${onb.percentage}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-gray-600">{onb.completed}/5</span>
                              </div>
                            </td>

                            {/* Action Button */}
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); openAgentSetup(u) }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-navy hover:text-blue-700 bg-brand-navy/5 hover:bg-brand-navy/10 px-3 py-1.5 rounded-xl transition-all"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                                Manage Agent & Setup
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {users.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Users className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No agents found.
                  </div>
                )}
              </div>
            )}
          </>
        ) : tab === 'commission' ? (
          <div className="space-y-6">
            {/* Commission Split Config */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900">Commission Split Configuration</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Set agent/company split per salesperson. Stored locally.</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100 text-left bg-gray-50/50">
                    <th className="px-6 py-3">Agent</th>
                    <th className="px-6 py-3">Split Type</th>
                    <th className="px-6 py-3">Agent Share</th>
                    <th className="px-6 py-3">Company Share</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {users.map((u) => {
                    const split = commissionSplits[u.id]
                    const isEditing = commissionEditAgent === u.id
                    return (
                      <tr key={u.id} className="hover:bg-gray-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-800">{u.name}</p>
                          <p className="text-xs text-gray-400 capitalize">{u.role}</p>
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <select
                              value={splitDraft.splitType}
                              onChange={e => setSplitDraft(prev => ({ ...prev, splitType: e.target.value as 'percent' | 'flat' }))}
                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-navy bg-white"
                            >
                              <option value="percent">% of Commission</option>
                              <option value="flat">Flat Fee per Deal</option>
                            </select>
                          ) : (
                            <span className="text-xs font-medium text-gray-700">{split ? (split.splitType === 'percent' ? '% Split' : 'Flat Fee') : '—'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            splitDraft.splitType === 'percent' ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number" min={0} max={100}
                                  value={splitDraft.agentPercent}
                                  onChange={e => setSplitDraft(prev => ({ ...prev, agentPercent: Number(e.target.value) }))}
                                  className="w-16 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
                                />
                                <span className="text-sm text-gray-500">%</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className="text-sm text-gray-500">$</span>
                                <input
                                  type="number" min={0}
                                  value={splitDraft.flatFeePerDeal}
                                  onChange={e => setSplitDraft(prev => ({ ...prev, flatFeePerDeal: Number(e.target.value) }))}
                                  className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
                                />
                              </div>
                            )
                          ) : (
                            <span className="text-xs font-medium text-gray-700">
                              {split ? (split.splitType === 'percent' ? `${split.agentPercent}%` : `$${split.flatFeePerDeal.toLocaleString()}/deal`) : '—'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-medium text-gray-500">
                            {split && split.splitType === 'percent' ? `${100 - split.agentPercent}%` : split ? 'Remainder' : '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => saveCommissionSplit(u.id, splitDraft)}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                              >Save</button>
                              <button
                                onClick={() => setCommissionEditAgent(null)}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >Cancel</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setCommissionEditAgent(u.id)
                                setSplitDraft(split ? { splitType: split.splitType, agentPercent: split.agentPercent, flatFeePerDeal: split.flatFeePerDeal } : { splitType: 'percent', agentPercent: 70, flatFeePerDeal: 500 })
                              }}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                            >Configure Split</button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {users.length === 0 && (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No agents found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 1099 Report Generator */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-card p-6">
              <h3 className="font-bold text-gray-900 mb-1">1099-NEC Report Generator</h3>
              <p className="text-xs text-gray-500 mb-5">Generate a printable 1099 summary for any agent based on their closed transaction commissions.</p>
              <div className="flex flex-wrap gap-3 items-end mb-5">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Agent</label>
                  <select
                    value={report1099Agent}
                    onChange={e => { setReport1099Agent(e.target.value); setReport1099Data(null) }}
                    className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white min-w-[200px]"
                  >
                    <option value="">Select an agent…</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Tax Year</label>
                  <select
                    value={report1099Year}
                    onChange={e => { setReport1099Year(Number(e.target.value)); setReport1099Data(null) }}
                    className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                  >
                    {[0, 1, 2, 3].map(i => {
                      const yr = new Date().getFullYear() - i
                      return <option key={yr} value={yr}>{yr}</option>
                    })}
                  </select>
                </div>
                <button
                  onClick={async () => {
                    if (!report1099Agent) { alert('Please select an agent first.'); return }
                    setIsGenerating1099(true)
                    try {
                      const res = await fetch(`/api/transactions?assigned_to=${report1099Agent}&status=closed`)
                      const json = await res.json()
                      const allTx = json.success && Array.isArray(json.data) ? json.data : []
                      const yearTx = allTx.filter((t: any) => {
                        const closeDate = t.target_close_date || t.created_at
                        return closeDate && new Date(closeDate).getFullYear() === report1099Year
                      })
                      const total = yearTx.reduce((acc: number, t: any) => acc + (Number(t.commission_amount) || 0), 0)
                      const split = commissionSplits[report1099Agent]
                      const agentShare = split
                        ? (split.splitType === 'percent'
                          ? total * (split.agentPercent / 100)
                          : yearTx.length * split.flatFeePerDeal)
                        : total
                      setReport1099Data({ transactions: yearTx, total, agentShare: Math.round(agentShare) })
                    } catch (e) {
                      alert('Failed to generate report.')
                    } finally {
                      setIsGenerating1099(false)
                    }
                  }}
                  disabled={isGenerating1099 || !report1099Agent}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors disabled:opacity-50"
                >
                  {isGenerating1099 ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Generate Report
                </button>
              </div>

              {report1099Data && (() => {
                const agentUser = users.find(u => u.id === report1099Agent)
                const split = commissionSplits[report1099Agent]
                return (
                  <div className="border border-gray-200 rounded-xl overflow-hidden" id="form-1099-print">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-lg">Form 1099-NEC</p>
                        <p className="text-xs text-gray-500">Tax Year {report1099Year} · Nonemployee Compensation Summary</p>
                      </div>
                      <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-100 no-print"
                      >
                        <Briefcase className="h-4 w-4" /> Print / Export
                      </button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Recipient (Contractor)</p>
                          <p className="font-bold text-gray-900 mt-1">{agentUser?.name || 'Unknown'}</p>
                          <p className="text-sm text-gray-600">{agentUser?.email || ''}</p>
                          <p className="text-sm text-gray-500 capitalize">{agentUser?.role || ''}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 font-semibold uppercase">Payer (Company)</p>
                          <p className="font-bold text-gray-900 mt-1">{user?.name || 'Prime America Real Estate'}</p>
                          <p className="text-sm text-gray-600">{user?.email || ''}</p>
                        </div>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-semibold">Closed Transactions</p>
                          <p className="text-2xl font-black text-gray-900 mt-1">{report1099Data.transactions.length}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-semibold">Total Commission</p>
                          <p className="text-2xl font-black text-gray-900 mt-1">${report1099Data.total.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase font-semibold">Agent Earned (Box 1)</p>
                          <p className="text-2xl font-black text-emerald-700 mt-1">${report1099Data.agentShare.toLocaleString()}</p>
                          {split && <p className="text-[10px] text-gray-400 mt-0.5">{split.splitType === 'percent' ? `${split.agentPercent}% split` : `$${split.flatFeePerDeal}/deal flat`}</p>}
                        </div>
                      </div>

                      {report1099Data.transactions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Transaction Detail</p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-400 border-b border-gray-100">
                                <th className="text-left pb-2">Transaction</th>
                                <th className="text-right pb-2">Sale Price</th>
                                <th className="text-right pb-2">Commission</th>
                                <th className="text-right pb-2">Agent Earned</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {report1099Data.transactions.map((t: any) => {
                                const commAmt = Number(t.commission_amount) || 0
                                const agentAmt = split
                                  ? (split.splitType === 'percent' ? commAmt * (split.agentPercent / 100) : split.flatFeePerDeal)
                                  : commAmt
                                return (
                                  <tr key={t.id}>
                                    <td className="py-2 text-gray-700 font-medium">{t.name}</td>
                                    <td className="py-2 text-right text-gray-600">{t.price ? `$${Number(t.price).toLocaleString()}` : '—'}</td>
                                    <td className="py-2 text-right text-gray-600">{commAmt ? `$${commAmt.toLocaleString()}` : '—'}</td>
                                    <td className="py-2 text-right font-semibold text-emerald-700">{agentAmt ? `$${Math.round(agentAmt).toLocaleString()}` : '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-3">This is an internal estimate only. Consult a licensed tax professional for IRS Form 1099-NEC filing requirements. The payer must file with the IRS if total nonemployee compensation is $600 or more in a tax year.</p>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Invite Form */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-card h-fit">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-brand-navy" />
                Invite Team Member
              </h3>
              <form onSubmit={handleSendInvite} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Full Name</label>
                  <input
                    required
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Email Address</label>
                  <input
                    required
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="jane@company.com"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                  >
                    <option value="salesperson">Salesperson</option>
                    <option value="assistant">Assistant</option>
                    <option value="vendor">Vendor</option>
                    <option value="partner">Partner</option>
                    {user?.role === 'admin' && (
                      <>
                        <option value="broker">Broker</option>
                        <option value="admin">Admin</option>
                      </>
                    )}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isInviting}
                  className="w-full bg-brand-navy hover:bg-brand-navy-light text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <Mail className="h-4 w-4" />
                  {isInviting ? 'Sending...' : 'Send Invitation'}
                </button>
              </form>
            </div>

            {/* Right: Pending Invites List */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-gray-100 shadow-card">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Pending Invitations
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-semibold text-gray-400 border-b border-gray-100 text-left">
                      <th className="pb-3">Invitee</th>
                      <th className="pb-3">Role</th>
                      <th className="pb-3">Invited By</th>
                      <th className="pb-3">Expires At</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/20">
                        <td className="py-3">
                          <p className="font-semibold text-gray-800">{inv.name || 'Unnamed'}</p>
                          <p className="text-xs text-gray-400">{inv.email}</p>
                        </td>
                        <td className="py-3">
                          <span className="capitalize text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                            {inv.role}
                          </span>
                        </td>
                        <td className="py-3 text-xs text-gray-500">{inv.invited_by_name || 'System'}</td>
                        <td className="py-3 text-xs text-gray-400">{new Date(inv.expires_at).toLocaleDateString()}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="text-red-500 hover:text-red-700 p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {invitations.length === 0 && (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-gray-400 text-sm">
                          No pending invitations.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Agent Setup & Profile Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col border border-gray-100">
            {/* Header */}
            <div className="p-6 bg-brand-navy text-white flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-brand-gold text-brand-navy font-bold text-xl flex items-center justify-center">
                  {selectedUser.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold">{selectedUser.name}</h2>
                  <p className="text-xs text-white/70 flex items-center gap-2">
                    <span>{selectedUser.email}</span>
                    <span>•</span>
                    <span className="capitalize">{selectedUser.role}</span>
                    {selectedUser.license_number && (
                      <>
                        <span>•</span>
                        <span>Lic #{selectedUser.license_number}</span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-100 bg-gray-50/50 px-6 pt-3 gap-2 text-sm font-medium">
              <button
                onClick={() => setAgentModalTab('profile')}
                className={clsx(
                  'pb-3 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5',
                  agentModalTab === 'profile' ? 'border-brand-navy text-brand-navy' : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <Edit3 className="h-4 w-4" /> Agent Profile (Editable)
              </button>
              <button
                onClick={() => setAgentModalTab('onboarding')}
                className={clsx(
                  'pb-3 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5',
                  agentModalTab === 'onboarding' ? 'border-brand-navy text-brand-navy' : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <Briefcase className="h-4 w-4" /> Onboarding Setup ({getProgress(selectedUser.id, 'onboarding').percentage}%)
              </button>
              <button
                onClick={() => setAgentModalTab('offboarding')}
                className={clsx(
                  'pb-3 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5',
                  agentModalTab === 'offboarding' ? 'border-brand-navy text-brand-navy' : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <AlertCircle className="h-4 w-4" /> Offboarding Checklist
              </button>
              <button
                onClick={() => setAgentModalTab('access')}
                className={clsx(
                  'pb-3 px-3 border-b-2 font-semibold transition-colors flex items-center gap-1.5',
                  agentModalTab === 'access' ? 'border-brand-navy text-brand-navy' : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <Shield className="h-4 w-4" /> Account & Security
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {/* Tab 1: Profile & Editable Data */}
              {agentModalTab === 'profile' && (
                <div className="space-y-4">
                  {selectedUser.email.startsWith('unclaimed_') && (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-sm mb-0.5">Auto-Created Unclaimed Agent Profile</p>
                        <p>This profile was automatically provisioned from the NY State DOS Dataset. Update the placeholder email below to the agent's real corporate email address.</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Full Name</label>
                      <input
                        value={agentForm.name}
                        onChange={(e) => setAgentForm((p) => ({ ...p, name: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">
                        Email Address <span className="text-blue-600 font-normal">(Editable)</span>
                      </label>
                      <input
                        type="email"
                        value={agentForm.email}
                        onChange={(e) => setAgentForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        placeholder="agent@primeamericany.com"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Phone Number</label>
                      <input
                        value={agentForm.phone}
                        onChange={(e) => setAgentForm((p) => ({ ...p, phone: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        placeholder="(555) 000-0000"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Professional Title</label>
                      <input
                        value={agentForm.title}
                        onChange={(e) => setAgentForm((p) => ({ ...p, title: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        placeholder="Licensed Real Estate Salesperson"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">Workspace Role</label>
                      <select
                        value={agentForm.role}
                        onChange={(e) => setAgentForm((p) => ({ ...p, role: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy capitalize"
                      >
                        <option value="salesperson">Salesperson</option>
                        <option value="associate_broker">Associate Broker</option>
                        <option value="broker">Broker</option>
                        <option value="assistant">Assistant</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">NY DOS License Number</label>
                      <input
                        value={agentForm.licenseNumber}
                        onChange={(e) => setAgentForm((p) => ({ ...p, licenseNumber: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        placeholder="1040..."
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-gray-700 mb-1 block">License Expiration Date</label>
                      <input
                        type="date"
                        value={agentForm.licenseExpirationDate}
                        onChange={(e) => setAgentForm((p) => ({ ...p, licenseExpirationDate: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={saveAgentProfile}
                      disabled={isSavingAgentForm}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-bold hover:bg-brand-navy-light transition-colors disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {isSavingAgentForm ? 'Saving Profile...' : 'Save Agent Profile'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Onboarding Setup Checklist */}
              {agentModalTab === 'onboarding' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-blue-50/60 p-4 rounded-2xl border border-blue-100">
                    <div>
                      <h4 className="font-bold text-sm text-blue-900">Agent Onboarding Progress</h4>
                      <p className="text-xs text-blue-700 mt-0.5">
                        {getProgress(selectedUser.id, 'onboarding').completed} of {getProgress(selectedUser.id, 'onboarding').total} steps completed
                      </p>
                    </div>
                    <button
                      onClick={() => resetOnboarding(selectedUser)}
                      className="text-xs font-bold text-gray-600 hover:text-gray-900 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm"
                    >
                      Reset Progress
                    </button>
                  </div>

                  <div className="space-y-2">
                    {ONBOARDING_STEPS.map((s) => {
                      const key = `onboarding_${s.id}`
                      const isDone = !!checklists[selectedUser.id]?.[key]
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleToggleStep(selectedUser.id, s.id, 'onboarding')}
                          className={clsx(
                            'p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between',
                            isDone ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900' : 'bg-gray-50/50 border-gray-200 text-gray-700 hover:bg-gray-100/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {isDone ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <Circle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                            )}
                            <span className="text-sm font-medium">{s.label}</span>
                          </div>
                          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600')}>
                            {isDone ? 'Complete' : 'Pending'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tab 3: Offboarding Checklist */}
              {agentModalTab === 'offboarding' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-red-50/60 p-4 rounded-2xl border border-red-100">
                    <div>
                      <h4 className="font-bold text-sm text-red-900">Offboarding Progress</h4>
                      <p className="text-xs text-red-700 mt-0.5">
                        {getProgress(selectedUser.id, 'offboarding').completed} of {getProgress(selectedUser.id, 'offboarding').total} steps completed
                      </p>
                    </div>
                    {!checklists[selectedUser.id]?.offboarding_started && (
                      <button
                        onClick={() => startOffboarding(selectedUser)}
                        className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg shadow-sm"
                      >
                        Start Offboarding
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    {OFFBOARDING_STEPS.map((s) => {
                      const key = `offboarding_${s.id}`
                      const isDone = !!checklists[selectedUser.id]?.[key]
                      return (
                        <div
                          key={s.id}
                          onClick={() => handleToggleStep(selectedUser.id, s.id, 'offboarding')}
                          className={clsx(
                            'p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between',
                            isDone ? 'bg-red-50/60 border-red-200 text-red-900' : 'bg-gray-50/50 border-gray-200 text-gray-700 hover:bg-gray-100/50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {isDone ? (
                              <CheckCircle2 className="h-5 w-5 text-red-600 flex-shrink-0" />
                            ) : (
                              <Circle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                            )}
                            <span className="text-sm font-medium">{s.label}</span>
                          </div>
                          <span className={clsx('text-xs font-bold px-2 py-0.5 rounded-full', isDone ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-600')}>
                            {isDone ? 'Done' : 'Pending'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Tab 4: Account Actions & Access */}
              {agentModalTab === 'access' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl border border-gray-100 bg-gray-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-gray-800">Workspace Status</p>
                        <p className="text-xs text-gray-500">{selectedUser.is_active ? 'Active login access enabled' : 'Account is unverified / pending invite'}</p>
                      </div>
                      <button
                        onClick={() => toggleWorkspaceAccess(selectedUser)}
                        className={clsx(
                          'text-xs font-bold px-3 py-1.5 rounded-lg border transition-all',
                          selectedUser.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                        )}
                      >
                        {selectedUser.is_active ? 'Revoke Access' : 'Activate Access'}
                      </button>
                    </div>

                    <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-gray-800">Send Welcome Credentials</p>
                        <p className="text-xs text-gray-500">Send temporary password email to {selectedUser.email}</p>
                      </div>
                      <button
                        onClick={() => handleSendWelcomeCredentials(selectedUser)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      >
                        Send Email
                      </button>
                    </div>

                    {selectedUser.id !== user?.id && (
                      <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm text-gray-800">Impersonate Agent</p>
                          <p className="text-xs text-gray-500">Log into workspace as this agent for support</p>
                        </div>
                        <button
                          onClick={() => handleImpersonate(selectedUser)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100"
                        >
                          Impersonate
                        </button>
                      </div>
                    )}

                    {user?.role === 'admin' && selectedUser.id !== user.id && (
                      <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-sm text-red-600">Delete User Account</p>
                          <p className="text-xs text-gray-500">Permanently remove user record from database</p>
                        </div>
                        <button
                          onClick={() => handleDeleteUser(selectedUser)}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
                        >
                          Delete Account
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sync Diff Modal */}
      {syncDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-gray-100">
            <div className="p-6 bg-brand-navy text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">NY DOS Dataset Sync Results</h3>
                  <p className="text-xs text-white/70">{syncDiff.businessName || 'Company Roster Sync'}</p>
                </div>
              </div>
              <button onClick={() => setSyncDiff(null)} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-2xl bg-gray-50 border border-gray-100">
                  <p className="text-xs text-gray-500">Active NY DOS</p>
                  <p className="text-xl font-bold text-gray-800">{syncDiff.totalAgents}</p>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-900">
                  <p className="text-xs text-emerald-700">New Added</p>
                  <p className="text-xl font-bold">{syncDiff.autoCreatedUsers || 0}</p>
                </div>
                <div className="p-3 rounded-2xl bg-red-50 border border-red-100 text-red-900">
                  <p className="text-xs text-red-700">Missing / Removed</p>
                  <p className="text-xl font-bold">{syncDiff.removedUsersList?.length || 0}</p>
                </div>
              </div>

              {/* Newly Added Agents */}
              {syncDiff.autoCreatedList && syncDiff.autoCreatedList.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Newly Auto-Provisioned Profiles ({syncDiff.autoCreatedList.length})
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {syncDiff.autoCreatedList.map((a: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-100 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-bold text-gray-800">{a.name}</span>
                          {a.licenseNumber && <span className="text-gray-500 text-[11px] ml-2">(Lic #{a.licenseNumber})</span>}
                        </div>
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Unclaimed Profile</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing / Removed Agents */}
              {syncDiff.removedUsersList && syncDiff.removedUsersList.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold text-red-700 uppercase tracking-wide flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" /> Workspace Agents Missing on NY DOS Registry ({syncDiff.removedUsersList.length})
                  </h4>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {syncDiff.removedUsersList.map((a: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-red-50/60 border border-red-100 text-xs flex items-center justify-between">
                        <div>
                          <span className="font-bold text-gray-800">{a.name}</span>
                          <span className="text-gray-500 text-[11px] ml-2">({a.email})</span>
                        </div>
                        <span className="text-[10px] font-bold bg-red-100 text-red-800 px-2 py-0.5 rounded-full">Missing on NY DOS</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setSyncDiff(null)}
                className="px-5 py-2 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy-light"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden animate-slide-in">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900">Add User Manually</h2>
              <button onClick={() => setIsManualModalOpen(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleCreateManualUser} className="p-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Full Name *</label>
                <input required value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Jane Doe" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email Address *</label>
                <input required type="email" value={manualEmail} onChange={e => setManualEmail(e.target.value)} placeholder="jane@email.com" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role *</label>
                <select value={manualRole} onChange={e => setManualRole(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                  {user.role === 'admin' && <option value="broker">Broker</option>}
                  <option value="salesperson">Salesperson</option>
                  <option value="assistant">Assistant</option>
                  <option value="vendor">Vendor</option>
                  <option value="partner">Partner</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">License Number (Optional)</label>
                <input value={manualLicense} onChange={e => setManualLicense(e.target.value)} placeholder="12000345678" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="manual_send_email" checked={manualSendEmail} onChange={e => setManualSendEmail(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
                <label htmlFor="manual_send_email" className="text-sm font-medium text-gray-700 select-none">
                  Send welcome email with credentials immediately
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsManualModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" disabled={isManualSubmitting} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {isManualSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}
