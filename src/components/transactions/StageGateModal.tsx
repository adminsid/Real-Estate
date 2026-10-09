import { useState, useEffect } from 'react'
import { AlertCircle, ShieldCheck, X, Loader2, Calendar } from 'lucide-react'
import { getStageByStatus } from '@/constants/pipeline'
import { getLocalDateString } from '@/utils/date'

export interface StageGateMilestones {
  escrowDate?: string
  inspectionDeadline?: string
  appraisalDate?: string
  attorneyReviewStartDate?: string
  boardSubmissionDate?: string
  walkthroughDate?: string
  closingDate?: string
}

interface StageGateModalProps {
  isOpen: boolean
  workflowKey?: string
  targetStage: string
  transactionName: string
  onClose: () => void
  onSubmit: (milestones: StageGateMilestones) => void
  initialValues?: StageGateMilestones
}

export function StageGateModal({
  isOpen,
  targetStage,
  workflowKey,
  transactionName,
  onClose,
  onSubmit,
  initialValues,
}: StageGateModalProps) {
  const [escrowDate, setEscrowDate] = useState(initialValues?.escrowDate || '')
  const [inspectionDeadline, setInspectionDeadline] = useState(initialValues?.inspectionDeadline || '')
  const [appraisalDate, setAppraisalDate] = useState(initialValues?.appraisalDate || '')
  const [attorneyReviewStartDate, setAttorneyReviewStartDate] = useState(initialValues?.attorneyReviewStartDate || '')
  const [boardSubmissionDate, setBoardSubmissionDate] = useState(initialValues?.boardSubmissionDate || '')
  const [walkthroughDate, setWalkthroughDate] = useState(initialValues?.walkthroughDate || '')
  const [closingDate, setClosingDate] = useState(initialValues?.closingDate || '')
  const [wireConfirmed, setWireConfirmed] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && initialValues) {
      setEscrowDate(initialValues.escrowDate || '')
      setInspectionDeadline(initialValues.inspectionDeadline || '')
      setAppraisalDate(initialValues.appraisalDate || '')
      setAttorneyReviewStartDate(initialValues.attorneyReviewStartDate || '')
      setBoardSubmissionDate(initialValues.boardSubmissionDate || '')
      setWalkthroughDate(initialValues.walkthroughDate || '')
      setClosingDate(initialValues.closingDate || '')
      setError('')
    }
  }, [isOpen, initialValues])

  if (!isOpen) return null

  const stageMeta = getStageByStatus(targetStage)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const effectiveClosingDate = targetStage === 'closed'
      ? (closingDate || getLocalDateString())
      : (closingDate || undefined)

    setIsSubmitting(true)
    onSubmit({
      escrowDate: escrowDate || undefined,
      inspectionDeadline: inspectionDeadline || undefined,
      appraisalDate: appraisalDate || undefined,
      attorneyReviewStartDate: attorneyReviewStartDate || undefined,
      boardSubmissionDate: boardSubmissionDate || undefined,
      walkthroughDate: walkthroughDate || undefined,
      closingDate: effectiveClosingDate || undefined,
    })
    setIsSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Stage-Gate Compliance Validation</h3>
              <p className="text-xs text-amber-900/80 font-medium">
                Moving to: <span className="font-bold underline">{stageMeta.label}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-blue-900">
              <Calendar className="h-3.5 w-3.5" />
              {targetStage === 'contract_out' && 'Contract Out Milestone Verification'}
              {targetStage === 'under_contract' && workflowKey !== 'lease_v1' && 'Mandatory Escrow & Inspection Gates'}
              {targetStage === 'board_package' && 'Board Package & Financing Milestone Gates'}
              {targetStage === 'closing_prep' && 'Closing Preparation & Walkthrough Gate'}
              {targetStage === 'closed' && 'Final Closing & Settlement Gate'}
              {!['contract_out', 'under_contract', 'board_package', 'closing_prep', 'closed'].includes(targetStage) && 'Stage Compliance Requirement'}
            </p>
            <p className="text-blue-700 leading-relaxed">
              {targetStage === 'contract_out' && `To transition "${transactionName}" to Contract Out, verify that the deal sheet was distributed and enter the attorney review commencement date.`}
              {targetStage === 'under_contract' && workflowKey !== 'lease_v1' && `To transition "${transactionName}" to In Contract, this workflow requires the recorded escrow deposit and inspection contingency dates.`}
              {targetStage === 'board_package' && `To transition "${transactionName}" to Board Package & Loan, set the target Co-op / Condo board submission deadline and mortgage commitment date.`}
              {targetStage === 'closing_prep' && `To transition "${transactionName}" to Closing Prep, verify the buyer final walkthrough inspection schedule.`}
              {targetStage === 'closed' && `To mark "${transactionName}" as Closed & Settled, record the official settlement date for commission disbursement (CDA).`}
              {!['contract_out', 'under_contract', 'board_package', 'closing_prep', 'closed'].includes(targetStage) && `Verify key timeline dates to advance "${transactionName}" to ${stageMeta.label}.`}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl animate-in fade-in">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Stage-Specific Fields */}
          {targetStage === 'contract_out' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Attorney Review / Deal Sheet Sent Date <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={attorneyReviewStartDate}
                  onChange={(e) => setAttorneyReviewStartDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Inspection Contingency Deadline <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={inspectionDeadline}
                  onChange={(e) => setInspectionDeadline(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
            </div>
          )}

          {targetStage === 'under_contract' && workflowKey !== 'lease_v1' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  10% Escrow Deposit Date <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={escrowDate}
                  onChange={(e) => setEscrowDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Inspection Contingency Deadline <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={inspectionDeadline}
                  onChange={(e) => setInspectionDeadline(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Appraisal Contingency Date <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={appraisalDate}
                  onChange={(e) => setAppraisalDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
            </div>
          )}

          {targetStage === 'board_package' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Target Board Package Submission Deadline <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={boardSubmissionDate}
                  onChange={(e) => setBoardSubmissionDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Mortgage Commitment Deadline <span className="text-gray-400 font-normal">(Optional if Financed)</span>
                </label>
                <input
                  type="date"
                  value={appraisalDate}
                  onChange={(e) => setAppraisalDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
            </div>
          )}

          {targetStage === 'closing_prep' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Final Walkthrough Inspection Date <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={walkthroughDate}
                  onChange={(e) => setWalkthroughDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Target Closing Date <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
            </div>
          )}

          {targetStage === 'closed' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Actual Closing / Settlement Date <span className="text-gray-400 font-normal">(Optional — defaults to today)</span>
                </label>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <label className="flex items-center gap-2 text-xs font-semibold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wireConfirmed}
                    onChange={(e) => setWireConfirmed(e.target.checked)}
                    className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Deed delivered & settlement wire / escrow confirmed</span>
                </label>
              </div>
            </div>
          )}

          {!['contract_out', 'under_contract', 'board_package', 'closing_prep', 'closed'].includes(targetStage) && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Milestone Effective Date <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={escrowDate || attorneyReviewStartDate || closingDate || getLocalDateString()}
                  onChange={(e) => setEscrowDate(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-md transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Validate & Advance Stage
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}