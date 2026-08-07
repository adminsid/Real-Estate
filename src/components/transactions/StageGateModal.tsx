import { useState, useEffect } from 'react'
import { AlertCircle, ShieldCheck, X, Loader2 } from 'lucide-react'


interface StageGateModalProps {
  isOpen: boolean
  targetStage: string
  transactionName: string
  onClose: () => void
  onSubmit: (milestones: { escrowDate?: string; inspectionDeadline?: string; appraisalDate?: string }) => void
  initialValues?: { escrowDate?: string; inspectionDeadline?: string; appraisalDate?: string }
}

export function StageGateModal({
  isOpen,
  targetStage,
  transactionName,
  onClose,
  onSubmit,
  initialValues,
}: StageGateModalProps) {
  const [escrowDate, setEscrowDate] = useState(initialValues?.escrowDate || '')
  const [inspectionDeadline, setInspectionDeadline] = useState(initialValues?.inspectionDeadline || '')
  const [appraisalDate, setAppraisalDate] = useState(initialValues?.appraisalDate || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen && initialValues) {
      setEscrowDate(initialValues.escrowDate || '')
      setInspectionDeadline(initialValues.inspectionDeadline || '')
      setAppraisalDate(initialValues.appraisalDate || '')
    }
  }, [isOpen, initialValues?.escrowDate, initialValues?.inspectionDeadline, initialValues?.appraisalDate])

  if (!isOpen) return null

  const isClosing = targetStage === 'closed'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!escrowDate) {
      setError('Escrow Deposit Date is required to advance this deal.')
      return
    }
    if (!inspectionDeadline) {
      setError('Inspection Contingency Deadline is required to advance this deal.')
      return
    }
    if (isClosing && !appraisalDate) {
      setError('Appraisal Contingency Date is required before closing a deal.')
      return
    }

    setIsSubmitting(true)
    setError('')
    onSubmit({
      escrowDate,
      inspectionDeadline,
      appraisalDate,
    })
    setIsSubmitting(false)
  }

  const formatStageName = (s: string) => {
    if (s === 'under_contract') return 'Under Contract'
    if (s === 'closed') return 'Closed'
    return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-gray-200 shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-amber-500/10 border-b border-amber-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">Stage-Gate Compliance Validation</h3>
              <p className="text-xs text-amber-900/80 font-medium">Stage Transition: Moving to <span className="font-bold underline">{formatStageName(targetStage)}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/50">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800">
            <p className="font-semibold mb-0.5">Mandatory Milestone Gate Required:</p>
            <p className="text-blue-700">
              To transition <strong>"{transactionName}"</strong> to {formatStageName(targetStage)}, Prime America workflow rules require
              {isClosing ? ' escrow, inspection, and appraisal compliance dates.' : ' verified escrow and inspection compliance dates.'}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Escrow Deposit Date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={escrowDate}
                onChange={(e) => setEscrowDate(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Inspection Contingency Deadline <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required
                value={inspectionDeadline}
                onChange={(e) => setInspectionDeadline(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Appraisal Contingency Date <span className={isClosing ? 'text-red-500' : 'text-gray-400 font-normal'}>{isClosing ? '*' : '(Optional)'}</span>
            </label>
            <div className="relative">
              <input
                type="date"
                required={isClosing}
                value={appraisalDate}
                onChange={(e) => setAppraisalDate(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:outline-none"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel Stage Move
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-md transition-colors flex items-center gap-2"
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