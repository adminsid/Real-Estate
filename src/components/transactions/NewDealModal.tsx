import { useState } from 'react'
import { X, Loader2, DollarSign, CalendarDays } from 'lucide-react'
import clsx from 'clsx'

interface NewDealModalProps {
  onClose: () => void
  onSuccess: () => void
}

export function NewDealModal({ onClose, onSuccess }: NewDealModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    type: 'sale',
    price: '',
    commission_amount: '',
    commission_rate: '',
    target_close_date: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        price: formData.price ? parseFloat(formData.price) : null,
        commission_amount: formData.commission_amount ? parseFloat(formData.commission_amount) : null,
        commission_rate: formData.commission_rate ? parseFloat(formData.commission_rate) : null,
        target_close_date: formData.target_close_date || null,
        parties: []
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        onSuccess()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to create transaction')
      }
    } catch (e) {
      console.error(e)
      alert('An error occurred while creating the deal')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Create New Deal</h2>
            <p className="text-xs text-gray-500">Add a new transaction to your pipeline</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form id="new-deal-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-5">

            {/* Deal Name */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Deal Name / Address *</label>
              <input
                required
                type="text"
                placeholder="e.g. 62-36 59th Drive, Unit B2, Maspeth"
                className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Type & Target Close Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Deal Type</label>
                <select
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white font-medium text-gray-800"
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="sale">Sale</option>
                  <option value="lease">Lease</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Target Close Date</label>
                <div className="relative">
                  <CalendarDays className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="date"
                    className="w-full rounded-xl border border-gray-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    value={formData.target_close_date}
                    onChange={e => setFormData({ ...formData, target_close_date: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Target Price */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Target Price ($)</label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  placeholder="0.00"
                  className="w-full rounded-xl border border-gray-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  value={formData.price}
                  onChange={e => {
                    const val = e.target.value
                    setFormData(prev => {
                      const priceVal = val ? parseFloat(val) : 0
                      const rateVal = prev.commission_rate ? parseFloat(prev.commission_rate) : 0
                      const commAmt = priceVal && rateVal ? String((priceVal * (rateVal / 100)).toFixed(2)) : prev.commission_amount
                      return { ...prev, price: val, commission_amount: commAmt }
                    })
                  }}
                />
              </div>
            </div>

            <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">After creating the deal, use Financials to classify prices, record the commission agreement, and allocate agent compensation.</p>

          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex justify-end gap-3 bg-gray-50 rounded-b-2xl mt-auto">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="new-deal-form"
            disabled={isSubmitting || !formData.name.trim()}
            className={clsx(
              "flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors shadow-sm",
              isSubmitting || !formData.name.trim() ? "opacity-60 cursor-not-allowed" : "hover:bg-blue-700"
            )}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Deal
          </button>
        </div>

      </div>
    </div>
  )
}
