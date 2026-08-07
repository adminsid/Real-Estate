import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Users, Download, Share2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { SkeletonTable } from '@/components/common/SkeletonLoader'
import { useAuth } from '@/context/AuthContext'
import { apiFetch } from '@/utils/api'

type MailingList = {
  id: string
  name: string
  description: string | null
  channel: string
  member_count?: number
  created_by: string
  created_by_name: string
  is_shared: number
}

type SharedUser = {
  id: string
  name: string
  email: string
}

type Contact = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  type: string
  status: string
}

type UserTarget = {
  id: string
  name: string
  role: string
  email: string
}

export function CRMMailingListsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [lists, setLists] = useState<MailingList[]>([])
  const [selectedListId, setSelectedListId] = useState('')
  const [members, setMembers] = useState<Contact[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  const [users, setUsers] = useState<UserTarget[]>([])
  const [channelFilter, setChannelFilter] = useState<'email' | 'mail'>('email')
  const [createdByFilter, setCreatedByFilter] = useState<'all' | 'me' | string>(() => {
    if (!user) return 'all'
    return ['admin', 'broker'].includes(user.role) ? 'me' : 'all'
  })
  const [showOtherUsers, setShowOtherUsers] = useState(false)

  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const [shareListId, setShareListId] = useState<string | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [allUsers, setAllUsers] = useState<SharedUser[]>([])
  const [selectedShareIds, setSelectedShareIds] = useState<Set<string>>(new Set())
  const [savingShares, setSavingShares] = useState(false)

  const filteredLists = useMemo(() => lists.filter((l) => l.channel === channelFilter), [lists, channelFilter])
  const selectedList = useMemo(() => lists.find((l) => l.id === selectedListId) || null, [lists, selectedListId])

  const loadLists = async (filter?: string) => {
    const params = new URLSearchParams()
    if (['admin', 'broker'].includes(user?.role || '') && filter && filter !== 'all') {
      params.set('created_by', filter)
    }
    const qs = params.toString()
    const data = await apiFetch(`/api/contacts/lists${qs ? `?${qs}` : ''}`)
    setLists(Array.isArray(data) ? data : [])
    if (!selectedListId && Array.isArray(data) && data[0]?.id) {
      setSelectedListId(data[0].id)
    }
  }

  const loadContacts = async () => {
    const params = new URLSearchParams({ page: '1', limit: '100' })
    if (['admin', 'broker'].includes(user?.role || '') && createdByFilter !== 'all') {
      params.set('assigned_to', createdByFilter === 'me' ? (user?.id || '') : createdByFilter)
    }
    const data = await apiFetch(`/api/contacts?${params.toString()}`)
    setContacts(Array.isArray(data.contacts) ? data.contacts : [])
  }

  const loadUsers = async () => {
    if (!['admin', 'broker'].includes(user?.role || '')) {
      setUsers([])
      return
    }
    const data = await apiFetch('/api/contacts/tools/users')
    setUsers(Array.isArray(data) ? data : [])
  }

  const loadMembers = async (listId: string) => {
    if (!listId) {
      setMembers([])
      return
    }
    const data = await apiFetch(`/api/contacts/lists/${listId}/members`)
    setMembers(Array.isArray(data) ? data : [])
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      await Promise.all([loadLists(createdByFilter), loadContacts(), loadUsers()])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      setCreatedByFilter(['admin', 'broker'].includes(user.role) ? 'me' : 'all')
    }
  }, [user?.id, user?.role])

  useEffect(() => {
    if (user) {
      loadAll()
      setSelectedContactIds(new Set())
    }
  }, [user, createdByFilter])

  useEffect(() => {
    if (selectedListId && !filteredLists.find((l) => l.id === selectedListId)) {
      setSelectedListId(filteredLists[0]?.id || '')
    }
  }, [channelFilter, filteredLists, selectedListId])

  useEffect(() => {
    if (selectedListId) loadMembers(selectedListId)
  }, [selectedListId])

  const createList = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newListName.trim()) return
    setCreating(true)
    try {
      await apiFetch('/api/contacts/lists', {
        method: 'POST',
        body: JSON.stringify({ name: newListName.trim(), description: newListDescription || null, channel: channelFilter }),
      })
      setNewListName('')
      setNewListDescription('')
      await loadLists()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setCreating(false)
    }
  }

  const deleteList = async (listId: string) => {
    if (!confirm('Delete this mailing list?')) return
    try {
      await apiFetch(`/api/contacts/lists/${listId}`, { method: 'DELETE' })
      if (selectedListId === listId) setSelectedListId('')
      await loadLists()
      setMembers([])
    } catch (e: any) {
      alert(e.message)
    }
  }

  const toggleContact = (id: string, checked: boolean) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const addSelectedToList = async () => {
    if (!selectedListId || selectedContactIds.size === 0) return
    try {
      await apiFetch(`/api/contacts/lists/${selectedListId}/members`, {
        method: 'POST',
        body: JSON.stringify({ contactIds: Array.from(selectedContactIds) }),
      })
      setSelectedContactIds(new Set())
      await loadMembers(selectedListId)
      await loadLists()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const removeMember = async (contactId: string) => {
    if (!selectedListId) return
    try {
      await apiFetch(`/api/contacts/lists/${selectedListId}/members/${contactId}`, { method: 'DELETE' })
      await loadMembers(selectedListId)
      await loadLists()
    } catch (e: any) {
      alert(e.message)
    }
  }

  const openShareModal = async (listId: string) => {
    setShareListId(listId)
    setUserSearch('')
    setSelectedShareIds(new Set())
    try {
      const [shares, users] = await Promise.all([
        apiFetch(`/api/contacts/lists/${listId}/shares`),
        apiFetch('/api/contacts/tools/users'),
      ])
      setAllUsers(Array.isArray(users) ? users : [])
      setSelectedShareIds(new Set((Array.isArray(shares) ? shares : []).map((s: any) => s.id)))
    } catch (e: any) {
      alert(e.message)
    }
  }

  const exportMembers = async () => {
    if (!selectedListId) return
    try {
      const ids = members.map((m) => m.id)
      const data = await apiFetch('/api/contacts/bulk/export', {
        method: 'POST',
        body: JSON.stringify({ contactIds: ids }),
      })
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' })
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = data.filename || 'mailing-list-members.csv'
      a.click()
      URL.revokeObjectURL(href)
    } catch (e: any) {
      alert(e.message)
    }
  }

  return (
    <Layout title="Mailing & Email Marketing Lists">
      <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-4">
        <button onClick={() => navigate('/marketing/crm')} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <ArrowLeft className="h-4 w-4" /> Back to CRM
        </button>
        {selectedList && (
          <button onClick={exportMembers} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export Members CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6"><SkeletonTable rows={6} cols={4} /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card space-y-4">
            <h2 className="text-base font-bold text-gray-800">List Manager</h2>
            <div className="flex rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setChannelFilter('email')} className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${channelFilter === 'email' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Email</button>
              <button onClick={() => setChannelFilter('mail')} className={`flex-1 py-2 text-xs font-semibold text-center transition-colors ${channelFilter === 'mail' ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Mail</button>
            </div>
            
            {['admin', 'broker'].includes(user?.role || '') && (
              <div className="space-y-2">
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button onClick={() => { setCreatedByFilter('me'); setShowOtherUsers(false) }} className={`flex-1 py-1.5 text-xs font-semibold text-center transition-colors ${createdByFilter === 'me' && !showOtherUsers ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Created by me</button>
                  <button onClick={() => { setCreatedByFilter('all'); setShowOtherUsers(true) }} className={`flex-1 py-1.5 text-xs font-semibold text-center transition-colors ${showOtherUsers ? 'bg-brand-navy text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Other users</button>
                </div>
                {showOtherUsers && (
                  <select
                    value={createdByFilter}
                    onChange={(e) => setCreatedByFilter(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none"
                  >
                    <option value="all">All Users</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <form onSubmit={createList} className="space-y-2">
              <input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="New list name" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
              <input value={newListDescription} onChange={(e) => setNewListDescription(e.target.value)} placeholder="Description (optional)" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none" />
              <button type="submit" disabled={creating} className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:bg-brand-navy-light disabled:opacity-60">
                <Plus className="h-3.5 w-3.5" /> {creating ? 'Creating...' : 'Create List'}
              </button>
            </form>

            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {filteredLists.map((l) => (
                <button key={l.id} onClick={() => setSelectedListId(l.id)} className={`w-full rounded-xl border px-3 py-2 text-left ${selectedListId === l.id ? 'border-brand-navy bg-brand-navy/5' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-800">{l.name}</p>
                    <div className="flex items-center gap-1">
                      {l.created_by === user?.id && (
                        <button onClick={(e) => { e.stopPropagation(); openShareModal(l.id) }} className="text-gray-400 hover:text-brand-navy"><Share2 className="h-3.5 w-3.5" /></button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); deleteList(l.id) }} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{l.member_count || 0} members • {l.created_by_name}</p>
                </button>
              ))}
              {filteredLists.length === 0 && <p className="text-xs text-gray-500">No {channelFilter} lists yet.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card lg:col-span-2 space-y-4">
            <h2 className="text-base font-bold text-gray-800">{selectedList ? `${selectedList.name} Members` : 'Select a mailing list'}</h2>
            {selectedList && (
              <>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Add Contacts to List</p>
                  <div className="max-h-[210px] overflow-auto rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Select</th>
                          <th className="px-3 py-2 text-left">Contact</th>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contacts.map((c) => (
                          <tr key={c.id} className="border-t border-gray-50">
                            <td className="px-3 py-2"><input type="checkbox" checked={selectedContactIds.has(c.id)} onChange={(e) => toggleContact(c.id, e.target.checked)} /></td>
                            <td className="px-3 py-2">{c.first_name} {c.last_name}</td>
                            <td className="px-3 py-2 capitalize">{c.type}</td>
                            <td className="px-3 py-2 capitalize">{c.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={addSelectedToList} disabled={selectedContactIds.size === 0} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-brand-navy px-3 py-2 text-xs font-semibold text-white hover:bg-brand-navy-light disabled:opacity-60">
                    <Users className="h-3.5 w-3.5" /> Add Selected Contacts
                  </button>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Current Members</p>
                  <div className="max-h-[260px] overflow-auto rounded-xl border border-gray-100">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Contact</th>
                          <th className="px-3 py-2 text-left">Email</th>
                          <th className="px-3 py-2 text-left">Type</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.id} className="border-t border-gray-50">
                            <td className="px-3 py-2">{m.first_name} {m.last_name}</td>
                            <td className="px-3 py-2">{m.email || '—'}</td>
                            <td className="px-3 py-2 capitalize">{m.type}</td>
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => removeMember(m.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                            </td>
                          </tr>
                        ))}
                        {members.length === 0 && (
                          <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-500">No members in this list yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* Share list modal */}
      {shareListId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShareListId(null)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800">Share List</h3>
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search users by name..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
            <div className="max-h-[260px] overflow-auto space-y-1">
              {allUsers
                .filter((u) => u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
                .map((u) => (
                  <label key={u.id} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedShareIds.has(u.id)}
                      onChange={(e) => {
                        setSelectedShareIds((prev) => {
                          const next = new Set(prev)
                          if (e.target.checked) next.add(u.id)
                          else next.delete(u.id)
                          return next
                        })
                      }}
                      className="rounded"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-500">{u.email}</p>
                    </div>
                  </label>
                ))}
              {allUsers.length === 0 && <p className="text-xs text-gray-500 text-center py-4">No users found.</p>}
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => setShareListId(null)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button
                disabled={savingShares}
                onClick={async () => {
                  setSavingShares(true)
                  try {
                    await apiFetch(`/api/contacts/lists/${shareListId}/shares`, {
                      method: 'PUT',
                      body: JSON.stringify({ userIds: Array.from(selectedShareIds) }),
                    })
                    setShareListId(null)
                  } catch (e: any) {
                    alert(e.message)
                  } finally {
                    setSavingShares(false)
                  }
                }}
                className="flex-1 rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-light disabled:opacity-60"
              >
                {savingShares ? 'Saving...' : 'Save Sharing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
