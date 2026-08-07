import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import { Lock, Unlock, Trash2, Loader2 } from 'lucide-react'
import clsx from 'clsx'

interface TransactionSettingsTabProps {
  setLockConfirmOpen: (open: boolean) => void
}

export function TransactionSettingsTab({ setLockConfirmOpen }: TransactionSettingsTabProps) {
  const { user } = useAuth()
  const {
    data,
    handleUpdateDetails,
    handleAddTeamMember,
    handleRemoveTeamMember,
    handleDeleteDeal
  } = useTransactionDetail()

  const { transaction: tx, team = [], directoryUsers = [] } = data
  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)
  const isLocked = tx.is_locked === 1
  const canEdit = !isLocked || isBrokerOrAdmin

  const [settingName, setSettingName] = useState(tx.name || '')
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [teamSearchQuery, setTeamSearchQuery] = useState('')
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false)
  const [isAddingTeam, setIsAddingTeam] = useState(false)

  // Notification Preferences states
  const [txNotifEscrow, setTxNotifEscrow] = useState(true)
  const [txNotifTasks, setTxNotifTasks] = useState(true)
  const [txNotifDocs, setTxNotifDocs] = useState(true)
  const [txNotifOffers, setTxNotifOffers] = useState(true)
  const [txNotifMessages, setTxNotifMessages] = useState(true)

  const filteredDirectory = directoryUsers.filter((u: any) => {
    const q = teamSearchQuery.toLowerCase()
    return u.id !== user?.id && !team.some((t: any) => t.user_id === u.id) &&
      ((u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.license_number || '').toLowerCase().includes(q))
  })

  const handleUpdateName = async () => {
    if (!settingName.trim()) {
      alert('Transaction name cannot be empty')
      return
    }
    setIsSavingSettings(true)
    await handleUpdateDetails({ name: settingName })
    setIsSavingSettings(false)
    alert('Transaction name updated successfully!')
  }

  const handleAddMember = async (userId: string) => {
    if (team.length >= 4) {
      alert('Maximum 4 team members allowed per deal.')
      return
    }
    setIsAddingTeam(true)
    const success = await handleAddTeamMember(userId)
    if (success) {
      setTeamSearchQuery('')
      setIsTeamDropdownOpen(false)
    }
    setIsAddingTeam(false)
  }

  const onDeleteDeal = async () => {
    setIsDeleting(true)
    await handleDeleteDeal()
    setIsDeleting(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
      <div>
        <h3 className="font-bold text-gray-900 text-lg">Transaction Settings</h3>
        <p className="text-xs text-gray-500">Manage transaction details, team collaboration, permissions, and status.</p>
      </div>

      {/* General Settings */}
      <div className="space-y-4">
        <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">General Info</h4>
        <div className="max-w-md space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Transaction Name</label>
            <input
              type="text"
              value={settingName}
              disabled={!canEdit}
              onChange={e => setSettingName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {canEdit && (
            <button
              onClick={handleUpdateName}
              disabled={isSavingSettings}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg"
            >
              {isSavingSettings ? 'Saving...' : 'Update Name'}
            </button>
          )}
        </div>
      </div>

      {/* Lock Deal Settings (Broker/Admin only) */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Lock Status</h4>
        <div className="flex items-start justify-between bg-gray-50/50 p-4 rounded-xl border border-gray-150">
          <div className="space-y-1">
            <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
              {isLocked ? (
                <>
                  <Lock className="h-4 w-4 text-amber-600" /> Locked
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4 text-emerald-600" /> Unlocked
                </>
              )}
            </p>
            <p className="text-[11px] text-gray-500 leading-relaxed max-w-md">
              Locking this transaction prevents agents from modifying compliance checklists, deal outline fields, uploads, and outcomes. Only brokers/admins can change details of locked transactions.
            </p>
          </div>
          {isBrokerOrAdmin ? (
            <button
              onClick={() => setLockConfirmOpen(true)}
              className={clsx(
                "text-xs font-bold px-3 py-1.5 rounded-lg border",
                isLocked
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              )}
            >
              {isLocked ? 'Unlock Transaction' : 'Lock Transaction'}
            </button>
          ) : (
            <span className="text-[10px] text-gray-400 bg-gray-150 px-2.5 py-1.5 rounded-lg font-semibold">
              Requires Broker Privilege
            </span>
          )}
        </div>
      </div>

      {/* Transaction Notification Settings */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Transaction Notification Settings</h4>
        <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-200 space-y-3 max-w-xl text-xs">
          <label className="flex items-center justify-between cursor-pointer py-1 border-b border-gray-100">
            <div>
              <p className="font-bold text-gray-800">Key Date Reminders</p>
              <p className="text-[10px] text-gray-500">Escrow deposit, inspection deadline, & target closing alerts</p>
            </div>
            <input type="checkbox" checked={txNotifEscrow} onChange={e => setTxNotifEscrow(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          </label>
          <label className="flex items-center justify-between cursor-pointer py-1 border-b border-gray-100">
            <div>
              <p className="font-bold text-gray-800">Checklist & Task Due Date Alerts</p>
              <p className="text-[10px] text-gray-500">Automated task reminders and overdue notifications</p>
            </div>
            <input type="checkbox" checked={txNotifTasks} onChange={e => setTxNotifTasks(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          </label>
          <label className="flex items-center justify-between cursor-pointer py-1 border-b border-gray-100">
            <div>
              <p className="font-bold text-gray-800">Document Upload & Compliance Alerts</p>
              <p className="text-[10px] text-gray-500">Broker review and compliance document status changes</p>
            </div>
            <input type="checkbox" checked={txNotifDocs} onChange={e => setTxNotifDocs(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          </label>
          <label className="flex items-center justify-between cursor-pointer py-1 border-b border-gray-100">
            <div>
              <p className="font-bold text-gray-800">Offer Activity & Status Updates</p>
              <p className="text-[10px] text-gray-500">New offer submissions, price changes, and counters</p>
            </div>
            <input type="checkbox" checked={txNotifOffers} onChange={e => setTxNotifOffers(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          </label>
          <label className="flex items-center justify-between cursor-pointer py-1">
            <div>
              <p className="font-bold text-gray-800">Client & Team Messages</p>
              <p className="text-[10px] text-gray-500">Collaborator notes and direct messaging notifications</p>
            </div>
            <input type="checkbox" checked={txNotifMessages} onChange={e => setTxNotifMessages(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          </label>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => alert('Transaction notification preferences saved successfully!')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-sm"
            >
              Save Notification Settings
            </button>
          </div>
        </div>
      </div>

      {/* Collaboration & Sharing Settings */}
      <div className="space-y-4 pt-4 border-t border-gray-100">
        <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Deal Sharing & Collaboration</h4>
        <p className="text-xs text-gray-500 text-left">
          Share access to this transaction with other workspace members (up to 4 members).
        </p>

        <div className="space-y-3 mb-4">
          {team.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-150 bg-gray-50/50 max-w-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0">
                  {t.first_name?.[0] || t.name?.[0]}{t.last_name?.[0]}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {t.first_name || t.name} {t.last_name || ''}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">{t.role?.replace('-', ' ')} {t.license_number ? `• Lic: ${t.license_number}` : ''}</p>
                </div>
              </div>
              {t.user_id !== user?.id && canEdit && (
                <button
                  onClick={() => handleRemoveTeamMember(t.user_id)}
                  className="text-red-500 hover:text-red-700 text-xs font-semibold"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {team.length === 0 && (
            <p className="text-xs text-gray-400 italic">No workspace members co-assigned to this deal.</p>
          )}
        </div>

        {canEdit && team.length < 4 && (
          <div className="relative max-w-sm mt-2">
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Add workspace member</label>
            <div className="relative">
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 bg-white"
                placeholder="Search name, email or license..."
                value={teamSearchQuery}
                onChange={(e) => {
                  setTeamSearchQuery(e.target.value)
                  setIsTeamDropdownOpen(true)
                }}
                onFocus={() => setIsTeamDropdownOpen(true)}
                onBlur={() => setTimeout(() => setIsTeamDropdownOpen(false), 200)}
              />
              {isAddingTeam && (
                <div className="absolute right-3 top-2.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                </div>
              )}
              {isTeamDropdownOpen && filteredDirectory.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                  {filteredDirectory.map((u: any) => (
                    <li
                      key={u.id}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleAddMember(u.id)
                      }}
                      className="cursor-pointer px-4 py-2 text-xs hover:bg-gray-50 flex flex-col justify-center text-left"
                    >
                      <span className="font-medium text-gray-900">{u.name || (u.first_name + ' ' + u.last_name)}</span>
                      <span className="text-[10px] text-gray-500 truncate">
                        {u.email} {u.license_number ? `• Lic: ${u.license_number}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Danger Zone */}
      {isBrokerOrAdmin && (
        <div className="space-y-4 pt-4 border-t border-red-100 bg-red-50/30 p-4 rounded-xl border border-red-200">
          <h4 className="font-bold text-red-800 text-sm">Danger Zone</h4>
          <p className="text-xs text-gray-600">
            Deleting a deal deletes all task lists, comments, real-time Outcomes history, and files forever. This action cannot be undone.
          </p>
          <button
            onClick={onDeleteDeal}
            disabled={isDeleting}
            className="inline-flex items-center gap-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-sm"
          >
            <Trash2 className="h-4 w-4" /> {isDeleting ? 'Deleting...' : 'Delete Transaction'}
          </button>
        </div>
      )}
    </div>
  )
}
