import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Building2, Calendar, Check, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'

export interface BoardPackageItem {
  id: string
  title: string
  category: 'financial' | 'legal' | 'reference' | 'application'
  required: boolean
  status: 'pending' | 'received' | 'verified'
  notes?: string
}

const COOP_CHECKLIST: BoardPackageItem[] = [
  { id: '1', title: 'Completed Co-op Board Application Form', category: 'application', required: true, status: 'received' },
  { id: '2', title: 'Fully Executed Contract of Sale', category: 'legal', required: true, status: 'verified' },
  { id: '3', title: 'Signed REBNY Financial Statement & Net Worth Schedule', category: 'financial', required: true, status: 'verified' },
  { id: '4', title: 'Last 2 Years Federal Tax Returns (1040s + W2s / 1099s)', category: 'financial', required: true, status: 'received' },
  { id: '5', title: 'Last 3 Months Bank & Brokerage Asset Statements', category: 'financial', required: true, status: 'received' },
  { id: '6', title: 'Employer Salary & Employment Verification Letter', category: 'financial', required: true, status: 'pending' },
  { id: '7', title: '2 Personal Letters of Reference', category: 'reference', required: true, status: 'received' },
  { id: '8', title: '2 Professional Letters of Reference', category: 'reference', required: true, status: 'pending' },
  { id: '9', title: 'Current Landlord / Managing Agent Reference Letter', category: 'reference', required: false, status: 'pending' },
  { id: '10', title: 'Bank Loan Commitment Letter & Certified Appraisal', category: 'financial', required: true, status: 'pending' },
  { id: '11', title: 'NYS Lead Paint & Agency Disclosures', category: 'legal', required: true, status: 'verified' },
  { id: '12', title: 'Signed House Rules & Lead Notification Acknowledgment', category: 'application', required: true, status: 'pending' },
]

const CONDO_CHECKLIST: BoardPackageItem[] = [
  { id: 'c1', title: 'Condo Purchase Application & Information Form', category: 'application', required: true, status: 'received' },
  { id: 'c2', title: 'Waiver of Right of First Refusal Application', category: 'legal', required: true, status: 'pending' },
  { id: 'c3', title: 'Fully Executed Contract of Sale', category: 'legal', required: true, status: 'verified' },
  { id: 'c4', title: 'Bank Loan Commitment Letter (if financed)', category: 'financial', required: false, status: 'pending' },
  { id: 'c5', title: 'Move-in / Move-out Deposit Agreement & Check', category: 'application', required: true, status: 'pending' },
  { id: 'c6', title: 'NYS Lead Paint & Property Condition Disclosures', category: 'legal', required: true, status: 'verified' },
]

export function BoardPackageTracker({ propertyType = 'Co-op' }: { propertyType?: string }) {
  const { id: txId } = useParams()
  const isCondo = /condo/i.test(propertyType)
  const defaultItems = isCondo ? CONDO_CHECKLIST : COOP_CHECKLIST
  const storageKey = `re_board_package_${txId || 'default'}`

  const [items, setItems] = useState<BoardPackageItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          return parsed.items
        }
      }
    } catch (e) {
      console.error(e)
    }
    return defaultItems
  })

  const [boardStatus, setBoardStatus] = useState<'prep' | 'submitted' | 'interview_scheduled' | 'approved' | 'declined'>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.boardStatus) return parsed.boardStatus
      }
    } catch (e) {}
    return 'prep'
  })

  const [interviewDate, setInterviewDate] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.interviewDate) return parsed.interviewDate
      }
    } catch (e) {}
    return ''
  })

  const [managingAgentFeePaid, setManagingAgentFeePaid] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.managingAgentFeePaid === 'boolean') return parsed.managingAgentFeePaid
      }
    } catch (e) {}
    return false
  })

  const [flipTaxPaid, setFlipTaxPaid] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (typeof parsed.flipTaxPaid === 'boolean') return parsed.flipTaxPaid
      }
    } catch (e) {}
    return false
  })

  const [newItemTitle, setNewItemTitle] = useState('')
  const [isAddingItem, setIsAddingItem] = useState(false)

  // Persist state changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        items,
        boardStatus,
        interviewDate,
        managingAgentFeePaid,
        flipTaxPaid,
      }))
    } catch (e) {
      console.error('Failed to save board package state', e)
    }
  }, [storageKey, items, boardStatus, interviewDate, managingAgentFeePaid, flipTaxPaid])

  const toggleStatus = (id: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item
      const nextStatus = item.status === 'pending' ? 'received' : item.status === 'received' ? 'verified' : 'pending'
      return { ...item, status: nextStatus }
    }))
  }

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setItems(prev => prev.filter(item => item.id !== id))
  }

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newItemTitle.trim()) return
    const newItem: BoardPackageItem = {
      id: `custom_${Date.now()}`,
      title: newItemTitle.trim(),
      category: 'application',
      required: true,
      status: 'pending'
    }
    setItems(prev => [...prev, newItem])
    setNewItemTitle('')
    setIsAddingItem(false)
  }

  const completedCount = items.filter(i => i.status === 'verified').length
  const receivedCount = items.filter(i => i.status === 'received').length
  const progress = items.length > 0 ? Math.round(((completedCount + receivedCount * 0.5) / items.length) * 100) : 0

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700 font-bold">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900">
                NYC {isCondo ? 'Condo Waiver' : 'Co-op Board Package'} Tracker
              </h3>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                {isCondo ? 'Condominium' : 'Cooperative'}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              REBNY financial package, managing agent submission & board interview progress
            </p>
          </div>
        </div>

        {/* Board Status Pill Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase">Board Status:</span>
          <select
            value={boardStatus}
            onChange={(e) => setBoardStatus(e.target.value as any)}
            className={clsx(
              'text-xs font-bold px-3 py-1.5 rounded-xl border focus:outline-none transition-colors cursor-pointer shadow-2xs',
              boardStatus === 'approved' && 'bg-emerald-50 text-emerald-700 border-emerald-300',
              boardStatus === 'interview_scheduled' && 'bg-purple-50 text-purple-700 border-purple-300',
              boardStatus === 'submitted' && 'bg-blue-50 text-blue-700 border-blue-300',
              boardStatus === 'prep' && 'bg-amber-50 text-amber-800 border-amber-300',
              boardStatus === 'declined' && 'bg-rose-50 text-rose-700 border-rose-300'
            )}
          >
            <option value="prep">In Preparation</option>
            <option value="submitted">Submitted to Managing Agent</option>
            {!isCondo && <option value="interview_scheduled">Board Interview Scheduled</option>}
            <option value="approved">{isCondo ? 'Waiver Issued' : 'Approved by Board'}</option>
            <option value="declined">Declined</option>
          </select>
        </div>
      </div>

      {/* Progress Bar & Key NYC Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-bold text-gray-600 uppercase">Dossier Readiness</span>
            <span className="text-xs font-bold text-purple-600">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="bg-purple-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-gray-500 mt-2 font-medium">
            {completedCount} verified, {receivedCount} received of {items.length} items
          </p>
        </div>

        <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100">
          <span className="text-xs font-bold text-gray-600 uppercase">
            {isCondo ? 'Waiver Expected' : 'Board Interview Date'}
          </span>
          <div className="flex items-center gap-2 mt-1.5 text-xs font-semibold text-gray-800">
            <Calendar className="h-4 w-4 text-purple-500 flex-shrink-0" />
            <input
              type="datetime-local"
              value={interviewDate}
              onChange={(e) => setInterviewDate(e.target.value)}
              className="bg-white border border-gray-200 rounded px-2 py-1 focus:outline-none text-xs font-medium text-gray-800 w-full"
            />
          </div>
          <p className="text-[10px] text-emerald-600 font-semibold mt-1">
            {interviewDate ? 'Scheduled with Managing Agent' : 'Pending Scheduling'}
          </p>
        </div>

        <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100 flex flex-col justify-between">
          <span className="text-xs font-bold text-gray-600 uppercase">Building Fees & Flip Tax</span>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={managingAgentFeePaid}
                onChange={(e) => setManagingAgentFeePaid(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span className="text-[11px] font-semibold text-gray-700">App Fee Paid</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={flipTaxPaid}
                onChange={(e) => setFlipTaxPaid(e.target.checked)}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span className="text-[11px] font-semibold text-gray-700">Flip Tax Confirmed</span>
            </label>
          </div>
        </div>
      </div>

      {/* Checklist Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
            Required Document Dossier ({items.length} Items)
          </h4>
          <button
            type="button"
            onClick={() => setIsAddingItem(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-lg transition-colors border border-purple-200 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Item</span>
          </button>
        </div>

        {isAddingItem && (
          <form onSubmit={handleAddItem} className="flex gap-2 items-center p-3 bg-purple-50/50 border border-purple-200 rounded-xl">
            <input
              type="text"
              value={newItemTitle}
              onChange={(e) => setNewItemTitle(e.target.value)}
              placeholder="e.g., Landlord Pet Rider, Guarantor Form, etc."
              autoFocus
              className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button
              type="submit"
              disabled={!newItemTitle.trim()}
              className="px-3 py-1.5 text-xs font-bold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setIsAddingItem(false); setNewItemTitle('') }}
              className="px-2 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </form>
        )}

        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden shadow-2xs">
          {items.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleStatus(item.id)}
              className="flex items-center justify-between p-3.5 hover:bg-gray-50/80 transition-colors cursor-pointer group select-none"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={clsx(
                  'h-6 w-6 rounded-lg flex items-center justify-center text-xs transition-colors flex-shrink-0',
                  item.status === 'verified' && 'bg-emerald-100 text-emerald-700 font-bold',
                  item.status === 'received' && 'bg-blue-100 text-blue-700 font-bold',
                  item.status === 'pending' && 'bg-gray-100 text-gray-400 group-hover:bg-gray-200'
                )}>
                  {item.status === 'verified' ? <Check className="h-3.5 w-3.5" /> : item.status === 'received' ? '•' : ''}
                </div>
                <span className={clsx(
                  'text-xs font-medium truncate',
                  item.status === 'verified' ? 'text-gray-900 font-semibold' : 'text-gray-700'
                )}>
                  {item.title}
                </span>
                {item.required && (
                  <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100 flex-shrink-0">
                    Mandatory
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={clsx(
                  'text-[10px] font-bold px-2 py-0.5 rounded-md capitalize',
                  item.status === 'verified' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
                  item.status === 'received' && 'bg-blue-50 text-blue-700 border border-blue-200',
                  item.status === 'pending' && 'bg-gray-50 text-gray-500 border border-gray-200'
                )}>
                  {item.status}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleDeleteItem(item.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 p-1 transition-opacity"
                  title="Remove item"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
