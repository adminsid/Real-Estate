import { useState } from 'react'
import { useTransactionDetail } from './TransactionContext'
import { Lock, Unlock, Mail } from 'lucide-react'
import clsx from 'clsx'

interface EditDetailsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function EditDetailsModal({ isOpen, onClose }: EditDetailsModalProps) {
  const { data, handleUpdateDetails } = useTransactionDetail()
  const tx = data?.transaction

  const [editType, setEditType] = useState(tx?.type || 'sale')
  const [editPrice, setEditPrice] = useState(tx?.price || '')
  const [editCommAmount, setEditCommAmount] = useState(tx?.commission_amount || '')
  const [editCommRate, setEditCommRate] = useState(tx?.commission_rate || '')
  const [editCloseDate, setEditCloseDate] = useState(tx?.target_close_date || '')
  const [editActualCloseDate, setEditActualCloseDate] = useState(tx?.actual_close_date || '')
  const [editAgreementType, setEditAgreementType] = useState(tx?.agreement_type || '')
  const [editAgreementExpiry, setEditAgreementExpiry] = useState(tx?.agreement_expiration_date || '')

  // Overhauled business fields
  const [editEarnestMoneyAmount, setEditEarnestMoneyAmount] = useState(tx?.earnest_money_amount || '')
  const [editEarnestMoneyStatus, setEditEarnestMoneyStatus] = useState(tx?.earnest_money_status || 'pending')
  const [editEarnestMoneyNotes, setEditEarnestMoneyNotes] = useState(tx?.earnest_money_notes || '')
  const [editSplitBuyerPercent, setEditSplitBuyerPercent] = useState(tx?.commission_split_buyer_percent || '')
  const [editSplitCoBrokerPercent, setEditSplitCoBrokerPercent] = useState(tx?.commission_split_co_broker_percent || '')
  const [editSplitReferralPercent, setEditSplitReferralPercent] = useState(tx?.commission_split_referral_percent || '')
  const [editRepairCredit, setEditRepairCredit] = useState(tx?.repair_credit || '')
  const [editAttorneyReviewStartDate, setEditAttorneyReviewStartDate] = useState(tx?.attorney_review_start_date || '')
  const [editAttorneyReviewStatus, setEditAttorneyReviewStatus] = useState(tx?.attorney_review_status || 'pending')
  const [editDealFailureReason, setEditDealFailureReason] = useState(tx?.deal_failure_reason || '')
  const [editDealFailureNotes, setEditDealFailureNotes] = useState(tx?.deal_failure_notes || '')
  const [editPostOccupancyDeadline, setEditPostOccupancyDeadline] = useState(tx?.post_occupancy_deadline || '')
  const [editPostOccupancyDailyRate, setEditPostOccupancyDailyRate] = useState(tx?.post_occupancy_daily_rate || '')
  const [editPostOccupancyEscrowHeld, setEditPostOccupancyEscrowHeld] = useState(tx?.post_occupancy_escrow_held || '')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const success = await handleUpdateDetails({
      type: editType,
      price: editPrice ? parseFloat(String(editPrice)) : null,
      commission_amount: editCommAmount ? parseFloat(String(editCommAmount)) : null,
      commission_rate: editCommRate ? parseFloat(String(editCommRate)) : null,
      target_close_date: editCloseDate || null,
      actual_close_date: editActualCloseDate || null,
      agreement_type: editAgreementType || null,
      agreement_expiration_date: editAgreementExpiry || null,
      earnest_money_amount: editEarnestMoneyAmount ? parseFloat(String(editEarnestMoneyAmount)) : null,
      earnest_money_status: editEarnestMoneyStatus || 'pending',
      earnest_money_notes: editEarnestMoneyNotes || null,
      commission_split_buyer_percent: editSplitBuyerPercent ? parseFloat(String(editSplitBuyerPercent)) : null,
      commission_split_co_broker_percent: editSplitCoBrokerPercent ? parseFloat(String(editSplitCoBrokerPercent)) : null,
      commission_split_referral_percent: editSplitReferralPercent ? parseFloat(String(editSplitReferralPercent)) : null,
      repair_credit: editRepairCredit ? parseFloat(String(editRepairCredit)) : null,
      attorney_review_start_date: editAttorneyReviewStartDate || null,
      attorney_review_status: editAttorneyReviewStatus || 'pending',
      deal_failure_reason: editDealFailureReason || null,
      deal_failure_notes: editDealFailureNotes || null,
      post_occupancy_deadline: editPostOccupancyDeadline || null,
      post_occupancy_daily_rate: editPostOccupancyDailyRate ? parseFloat(String(editPostOccupancyDailyRate)) : null,
      post_occupancy_escrow_held: editPostOccupancyEscrowHeld ? parseFloat(String(editPostOccupancyEscrowHeld)) : null,
    })
    if (success) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 p-6 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">Edit Deal Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Core Info */}
          <div className="space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">Core Information</h3>
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">Type</label>
              <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Target Price ($)</label>
                <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Comm Rate (%)</label>
                <input type="number" step="0.01" value={editCommRate} onChange={e => setEditCommRate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Comm Fixed ($)</label>
                <input type="number" value={editCommAmount} onChange={e => setEditCommAmount(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Agreement Type</label>
                <input value={editAgreementType} onChange={e => setEditAgreementType(e.target.value)} placeholder="e.g. Exclusive Right to Sell" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Agreement Expiry</label>
                <input type="date" value={editAgreementExpiry} onChange={e => setEditAgreementExpiry(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Target Close Date</label>
                <input type="date" value={editCloseDate} onChange={e => setEditCloseDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Actual Close Date</label>
                <input type="date" value={editActualCloseDate} onChange={e => setEditActualCloseDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Escrow & EMD Ledger */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">Escrow Ledger & EMD</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Earnest Money Amount ($)</label>
                <input type="number" value={editEarnestMoneyAmount} onChange={e => setEditEarnestMoneyAmount(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">EMD Status</label>
                <select value={editEarnestMoneyStatus} onChange={e => setEditEarnestMoneyStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                  <option value="pending">Pending</option>
                  <option value="deposited">Deposited</option>
                  <option value="returned">Returned</option>
                  <option value="released">Released</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">Escrow Ledger Notes</label>
              <input value={editEarnestMoneyNotes} onChange={e => setEditEarnestMoneyNotes(e.target.value)} placeholder="e.g. Deposit check cleared on 08/04" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          {/* Contingencies & Credits */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">Contingencies & Credits</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Inspection Repair Credit ($)</label>
                <input type="number" value={editRepairCredit} onChange={e => setEditRepairCredit(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Attorney Review Status</label>
                <select value={editAttorneyReviewStatus} onChange={e => setEditAttorneyReviewStatus(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                  <option value="pending">Pending</option>
                  <option value="active">Active (3-day)</option>
                  <option value="completed">Completed</option>
                  <option value="waived">Waived</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">Attorney Review Start Date</label>
              <input type="date" value={editAttorneyReviewStartDate} onChange={e => setEditAttorneyReviewStartDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          {/* Commission Splits */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">Commission Splits (%)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Buyer Agent (%)</label>
                <input type="number" step="0.1" value={editSplitBuyerPercent} onChange={e => setEditSplitBuyerPercent(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Co-Broker (%)</label>
                <input type="number" step="0.1" value={editSplitCoBrokerPercent} onChange={e => setEditSplitCoBrokerPercent(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Referral Fee (%)</label>
                <input type="number" step="0.1" value={editSplitReferralPercent} onChange={e => setEditSplitReferralPercent(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Post-Closing Occupancy */}
          <div className="border-t border-gray-100 pt-4 space-y-4">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">Post-Closing Occupancy</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Occupancy Deadline</label>
                <input type="date" value={editPostOccupancyDeadline} onChange={e => setEditPostOccupancyDeadline(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Daily Rate ($)</label>
                <input type="number" value={editPostOccupancyDailyRate} onChange={e => setEditPostOccupancyDailyRate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 mb-1 block">Post-Occupancy Escrow Held ($)</label>
              <input type="number" value={editPostOccupancyEscrowHeld} onChange={e => setEditPostOccupancyEscrowHeld(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          {/* Deal Failure reasoning (Only rendered if deal status is fallen_through) */}
          {tx?.status === 'fallen_through' && (
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-red-500">Deal Failure Reasoning</h3>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Failure Reason</label>
                <select value={editDealFailureReason} onChange={e => setEditDealFailureReason(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                  <option value="">Choose a reason...</option>
                  <option value="financing">Buyer Financing Failed</option>
                  <option value="inspection">Inspection / Property Issues</option>
                  <option value="title">Title / Deed Defects</option>
                  <option value="seller_cold_feet">Seller Backed Out (Cold Feet)</option>
                  <option value="buyer_cold_feet">Buyer Backed Out (Cold Feet)</option>
                  <option value="other">Other / Unknown</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 mb-1 block">Failure Notes</label>
                <input value={editDealFailureNotes} onChange={e => setEditDealFailureNotes(e.target.value)} placeholder="Provide failure details..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface LockConfirmModalProps {
  isOpen: boolean
  onClose: () => void
}

export function LockConfirmModal({ isOpen, onClose }: LockConfirmModalProps) {
  const { id, data, fetchTransaction } = useTransactionDetail()
  const tx = data?.transaction
  const isLocked = tx?.is_locked === 1

  if (!isOpen) return null

  const handleToggle = async () => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: !isLocked })
      })
      if (res.ok) {
        onClose()
        fetchTransaction()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to update lock status')
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          {isLocked ? <Unlock className="h-6 w-6 text-emerald-600" /> : <Lock className="h-6 w-6 text-amber-600" />}
          <h2 className="text-base font-bold text-gray-900">{isLocked ? 'Unlock Transaction?' : 'Lock Transaction?'}</h2>
        </div>
        <p className="text-sm text-gray-600">
          {isLocked
            ? 'Unlocking will allow agents to modify this transaction again.'
            : 'Locking prevents agents from modifying compliance checklists, documents, and outcomes. Only brokers/admins can make changes.'}
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            onClick={handleToggle}
            className={clsx(
              "rounded-lg px-4 py-2 text-sm font-bold text-white",
              isLocked ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            {isLocked ? 'Unlock' : 'Lock'} Transaction
          </button>
        </div>
      </div>
    </div>
  )
}

interface EmailPartiesModalProps {
  isOpen: boolean
  onClose: () => void
  emailSubject: string
  setEmailSubject: (subject: string) => void
  emailBody: string
  setEmailBody: (body: string) => void
  selectedRecipients: string[]
  setSelectedRecipients: (recipients: string[]) => void
}

export function EmailPartiesModal({
  isOpen,
  onClose,
  emailSubject,
  setEmailSubject,
  emailBody,
  setEmailBody,
  selectedRecipients,
  setSelectedRecipients
}: EmailPartiesModalProps) {
  const { id, data } = useTransactionDetail()
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const tx = data?.transaction

  if (!isOpen) return null

  const getPartyRecipients = () => {
    const list: Array<{ name: string; email: string; role: string }> = []
    if (tx?.parties_involved) {
      try {
        const outline = JSON.parse(tx.parties_involved)
        if (outline.buyerName && outline.buyerEmail) {
          list.push({ name: outline.buyerName, email: outline.buyerEmail, role: 'Buyer' })
        }
        if (outline.sellerName && outline.sellerEmail) {
          list.push({ name: outline.sellerName, email: outline.sellerEmail, role: 'Seller' })
        }
      } catch (e) {}
    }
    return list
  }

  const recipients = getPartyRecipients()

  const handleSend = async () => {
    setIsSendingEmail(true)
    try {
      await fetch(`/api/transactions/${id}/email-parties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, body: emailBody, recipients: selectedRecipients })
      })
      onClose()
      alert(`Email sent successfully to ${selectedRecipients.length} recipient(s)!`)
    } catch (e) {
      console.error(e)
      alert('Failed to send email.')
    } finally {
      setIsSendingEmail(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 p-5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-500" />
            <h2 className="text-base font-bold text-gray-900">Email Deal Summary to Parties</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Select Recipients</label>
            <div className="space-y-2 max-h-32 overflow-y-auto border border-gray-200 rounded-xl p-3">
              {recipients.map((party) => (
                <label key={party.email} className="flex items-start gap-2.5 text-xs font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRecipients.includes(party.email)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRecipients([...selectedRecipients, party.email])
                      } else {
                        setSelectedRecipients(selectedRecipients.filter(x => x !== party.email))
                      }
                    }}
                    className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-bold text-gray-900">{party.name}</span>
                    <span className="text-gray-400 block">{party.email} ({party.role})</span>
                  </div>
                </label>
              ))}
              {recipients.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">No buyer or seller email details found in outline sheet.</p>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Subject</label>
            <input
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Message</label>
            <textarea
              rows={5}
              value={emailBody}
              onChange={e => setEmailBody(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            disabled={isSendingEmail || selectedRecipients.length === 0 || !emailSubject.trim()}
            onClick={handleSend}
            className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {isSendingEmail ? 'Sending...' : `Send Email (${selectedRecipients.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}

interface DealFailureModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (reason: string, notes: string) => void
}

export function DealFailureModal({ isOpen, onClose, onSubmit }: DealFailureModalProps) {
  const [reason, setReason] = useState('financing')
  const [notes, setNotes] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(reason, notes)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-gray-200 shadow-2xl overflow-hidden animate-in fade-in duration-150">
        <div className="px-6 py-4 bg-red-500 text-white flex items-center justify-between">
          <h3 className="font-bold text-base">Record Deal Failure (Fallen Through)</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-gray-500">
            Please log the reason why this transaction fell through. This data is recorded for audit purposes and compliance analytics.
          </p>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Failure Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none bg-white">
              <option value="financing">Buyer Financing Failed</option>
              <option value="inspection">Inspection / Property Issues</option>
              <option value="title">Title / Deed Defects</option>
              <option value="seller_cold_feet">Seller Backed Out (Cold Feet)</option>
              <option value="buyer_cold_feet">Buyer Backed Out (Cold Feet)</option>
              <option value="other">Other / Unknown</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Additional Explanatory Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Provide context on why the deal fell through..." rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
            <button type="submit" className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 text-sm font-bold text-white">Log Failure</button>
          </div>
        </form>
      </div>
    </div>
  )
}
