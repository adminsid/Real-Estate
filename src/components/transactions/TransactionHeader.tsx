import { workflowPhases } from '@/domain/workflow-template'
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import {
  ArrowLeft, Lock, Unlock, Shield, ChevronDown, ChevronRight, Printer, Mail, Edit3, CheckCircle2
} from 'lucide-react'
import { STATUS_SELECT_OPTIONS, getStatusBadgeClass } from '@/constants/pipeline'
import clsx from 'clsx'
import { DealFailureModal } from './TransactionModals'

interface TransactionHeaderProps {
  setIsEditOpen: (open: boolean) => void
  setStageGateTarget: (stage: string | null) => void
  setEmailModalOpen: (open: boolean) => void
  setEmailSubject: (subject: string) => void
  setEmailBody: (body: string) => void
  setSelectedRecipients: (recipients: string[]) => void
  setIsCdaOpen?: (open: boolean) => void
  setIsOutlineEditOpen?: (open: boolean) => void
}

export function TransactionHeader({
  setIsEditOpen,
  setStageGateTarget: _setStageGateTarget,
  setEmailModalOpen,
  setEmailSubject,
  setEmailBody,
  setSelectedRecipients,
  setIsCdaOpen,
  setIsOutlineEditOpen,
}: TransactionHeaderProps) {
  const { user } = useAuth()
  const { data, handleUpdateDetails, handlePostOutcome } = useTransactionDetail()
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const [isFailureOpen, setIsFailureOpen] = useState(false)
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [isUnlocking, setIsUnlocking] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  const { transaction: tx } = data
  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)
  const isLocked = tx.is_locked === 1
  const canEdit = !isLocked || isBrokerOrAdmin

  // Calculate Statutory Retention Expiry Dates
  const isClosedOrArchived = tx.status === 'closed' || tx.status === 'archived'
  const closeDate = tx.actual_close_date || tx.closing_date || tx.target_close_date || tx.created_at

  let dosRetentionDate = ''
  let irsRetentionDate = ''
  if (closeDate) {
    const d1 = new Date(closeDate)
    d1.setFullYear(d1.getFullYear() + 3)
    dosRetentionDate = isNaN(d1.getTime()) ? '' : d1.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

    const d2 = new Date(closeDate)
    d2.setFullYear(d2.getFullYear() + 7)
    irsRetentionDate = isNaN(d2.getTime()) ? '' : d2.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleBrokerUnlock = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!unlockReason.trim() || isUnlocking) return
    setIsUnlocking(true)
    try {
      await handlePostOutcome(`[Broker Audit Log] Compliance lock temporarily released. Reason: ${unlockReason.trim()}`, true)
      await handleUpdateDetails({ is_locked: 0 })
      setIsUnlockModalOpen(false)
      setUnlockReason('')
    } finally {
      setIsUnlocking(false)
    }
  }

  // Stepper bar display labels — NYC-native 7 stages
  const ALL_DEAL_STAGES = ['Lead', 'Offer', 'Contract Out', 'In Contract', 'Board / Loan', 'Closing Prep', 'Closed'] as const
  const DEAL_STAGES = ALL_DEAL_STAGES.filter(stage => tx.workflow_key !== 'lease_v1' || stage !== 'Board / Loan')
  type DealStage = typeof ALL_DEAL_STAGES[number]

  const getStageFromStatus = (status: string): DealStage => {
    switch (status) {
      case 'lead':
        return 'Lead'
      case 'active':
      case 'offer_received':
        return 'Offer'
      case 'contract_out':
        return 'Contract Out'
      case 'under_contract':
        return 'In Contract'
      case 'board_package':
        return 'Board / Loan'
      case 'closing_prep':
        return 'Closing Prep'
      case 'closed':
        return 'Closed'
      default:
        return 'Lead'
    }
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
        <div className="mb-4 bg-amber-50/90 border border-amber-200 text-amber-900 p-3.5 rounded-2xl text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs no-print">
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 text-amber-700 flex-shrink-0" />
            <div>
              <span className="font-bold">Compliance Record Locked</span>
              <p className="text-[11px] text-amber-800 font-normal">
                This transaction is locked. Standard details, checklist tasks, and documents cannot be altered by agents without broker override.
              </p>
            </div>
          </div>
          {isBrokerOrAdmin && (
            <button
              type="button"
              onClick={() => setIsUnlockModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold bg-white hover:bg-amber-100/80 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
            >
              <Unlock className="h-3.5 w-3.5 text-amber-700" />
              <span>Unlock Record (Broker Override)</span>
            </button>
          )}
        </div>
      )}

      {/* Statutory Retention Compliance Banner (When Closed or Archived) */}
      {isClosedOrArchived && dosRetentionDate && (
        <div className="mb-4 bg-purple-50/90 border border-purple-200 text-purple-950 p-3.5 rounded-2xl text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs no-print">
          <div className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 text-purple-700 flex-shrink-0" />
            <div>
              <span className="font-bold">NYS DOS § 175.23 & IRS Statutory Retention Active</span>
              <p className="text-[11px] text-purple-800 font-medium">
                Mandatory 3-Year NYS DOS retention active through <strong>{dosRetentionDate}</strong> • 7-Year IRS Tax Audit retention active through <strong>{irsRetentionDate}</strong>.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-purple-100 text-purple-900 px-2.5 py-1 rounded-full border border-purple-300 whitespace-nowrap">
            🏛️ Statutory Vaulted
          </span>
        </div>
      )}

      {/* Broker Unlock Modal with Mandatory Audit Reason */}
      {isUnlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                <Unlock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Release Compliance Lock</h3>
                <p className="text-xs text-gray-500">Broker override audit logging requirement</p>
              </div>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              New York State brokerage regulations require an audit trail when modifying closed or vaulted transaction files. Please enter the reason for unlocking this transaction.
            </p>

            <form onSubmit={handleBrokerUnlock} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Reason for Unlocking Record <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={unlockReason}
                  onChange={(e) => setUnlockReason(e.target.value)}
                  placeholder="e.g., Adding delayed title insurance endorsement, attaching post-closing escrow disbursement receipt..."
                  rows={3}
                  required
                  autoFocus
                  className="w-full text-xs rounded-xl border border-gray-300 p-3 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => { setIsUnlockModalOpen(false); setUnlockReason('') }}
                  disabled={isUnlocking}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUnlocking || !unlockReason.trim()}
                  className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition-colors"
                >
                  {isUnlocking ? 'Logging & Unlocking...' : 'Unlock & Log to Audit Trail'}
                </button>
              </div>
            </form>
          </div>
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
                    if (nextStage === 'fallen_through') {
                      setIsFailureOpen(true)
                    } else {
                      handleUpdateDetails({
                        status: nextStage,
                        ...(nextStage === 'closed' && !tx.actual_close_date && {
                          actual_close_date: new Date().toISOString().slice(0, 10),
                        }),
                      })
                    }
                  }}
                  className={clsx(
                    "rounded-full px-2.5 py-1 text-xs font-bold border focus:outline-none transition-colors cursor-pointer",
                    getStatusBadgeClass(tx.status)
                  )}
                >
                  {STATUS_SELECT_OPTIONS.filter(s => workflowPhases(tx.workflow_key).includes(s.value)).map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                <span>Created {new Date(tx.created_at || Date.now()).toLocaleDateString()}</span>
                {tx.target_close_date && (
                  <>
                    <span>•</span>
                    <span className="font-semibold text-gray-700">Target Close: {tx.target_close_date}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Export Dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setExportDropdownOpen(o => !o)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 shadow-sm text-gray-700 cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                Export / Print
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {exportDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-gray-200 shadow-lg z-40 overflow-hidden">
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
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <Printer className="h-4 w-4 text-gray-500" /> Print Outline (Deal Sheet)
                  </button>
                  {setIsOutlineEditOpen && (
                    <button
                      onClick={() => {
                        setIsOutlineEditOpen(true);
                        setExportDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 text-left border-t border-gray-100"
                    >
                      <Edit3 className="h-4 w-4 text-blue-600" /> Edit Printable Deal Outline
                    </button>
                  )}
                  {setIsCdaOpen && (
                    <button
                      onClick={() => {
                        setIsCdaOpen(true);
                        setExportDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 text-left border-t border-gray-100"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Commission CDA Statement
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const partyList = getPartyRecipients()
                      setSelectedRecipients(partyList.map(p => p.email))
                      setEmailSubject(`Deal Outline: ${tx.name}`)
                      setEmailBody(`Hi,\n\nPlease review the deal outline details for: ${tx.name}\n\nStatus: ${tx.status}\nPrice: ${tx.price ? `$${tx.price.toLocaleString()}` : 'TBD'}\n\nBest regards,\n${user?.name || 'Prime America Real Estate'}`)
                      setEmailModalOpen(true)
                      setExportDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 text-left border-t border-gray-100"
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
              className="inline-flex items-center gap-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white border-0 px-4 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
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
