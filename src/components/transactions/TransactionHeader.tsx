import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import {
  ArrowLeft, Lock, ChevronDown, ChevronRight, Printer, Mail, Edit3, CheckCircle2, ExternalLink
} from 'lucide-react'
import clsx from 'clsx'
import { DealFailureModal } from './TransactionModals'

interface TransactionHeaderProps {
  setIsEditOpen: (open: boolean) => void
  setStageGateTarget: (stage: string | null) => void
  setEmailModalOpen: (open: boolean) => void
  setEmailSubject: (subject: string) => void
  setEmailBody: (body: string) => void
  setSelectedRecipients: (recipients: string[]) => void
}

export function TransactionHeader({
  setIsEditOpen,
  setStageGateTarget,
  setEmailModalOpen,
  setEmailSubject,
  setEmailBody,
  setSelectedRecipients
}: TransactionHeaderProps) {
  const { user } = useAuth()
  const { data, handleUpdateDetails } = useTransactionDetail()
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [isFailureOpen, setIsFailureOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const { transaction: tx, tasks, listing } = data
  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)
  const isLocked = tx.is_locked === 1
  const canEdit = !isLocked || isBrokerOrAdmin

  const DEAL_STAGES = ['New Lead', 'Listed', 'Offer Received', 'Under Contract', 'Inspection', 'Closed'] as const
  type DealStage = typeof DEAL_STAGES[number]

  const getStageFromStatus = (status: string): DealStage => {
    if (status === 'closed') return 'Closed'
    if (status === 'under_contract') return 'Under Contract'
    if (status === 'offer_received') return 'Offer Received'
    if (status === 'active') return 'Listed'
    if (status === 'lead') return 'New Lead'
    return 'New Lead'
  }

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const getPartyRecipients = () => {
    const list: Array<{ name: string; email: string; role: string }> = []
    if (tx.parties_involved) {
      try {
        const outline = JSON.parse(tx.parties_involved)
        if (outline.buyerName && outline.buyerEmail) {
          list.push({ name: outline.buyerName, email: outline.buyerEmail, role: 'Buyer' })
        }
        if (outline.sellerName && outline.sellerEmail) {
          list.push({ name: outline.sellerName, email: outline.sellerEmail, role: 'Seller' })
        }
      } catch { /* Ignore malformed saved party data. */ }
    }
    return list
  }

  const activeStage = getStageFromStatus(tx.status)
  const activeIdx = DEAL_STAGES.indexOf(activeStage)

  return (
    <>
      {isLocked && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2 no-print">
          <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span>This transaction is locked by a broker or administrator. Standard details, documents, and tasks cannot be modified by agents.</span>
        </div>
      )}

      {/* Top Navigation */}
      <div className="mb-4 no-print">
        {/* Row 1: Back + Address + Badges + Actions */}
        <div className="flex items-start justify-between gap-4 mb-3">
          {/* Left: Back + Address */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Link to="/transactions/pipeline" className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-gray-900 transition-colors shadow-sm bg-white border border-gray-200 flex-shrink-0 mt-0.5">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-gray-900 truncate max-w-[320px] md:max-w-[500px]" title={tx.name}>
                  {tx.name}
                </h1>
                {/* Status pill dropdown */}
                <select
                  value={tx.status}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const nextStage = e.target.value
                    if (nextStage === 'under_contract' || nextStage === 'closed') {
                      setStageGateTarget(nextStage)
                    } else if (nextStage === 'fallen_through') {
                      setIsFailureOpen(true)
                    } else {
                      handleUpdateDetails({ status: nextStage })
                    }
                  }}
                  className={clsx(
                    "px-2.5 py-1 rounded-full text-xs font-bold border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer",
                    tx.status === 'active' ? "bg-blue-100 text-blue-700 border-blue-200" :
                    tx.status === 'offer_received' ? "bg-purple-100 text-purple-700 border-purple-200" :
                    tx.status === 'under_contract' ? "bg-amber-100 text-amber-700 border-amber-200" :
                    tx.status === 'closed' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                    tx.status === 'fallen_through' ? "bg-red-100 text-red-700 border-red-200" :
                    "bg-gray-100 text-gray-700 border-gray-200"
                  )}
                >
                  <option value="lead">Lead</option>
                  <option value="active">Active</option>
                  <option value="offer_received">Offer Received</option>
                  <option value="under_contract">Under Contract</option>
                  <option value="closed">Closed</option>
                  <option value="fallen_through">Fallen Through</option>
                </select>
                {/* Type badge */}
                <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                  {tx.type}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {tx.inventory_listing_id && (
                  <Link
                    to={`/inventory/listings/${tx.inventory_listing_id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {listing?.name || listing?.address || `Listing ${tx.inventory_listing_id.slice(0, 8)}`}
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Right: Completion donut + Export dropdown + Edit button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Deal Completion Donut */}
            {(() => {
              const total = tasks?.length || 0
              const done = tasks?.filter((t: any) => t.status === 'completed').length || 0
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              const r = 16, c = 2 * Math.PI * r
              return (
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-sm" title={`${done}/${total} tasks done`}>
                  <svg width="36" height="36" className="rotate-[-90deg]">
                    <circle cx="18" cy="18" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
                    <circle
                      cx="18" cy="18" r={r}
                      fill="none"
                      stroke={pct === 100 ? '#10b981' : '#3b82f6'}
                      strokeWidth="3.5"
                      strokeDasharray={`${(pct / 100) * c} ${c}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-xs font-bold text-gray-700">{pct}%</span>
                </div>
              )
            })()}

            {/* Export Dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setExportDropdownOpen(o => !o)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 shadow-sm text-gray-700"
              >
                <Printer className="h-4 w-4" />
                Export
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {exportDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-40 overflow-hidden">
                  <button
                    onClick={() => {
                      const prevTitle = document.title;
                      document.title = `Deal_Outline_${(tx.name || 'Transaction').replace(/\s+/g, '_')}`;
                      document.body.classList.add('print-active-deal-sheet');
                      window.print();
                      setTimeout(() => {
                        document.title = prevTitle;
                        document.body.classList.remove('print-active-deal-sheet');
                      }, 1000);
                      setExportDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <Printer className="h-4 w-4 text-gray-500" /> Print Outline
                  </button>
                  <button
                    onClick={() => {
                      const partyList = getPartyRecipients()
                      setSelectedRecipients(partyList.map(p => p.email))
                      setEmailSubject(`Deal Outline: ${tx.name}`)
                      setEmailBody(`Hi,\n\nPlease review the deal outline details for: ${tx.name}\n\nStatus: ${tx.status}\nPrice: ${tx.price ? `$${tx.price.toLocaleString()}` : 'TBD'}\n\nBest regards,\n${user?.name || 'Prime America Real Estate'}`)
                      setEmailModalOpen(true)
                      setExportDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left border-t border-gray-100"
                  >
                    <Mail className="h-4 w-4 text-gray-500" /> Email to Parties
                  </button>
                </div>
              )}
            </div>

            {/* Edit Details CTA */}
            <button
              onClick={() => setIsEditOpen(true)}
              disabled={!canEdit}
              className="inline-flex items-center gap-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white border-0 px-4 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              <Edit3 className="h-4 w-4" /> Edit Details
            </button>
          </div>
        </div>

        {/* Row 2: Deal Stage Stepper Bar */}
        <div className="flex items-center bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2.5 overflow-x-auto gap-1">
          {DEAL_STAGES.map((stage, idx) => {
            const isActive = stage === activeStage
            const isPast = idx < activeIdx
            return (
              <div key={stage} className="flex items-center gap-1 flex-shrink-0">
                <div className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all",
                  isActive ? "bg-blue-600 text-white shadow-sm" :
                  isPast ? "bg-emerald-100 text-emerald-700" :
                  "text-gray-400"
                )}>
                  {isPast && <CheckCircle2 className="h-3 w-3" />}
                  {stage}
                </div>
                {idx < DEAL_STAGES.length - 1 && (
                  <ChevronRight className={clsx("h-3.5 w-3.5 flex-shrink-0", idx < activeIdx ? "text-emerald-400" : "text-gray-300")} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Print view formal title */}
      <div className="hidden print:block mb-8 border-b-2 border-gray-300 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Transaction Summary Sheet</h1>
        <p className="text-sm text-gray-500 mt-1">Prime America Real Estate Workspace</p>
      </div>

      <DealFailureModal
        isOpen={isFailureOpen}
        onClose={() => setIsFailureOpen(false)}
        onSubmit={async (reason, notes) => {
          await handleUpdateDetails({
            status: 'fallen_through',
            deal_failure_reason: reason,
            deal_failure_notes: notes
          })
          setIsFailureOpen(false)
        }}
      />
    </>
  )
}
