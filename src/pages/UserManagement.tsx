import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, UserPlus, Shield, Eye, EyeOff,
  CheckCircle, XCircle, Mail, Clock, Trash2, RefreshCw,
  Activity, Loader2
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import { Layout } from '@/components/layout/Layout'
import { Pagination } from '@/components/common/Pagination'

// ── Types ────────────────────────────────────────────────────────────────────

interface HRUser {
  id: string; name: string; email: string; role: string
  is_active: number; email_verified: number; last_login_at: string | null
  created_at: string; title?: string; license_number?: string
}

interface Invitation {
  id: string; email: string; name: string | null; role: string
  invited_by_name: string; expires_at: string; created_at: string
}

interface AuditEntry {
  id: string; impersonator_name: string; impersonator_email: string
  target_name: string; target_email: string; target_role: string
  started_at: string; ended_at: string | null; reason: string | null
}




const MODULES = ['crm','listings','transactions','network','learning','marketing','storage','reports','hr','settings.tenant','settings.user'] as const
const ACTIONS = ['read','write','delete','export'] as const
const ROLES = ['salesperson','assistant','vendor','partner','broker','admin']

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Request failed')
  return data.data
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-700',
    broker: 'bg-blue-100 text-blue-700',
    salesperson: 'bg-teal-100 text-teal-700',
    assistant: 'bg-gray-100 text-gray-700',
    vendor: 'bg-orange-100 text-orange-700',
    partner: 'bg-pink-100 text-pink-700',
  }
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-semibold capitalize', colors[role] ?? 'bg-gray-100 text-gray-700')}>
      {role}
    </span>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export function UserManagementPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<'users'|'invitations'|'audit'>('users')

  if (!user || user.role !== 'admin') {
    return (
      <Layout title="User-Management">
        <div className="flex items-center justify-center h-64 bg-white rounded-2xl border border-gray-100 p-6 shadow-card">
          <p className="text-gray-500">Only admins have access to User-Management.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="User-Management">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User-Management</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage users, permissions, and access for your workspace</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {(['users','invitations','audit'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx('px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize', tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              {t === 'users' ? <><Users className="h-4 w-4 inline mr-1.5" />Users</> : t === 'invitations' ? <><UserPlus className="h-4 w-4 inline mr-1.5" />Invitations</> : <><Activity className="h-4 w-4 inline mr-1.5" />Audit Log</>}
            </button>
          ))}
        </div>

        {tab === 'users' && <UsersTab isAdmin={user.role === 'admin'} />}
        {tab === 'invitations' && <InvitationsTab currentUserRole={user.role} />}
        {tab === 'audit' && user.role === 'admin' && <AuditTab />}
        {tab === 'audit' && user.role !== 'admin' && <p className="text-gray-400 text-sm">Only admins can view the audit log.</p>}
      </div>
    </Layout>
  )
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab({ isAdmin }: { isAdmin: boolean }) {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<HRUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<HRUser | null>(null)
  const [showPermissions, setShowPermissions] = useState(false)
  const PAGE_SIZE = 12

  // Manual creation states
  const [isManualModalOpen, setIsManualModalOpen] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualRole, setManualRole] = useState('salesperson')
  const [manualLicense, setManualLicense] = useState('')
  const [manualSendEmail, setManualSendEmail] = useState(true)
  const [isManualSubmitting, setIsManualSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api(`/api/hr/users?q=${encodeURIComponent(search)}`)
      setUsers(data.users)
    } catch (e: any) { console.error(e) }
    finally { setLoading(false) }
  }, [search])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setPage(1)
  }, [search])

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE))
  const pagedUsers = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return users.slice(start, start + PAGE_SIZE)
  }, [users, page])

  async function handleSendWelcomeCredentials(u: HRUser) {
    if (!confirm(`Send a new temporary password via email to ${u.name}?`)) return
    try {
      await api(`/api/hr/users/${u.id}/send-welcome`, { method: 'POST' })
      alert(`✅ Credentials email sent to ${u.email}.\n\nThe temporary password was sent directly to their inbox. They will need to set a new password on first login.`)
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function handleCreateManualUser(e: React.FormEvent) {
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
      load()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setIsManualSubmitting(false)
    }
  }

  async function handleImpersonate(u: HRUser) {
    const reason = prompt(`Reason for impersonating ${u.name} (optional):`)
    try {
      await api(`/api/hr/impersonate/${u.id}`, { method: 'POST', body: JSON.stringify({ reason }) })
      window.location.href = '/'
    } catch (e: any) { alert(e.message) }
  }

  async function handleDeactivate(u: HRUser) {
    if (!confirm(`Deactivate ${u.name}? They will no longer be able to log in.`)) return
    try {
      await api(`/api/hr/users/${u.id}/deactivate`, { method: 'POST' })
      load()
    } catch (e: any) { alert(e.message) }
  }

  async function handleReactivate(u: HRUser) {
    try {
      await api(`/api/hr/users/${u.id}/reactivate`, { method: 'POST' })
      load()
    } catch (e: any) { alert(e.message) }
  }

  async function handleForceReset(u: HRUser) {
    if (!confirm(`Send password reset email to ${u.email}?`)) return
    try {
      await api(`/api/hr/users/${u.id}/reset-password`, { method: 'POST' })
      alert('Password reset email sent.')
    } catch (e: any) { alert(e.message) }
  }

  async function handleDeleteUser(u: HRUser) {
    if (!confirm(`Permanently delete ${u.name}? This removes the user record from the database.`)) return
    try {
      await api(`/api/hr/users/${u.id}`, { method: 'DELETE' })
      load()
    } catch (e: any) { alert(e.message) }
  }

  const adminCount = users.filter(u => u.role === 'admin').length

  return (
    <div className="space-y-4">
      {adminCount > 1 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 flex items-center justify-between text-xs text-amber-900 font-semibold">
          <div className="flex items-center gap-2">
            <span className="text-sm">⚠️</span>
            <span>Multiple Admin Accounts Detected ({adminCount} Admins) — Ensure duplicate role accounts are reviewed for security compliance.</span>
          </div>
        </div>
      )}

      <div className="flex gap-3 items-center justify-between flex-wrap">
        <input
          type="search" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy max-w-md"
        />
        <button
          onClick={() => setIsManualModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-semibold hover:bg-brand-navy-light transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Add User Manually
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><span className="h-6 w-6 border-2 border-brand-navy/30 border-t-brand-navy rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left font-medium text-gray-500 px-4 py-3">User</th>
              <th className="text-left font-medium text-gray-500 px-4 py-3">Role</th>
              <th className="text-left font-medium text-gray-500 px-4 py-3">Status</th>
              <th className="text-left font-medium text-gray-500 px-4 py-3">Last Login</th>
              <th className="px-4 py-3" />
            </tr></thead>
            <tbody>
              {pagedUsers.map((u) => {
                const daysInactive = u.last_login_at ? Math.floor((Date.now() - new Date(u.last_login_at).getTime()) / (1000 * 60 * 60 * 24)) : 999
                const isInactive = daysInactive >= 14

                return (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <span>{u.name}</span>
                      {isInactive && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-full" title={`Last logged in ${daysInactive === 999 ? 'never' : `${daysInactive} days ago`}`}>
                          Inactive {daysInactive === 999 ? 'never' : `${daysInactive}d`}
                        </span>
                      )}
                    </div>
                    <div className="text-gray-500 text-xs">{u.email}</div>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      u.email_verified
                        ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><CheckCircle className="h-3.5 w-3.5" />Active</span>
                        : <span className="flex items-center gap-1 text-amber-600 text-xs font-medium"><Clock className="h-3.5 w-3.5" />Unverified</span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-500 text-xs font-medium"><XCircle className="h-3.5 w-3.5" />Deactivated</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== currentUser?.id && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => { setSelectedUser(u); setShowPermissions(true) }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Edit Permissions"
                        ><Shield className="h-4 w-4" /></button>
                        {['admin','broker'].includes(currentUser?.role ?? '') && (
                          <button
                            onClick={() => handleImpersonate(u)}
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-600 transition-colors" title="View as this user"
                          ><Eye className="h-4 w-4" /></button>
                        )}
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleSendWelcomeCredentials(u)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-400 hover:text-blue-600 transition-colors"
                              title="Send/Resend welcome email with credentials"
                            >
                              <Mail className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleForceReset(u)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Force password reset"><Mail className="h-4 w-4" /></button>
                            {u.is_active
                              ? <button onClick={() => handleDeactivate(u)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Deactivate"><EyeOff className="h-4 w-4" /></button>
                              : <button onClick={() => handleReactivate(u)} className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-500 transition-colors" title="Reactivate"><RefreshCw className="h-4 w-4" /></button>
                            }
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                              title="Delete User Permanently"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {users.length === 0 && <p className="text-center text-gray-400 py-12 text-sm">No users found.</p>}

          {users.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={users.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      {showPermissions && selectedUser && (
        <PermissionsModal
          user={selectedUser}
          onClose={() => { setShowPermissions(false); setSelectedUser(null) }}
          onUserUpdated={load}
        />
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
                  <option value="broker">Broker</option>
                  <option value="salesperson">Salesperson</option>
                  <option value="assistant">Assistant</option>
                  <option value="vendor">Vendor</option>
                  <option value="partner">Partner</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">License Number (Optional)</label>
                <input value={manualLicense} onChange={e => setManualLicense(e.target.value)} placeholder="12000345678" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" id="manual_send_email_um" checked={manualSendEmail} onChange={e => setManualSendEmail(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4" />
                <label htmlFor="manual_send_email_um" className="text-sm font-medium text-gray-700 select-none">
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
    </div>
  )
}

// ── Permissions Modal ────────────────────────────────────────────────────────

function PermissionsModal({
  user,
  onClose,
  onUserUpdated,
}: {
  user: HRUser
  onClose: () => void
  onUserUpdated: () => void
}) {
  const [effective, setEffective] = useState<Record<string, boolean>>({})
  const [pendingOverrides, setPendingOverrides] = useState<Array<{ module: string; action: string; granted: number; rls_scope?: string }>>([])
  const [role, setRole] = useState(user.role)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await api(`/api/hr/users/${user.id}/permissions`)
        setEffective(data.effective || {})
        setPendingOverrides(data.overrides || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user.id])


  useEffect(() => {
    setRole(user.role)
  }, [user.role])

  function getAccessScope(module: string, action: string): { level: 'allow_all' | 'allow_own' | 'deny'; isOverride: boolean } {
    const override = pendingOverrides.find((p) => p.module === module && p.action === action)
    if (override) {
      if (override.granted === 0) return { level: 'deny', isOverride: true }
      return { level: override.rls_scope === 'own' ? 'allow_own' : 'allow_all', isOverride: true }
    }
    const effectiveVal = effective[`${module}:${action}`]
    if (!effectiveVal) return { level: 'deny', isOverride: false }
    return { level: role === 'admin' || role === 'broker' ? 'allow_all' : 'allow_own', isOverride: false }
  }

  function cyclePermission(module: string, action: string) {
    const current = getAccessScope(module, action)
    let nextLevel: 'allow_all' | 'allow_own' | 'deny' = 'allow_all'

    if (current.level === 'allow_all') nextLevel = 'allow_own'
    else if (current.level === 'allow_own') nextLevel = 'deny'
    else nextLevel = 'allow_all'

    setPendingOverrides((prev) => {
      const idx = prev.findIndex((p) => p.module === module && p.action === action)
      const nextOverride = {
        module,
        action,
        granted: nextLevel === 'deny' ? 0 : 1,
        rls_scope: nextLevel === 'allow_own' ? 'own' : 'all',
      }
      if (idx >= 0) {
        const nextArr = [...prev]
        nextArr[idx] = nextOverride
        return nextArr
      }
      return [...prev, nextOverride]
    })
  }

  async function save() {
    setSaving(true)
    try {
      if (role !== user.role) {
        await api(`/api/hr/users/${user.id}`, {
          method: 'PUT',
          body: JSON.stringify({ role }),
        })
      }

      await api(`/api/hr/users/${user.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: pendingOverrides }),
      })

      onUserUpdated()
      onClose()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function resetToRoleDefaults() {
    if (!confirm('Revert this user to default permissions from their current role?')) return
    setSaving(true)
    try {
      setPendingOverrides([])
      await api(`/api/hr/users/${user.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: [] }),
      })
      const data = await api(`/api/hr/users/${user.id}/permissions`)
      setEffective(data.effective)
      setPendingOverrides(data.overrides || [])
      onUserUpdated()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-gray-900 text-lg">{user.name}'s Row-Level Security Matrix</h2>
            <p className="text-sm text-gray-500">Base role: <RoleBadge role={user.role} /></p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">✕</button>
        </div>

        <div className="p-6">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">User Role Assignment</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r} className="capitalize">{r}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 hidden sm:inline">Leg:</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-normal bg-gray-100 text-gray-500 border border-dashed border-gray-300">
                Muted = Inherited Default
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-brand-navy text-brand-gold shadow-2xs">
                Bold = Explicit Override
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-4">
            Click any cell to toggle permissions between <strong>Allow (All)</strong>, <strong>Allow (Own)</strong>, and <strong>Deny</strong>. Overridden matrix cells render in <strong>bold vibrant states</strong>, while inherited role defaults render in <strong>muted states</strong>.
          </p>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left font-bold text-gray-700 py-2.5 px-3 uppercase tracking-wider">Module</th>
                    {ACTIONS.map((a) => <th key={a} className="text-center font-bold text-gray-700 py-2.5 px-2 capitalize w-32 uppercase tracking-wider">{a}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((mod) => (
                    <tr key={mod} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2.5 px-3 font-semibold text-gray-800 capitalize">{mod.replace('.', ' ')}</td>
                      {ACTIONS.map((action) => {
                        const { level, isOverride } = getAccessScope(mod, action)

                        return (
                          <td key={action} className="py-2 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => cyclePermission(mod, action)}
                              className={clsx(
                                'w-28 py-1.5 rounded-lg text-[11px] transition-all flex items-center justify-center gap-1 mx-auto',
                                isOverride
                                  ? level === 'allow_all'
                                    ? 'bg-emerald-600 text-white font-extrabold shadow-sm ring-2 ring-emerald-600/30'
                                    : level === 'allow_own'
                                    ? 'bg-sky-600 text-white font-extrabold shadow-sm ring-2 ring-sky-600/30'
                                    : 'bg-red-600 text-white font-extrabold shadow-sm ring-2 ring-red-600/30'
                                  : level === 'allow_all'
                                    ? 'bg-emerald-50 text-emerald-700 font-normal border border-dashed border-emerald-200 opacity-75'
                                    : level === 'allow_own'
                                    ? 'bg-sky-50 text-sky-700 font-normal border border-dashed border-sky-200 opacity-75'
                                    : 'bg-gray-100 text-gray-400 font-normal border border-dashed border-gray-300 opacity-75'
                              )}
                            >
                              {level === 'allow_all' && (isOverride ? '✓ Allow (All)' : 'Allow (All)')}
                              {level === 'allow_own' && (isOverride ? '👤 Allow (Own)' : 'Allow (Own)')}
                              {level === 'deny' && (isOverride ? '✗ Deny' : 'Deny')}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <button
            type="button"
            onClick={resetToRoleDefaults}
            disabled={saving}
            className="px-3.5 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            Revert To Role Defaults
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-brand-navy text-white text-sm font-bold shadow-md hover:bg-brand-navy-light transition-colors disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save Security Matrix'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Invitations Tab ───────────────────────────────────────────────────────────

function InvitationsTab({ currentUserRole }: { currentUserRole: string }) {
  const [invites, setInvites] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'salesperson' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const PAGE_SIZE = 10

  const load = useCallback(async () => {
    setLoading(true)
    try { const data = await api('/api/hr/invitations'); setInvites(data.invitations) }
    catch (e) { console.error('Failed to load invitations:', e) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(invites.length / PAGE_SIZE))
  const pagedInvites = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return invites.slice(start, start + PAGE_SIZE)
  }, [invites, page])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    try {
      await api('/api/hr/invitations', { method: 'POST', body: JSON.stringify(form) })
      setSent(true); setShowForm(false); setForm({ email: '', name: '', role: 'salesperson' }); load()
    } catch (e: any) { alert(e.message) }
    finally { setSending(false) }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this invitation?')) return
    try { await api(`/api/hr/invitations/${id}`, { method: 'DELETE' }); load() }
    catch (e: any) { alert(e.message) }
  }

  const allowedRoles = currentUserRole === 'admin' ? ROLES : ROLES.filter((r) => !['admin','broker'].includes(r))

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{invites.length} pending invitation{invites.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-xl bg-brand-navy text-white px-4 py-2 text-sm font-semibold hover:bg-brand-navy-light transition-colors">
          <UserPlus className="h-4 w-4" />Invite Team Member
        </button>
      </div>

      {sent && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">
          <CheckCircle className="h-4 w-4" />Invitation sent successfully!
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSend} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <h3 className="font-semibold text-gray-900">Send Invitation</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
              <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" placeholder="agent@company.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name (optional)</label>
              <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" placeholder="Agent Name" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy">
                {allowedRoles.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={sending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-navy text-white text-sm font-semibold disabled:opacity-60">
              <Mail className="h-4 w-4" />{sending ? 'Sending…' : 'Send Invitation'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><span className="h-6 w-6 border-2 border-brand-navy/30 border-t-brand-navy rounded-full animate-spin" /></div>
      ) : invites.length === 0 ? (
        <div className="text-center py-12 text-gray-400"><UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No pending invitations</p></div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left font-medium text-gray-500 px-4 py-3">Invited</th>
              <th className="text-left font-medium text-gray-500 px-4 py-3">Role</th>
              <th className="text-left font-medium text-gray-500 px-4 py-3">By</th>
              <th className="text-left font-medium text-gray-500 px-4 py-3">Expires</th>
              <th className="px-4 py-3" />
            </tr></thead>
            <tbody>
              {pagedInvites.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-50">
                  <td className="px-4 py-3"><div className="font-medium">{inv.name ?? '—'}</div><div className="text-gray-500 text-xs">{inv.email}</div></td>
                  <td className="px-4 py-3"><RoleBadge role={inv.role} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.invited_by_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(inv.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => handleRevoke(inv.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>

          {invites.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={invites.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ── Audit Tab ─────────────────────────────────────────────────────────────────

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 12

  useEffect(() => {
    api('/api/hr/impersonate/audit').then((d) => setEntries(d.entries)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE))
  const pagedEntries = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return entries.slice(start, start + PAGE_SIZE)
  }, [entries, page])

  return loading ? (
    <div className="flex justify-center py-12"><span className="h-6 w-6 border-2 border-brand-navy/30 border-t-brand-navy rounded-full animate-spin" /></div>
  ) : entries.length === 0 ? (
    <div className="text-center py-12 text-gray-400"><Activity className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No impersonation events yet</p></div>
  ) : (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-100 bg-gray-50">
          <th className="text-left font-medium text-gray-500 px-4 py-3">Impersonator</th>
          <th className="text-left font-medium text-gray-500 px-4 py-3">Viewed As</th>
          <th className="text-left font-medium text-gray-500 px-4 py-3">Started</th>
          <th className="text-left font-medium text-gray-500 px-4 py-3">Ended</th>
          <th className="text-left font-medium text-gray-500 px-4 py-3">Reason</th>
        </tr></thead>
        <tbody>
          {pagedEntries.map((e) => (
            <tr key={e.id} className="border-b border-gray-50">
              <td className="px-4 py-3"><div className="font-medium">{e.impersonator_name}</div><div className="text-gray-500 text-xs">{e.impersonator_email}</div></td>
              <td className="px-4 py-3"><div className="font-medium">{e.target_name}</div><div><RoleBadge role={e.target_role} /></div></td>
              <td className="px-4 py-3 text-gray-500 text-xs">{new Date(e.started_at).toLocaleString()}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{e.ended_at ? new Date(e.ended_at).toLocaleString() : <span className="text-amber-600 font-medium">Active</span>}</td>
              <td className="px-4 py-3 text-gray-500 text-xs">{e.reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {entries.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={entries.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </div>
  )
}
