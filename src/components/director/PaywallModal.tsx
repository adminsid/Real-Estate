import { useState } from 'react'
import { X, Lock, Zap } from 'lucide-react'

interface PaywallModalProps {
  open: boolean
  onClose: () => void
  quotaUsed: number
  quotaTotal: number
  onSubmitRequest: (pack: '1_slot' | '5_pack') => Promise<void>
}

const PACKS = [
  {
    id: '1_slot',
    name: '1 Project Slot',
    price: 25,
    description: 'Unlock one additional lifetime project.',
    icon: Zap,
  },
  {
    id: '5_pack',
    name: '5 Project Pack',
    price: 100,
    description: 'Best value. Unlock five additional lifetime projects.',
    icon: Zap,
  },
] as const

export function PaywallModal({
  open,
  onClose,
  quotaUsed,
  quotaTotal,
  onSubmitRequest,
}: PaywallModalProps) {
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  async function handleSubmit(pack: '1_slot' | '5_pack') {
    setSubmitting(pack)
    setError('')
    try {
      await onSubmitRequest(pack)
      setSubmitted(true)
    } catch (e: any) {
      setError(e?.message || 'Failed to submit request. Please try again.')
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-card border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Project Quota Reached</h3>
              <p className="text-xs text-gray-500">DIRECTOR.EXE lifetime limit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {submitted ? (
            <div className="text-center py-6">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl font-bold mb-3">
                OK
              </div>
              <h4 className="font-bold text-gray-900 mb-1">Request Submitted</h4>
              <p className="text-sm text-gray-500">
                An admin will review your unlock request. You'll be able to create new projects once it's approved.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-brand-navy text-white text-sm font-semibold rounded-xl hover:opacity-90"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <p className="text-sm text-gray-700">
                  You've used <span className="font-bold text-gray-900">{quotaUsed}</span> of{' '}
                  <span className="font-bold text-gray-900">{quotaTotal}</span> lifetime project slots.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Archive completed projects to declutter, or unlock additional slots below.
                </p>
              </div>

              <div className="space-y-3">
                {PACKS.map((pack) => {
                  const PackIcon = pack.icon
                  return (
                    <button
                      key={pack.id}
                      onClick={() => handleSubmit(pack.id)}
                      disabled={submitting !== null}
                      className="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-brand-navy hover:bg-gray-50 transition-colors text-left disabled:opacity-60"
                    >
                      <div className="p-2 bg-brand-navy/5 rounded-lg text-brand-navy">
                        <PackIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{pack.name}</p>
                        <p className="text-xs text-gray-500">{pack.description}</p>
                      </div>
                      <span className="font-bold text-brand-navy text-lg">${pack.price}</span>
                    </button>
                  )
                })}
              </div>

              {error && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              )}

              <p className="mt-4 text-[11px] text-gray-400 text-center">
                One-click unlock request. An admin approves and unlocks your slots after payment.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
