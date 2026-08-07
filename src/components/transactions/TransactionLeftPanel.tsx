import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTransactionDetail } from './TransactionContext'
import {
  ChevronDown, ChevronUp, CalendarDays
} from 'lucide-react'
import clsx from 'clsx'

interface TransactionLeftPanelProps {
  setIsOutlineEditOpen: (open: boolean) => void
}

export function TransactionLeftPanel({ setIsOutlineEditOpen }: TransactionLeftPanelProps) {
  const { data, historyDeals = [] } = useTransactionDetail()
  const { transaction: tx, parties = [] } = data

  const [cardCollapsed, setCardCollapsed] = useState<Record<string, boolean>>({})
  const toggleCard = (key: string) => setCardCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const outlineFields = (() => {
    if (tx.parties_involved) {
      try {
        if (tx.parties_involved.startsWith('{')) {
          return JSON.parse(tx.parties_involved)
        }
      } catch (e) {}
    }
    return {}
  })()

  const calculatedCommission = tx.price && tx.commission_rate ? tx.price * (tx.commission_rate / 100) : null
  const grossCommission = tx.commission_amount || calculatedCommission || 0
  const buyerSplit = Math.round(grossCommission * ((tx.commission_split_buyer_percent || 0) / 100))
  const coBrokerSplit = Math.round(grossCommission * ((tx.commission_split_co_broker_percent || 0) / 100))
  const referralSplit = Math.round(grossCommission * ((tx.commission_split_referral_percent || 0) / 100))
  const netBrokerShare = grossCommission - buyerSplit - coBrokerSplit - referralSplit

  const repairCredit = tx.repair_credit || 0
  const estNetToSeller = tx.price ? tx.price - grossCommission - repairCredit : null

  return (
    <div className="lg:col-span-1 space-y-3">
      {/* Deal Failure Alert Box */}
      {tx.status === 'fallen_through' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 animate-fade-in shadow-sm">
          <h4 className="font-extrabold text-[11px] uppercase tracking-wider text-red-700 mb-1">Deal Fallen Through</h4>
          <p className="font-semibold text-red-800">
            Reason: <span className="underline capitalize">{tx.deal_failure_reason?.replace('_', ' ') || 'not specified'}</span>
          </p>
          {tx.deal_failure_notes && (
            <p className="text-xs text-red-700 mt-1 italic">"{tx.deal_failure_notes}"</p>
          )}
        </div>
      )}

      {/* Financials & Dates */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => toggleCard('financials')}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        >
          <h3 className="text-sm font-bold text-gray-900">Deal Financials</h3>
          {cardCollapsed['financials'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
        </button>
        {!cardCollapsed['financials'] && (
          <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
            <div className="pt-3">
              <p className="text-xs text-gray-500 mb-1">Target Price</p>
              <p className="font-bold text-gray-900 text-xl">
                {tx.price ? `$${tx.price.toLocaleString()}` : '—'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Commission Rate</p>
                <p className="font-semibold text-gray-900">
                  {tx.commission_rate ? `${tx.commission_rate}%` : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Gross Commission</p>
                <p className="font-semibold text-gray-900">
                  {grossCommission ? `$${grossCommission.toLocaleString()}` : '—'}
                </p>
              </div>
            </div>

            {/* Automated Splits Breakdown */}
            {grossCommission > 0 && (
              <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 border border-gray-100 space-y-1.5">
                <p className="font-bold text-[10px] uppercase text-gray-400 mb-1">Automated Commission Splits</p>
                <div className="flex justify-between">
                  <span>Buyer Agent ({tx.commission_split_buyer_percent || 0}%):</span>
                  <span className="font-medium text-gray-800">${buyerSplit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Co-Broker ({tx.commission_split_co_broker_percent || 0}%):</span>
                  <span className="font-medium text-gray-800">${coBrokerSplit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Referral Split ({tx.commission_split_referral_percent || 0}%):</span>
                  <span className="font-medium text-gray-800">${referralSplit.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold">
                  <span className="text-gray-700">Net Brokerage Share:</span>
                  <span className="text-brand-navy">${netBrokerShare.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Repair credit */}
            {repairCredit > 0 && (
              <div className="flex justify-between items-center text-xs text-red-700 bg-red-50 p-2.5 rounded-lg border border-red-100">
                <span className="font-bold">Inspection Repair Credit:</span>
                <span className="font-extrabold">-${repairCredit.toLocaleString()}</span>
              </div>
            )}

            {estNetToSeller !== null && (
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                <p className="text-xs text-emerald-700 font-bold mb-1">Est. Net to Seller</p>
                <p className="font-bold text-emerald-800 text-base">
                  ${estNetToSeller.toLocaleString()}
                </p>
                <p className="text-[10px] text-emerald-600 mt-0.5">Price minus gross commission and credits</p>
              </div>
            )}

            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500 mb-1">Target Close</p>
                <div className="flex items-center gap-1 text-gray-700 font-medium text-sm">
                  <CalendarDays className="h-3.5 w-3.5 text-gray-400 no-print" />
                  <span className="text-xs">{tx.target_close_date || '—'}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Actual Close</p>
                <div className="flex items-center gap-1 text-gray-700 font-medium text-sm">
                  <CalendarDays className="h-3.5 w-3.5 text-gray-400 no-print" />
                  <span className="text-xs">{tx.actual_close_date || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Escrow Ledger & EMD */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => toggleCard('escrow')}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        >
          <h3 className="text-sm font-bold text-gray-900">Escrow Ledger & EMD</h3>
          {cardCollapsed['escrow'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
        </button>
        {!cardCollapsed['escrow'] && (
          <div className="px-5 pb-5 space-y-3 text-sm border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500">Deposit Amount</p>
                <p className="font-bold text-gray-900">{tx.earnest_money_amount ? `$${tx.earnest_money_amount.toLocaleString()}` : '—'}</p>
              </div>
              <div>
                <span className={clsx(
                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                  tx.earnest_money_status === 'deposited' ? "bg-emerald-100 text-emerald-700" :
                  tx.earnest_money_status === 'returned' ? "bg-amber-100 text-amber-700" :
                  tx.earnest_money_status === 'released' ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-600 border border-gray-200"
                )}>
                  {tx.earnest_money_status || 'pending'}
                </span>
              </div>
            </div>
            {tx.earnest_money_notes && (
              <div className="bg-gray-50 rounded-lg p-2.5 text-xs text-gray-600 border border-gray-100">
                <p className="font-bold text-[10px] uppercase text-gray-400 mb-0.5">Escrow Notes</p>
                <p>{tx.earnest_money_notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attorney Review Tracker */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => toggleCard('attorneyReview')}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        >
          <h3 className="text-sm font-bold text-gray-900">Attorney Review Tracker</h3>
          {cardCollapsed['attorneyReview'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
        </button>
        {!cardCollapsed['attorneyReview'] && (
          <div className="px-5 pb-5 space-y-3 text-sm border-t border-gray-100 pt-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500">Review Start Date</p>
                <p className="font-semibold text-gray-900">{tx.attorney_review_start_date || '—'}</p>
              </div>
              <div>
                <span className={clsx(
                  "px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                  tx.attorney_review_status === 'completed' ? "bg-emerald-100 text-emerald-700" :
                  tx.attorney_review_status === 'active' ? "bg-amber-100 text-amber-700 animate-pulse" :
                  tx.attorney_review_status === 'waived' ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                )}>
                  {tx.attorney_review_status || 'pending'}
                </span>
              </div>
            </div>
            {tx.attorney_review_start_date && tx.attorney_review_status === 'active' && (
              (() => {
                const startDate = new Date(tx.attorney_review_start_date)
                const deadlineDate = new Date(startDate)
                deadlineDate.setDate(startDate.getDate() + 3)
                const now = new Date()
                const diffTime = deadlineDate.getTime() - now.getTime()
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                const isOverdue = diffDays < 0
                return (
                  <div className={clsx(
                    "rounded-lg p-2.5 text-xs border mt-2",
                    isOverdue ? "bg-red-50 text-red-800 border-red-100" : "bg-blue-50 text-blue-800 border-blue-100"
                  )}>
                    <p className="font-bold">Deadline: {deadlineDate.toISOString().split('T')[0]}</p>
                    <p className="mt-0.5">
                      {isOverdue
                        ? `⚠️ Review period is overdue by ${Math.abs(diffDays)} day(s)!`
                        : `⏳ ${diffDays} day(s) remaining for 3-day review contingency.`
                      }
                    </p>
                  </div>
                )
              })()
            )}
          </div>
        )}
      </div>

      {/* Post-Closing Occupancy */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => toggleCard('postOccupancy')}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        >
          <h3 className="text-sm font-bold text-gray-900">Post-Closing Occupancy</h3>
          {cardCollapsed['postOccupancy'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
        </button>
        {!cardCollapsed['postOccupancy'] && (
          <div className="px-5 pb-5 space-y-3 text-sm border-t border-gray-100 pt-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs text-gray-500">Occupancy Deadline</p>
                <p className="font-semibold text-gray-900">{tx.post_occupancy_deadline || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Daily Rate ($)</p>
                <p className="font-semibold text-gray-900">{tx.post_occupancy_daily_rate ? `$${tx.post_occupancy_daily_rate}` : '—'}</p>
              </div>
            </div>
            {tx.post_occupancy_escrow_held && (
              <div className="bg-amber-50 rounded-lg p-2.5 text-xs text-amber-800 border border-amber-100">
                <span className="font-bold block text-[10px] uppercase text-amber-700">Escrow Held</span>
                <span className="font-extrabold text-base">${tx.post_occupancy_escrow_held.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Agreement Section */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => toggleCard('agreements')}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        >
          <h3 className="text-sm font-bold text-gray-900">Representation & Agreements</h3>
          {cardCollapsed['agreements'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
        </button>
        {!cardCollapsed['agreements'] && (
          <div className="px-5 pb-5 space-y-3 text-sm border-t border-gray-100 pt-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Agreement Type</p>
              <p className="font-semibold text-gray-900 text-sm">{tx.agreement_type || 'No signed agreement logged'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Agreement Expiration</p>
              <p className="font-semibold text-gray-900 text-sm">{tx.agreement_expiration_date || '—'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Deal Outline Sheet Data Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm no-print">
        <button
          onClick={() => toggleCard('outline')}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        >
          <h3 className="text-sm font-bold text-gray-900">Printable Deal Outline</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); setIsOutlineEditOpen(true) }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Edit
            </button>
            {cardCollapsed['outline'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
          </div>
        </button>
        {!cardCollapsed['outline'] && (
          <div className="px-5 pb-5 border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 mb-3">Key parties and financial terms for the printable sheet.</p>
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 border-b border-gray-50 pb-2">
                <div>
                  <p className="text-gray-400 font-medium">Buyer</p>
                  <p className="font-semibold text-gray-800 truncate">{outlineFields.buyerName || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium">Seller</p>
                  <p className="font-semibold text-gray-800 truncate">{outlineFields.sellerName || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 border-b border-gray-50 pb-2">
                <div>
                  <p className="text-gray-400 font-medium">Selling Agent</p>
                  <p className="font-semibold text-gray-800 truncate">{outlineFields.sellingAgentName || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium">Listing Agent</p>
                  <p className="font-semibold text-gray-800 truncate">{outlineFields.listingAgentName || '—'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-gray-400 font-medium">Selling Price</p>
                  <p className="font-semibold text-gray-800">{outlineFields.sellingPrice ? `$${parseFloat(outlineFields.sellingPrice).toLocaleString()}` : '—'}</p>
                </div>
                <div>
                  <p className="text-gray-400 font-medium">Mortgage Amt</p>
                  <p className="font-semibold text-gray-800">{outlineFields.mortgageAmount ? `$${parseFloat(outlineFields.mortgageAmount).toLocaleString()}` : '—'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Involved Parties */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          onClick={() => toggleCard('parties')}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
        >
          <h3 className="text-sm font-bold text-gray-900">Involved Parties</h3>
          <div className="flex items-center gap-1.5">
            {parties.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{parties.length}</span>
            )}
            {cardCollapsed['parties'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
          </div>
        </button>
        {!cardCollapsed['parties'] && (
          <div className="px-5 pb-5 border-t border-gray-100 pt-3">
            <div className="grid grid-cols-2 gap-2">
              {parties.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50/50">
                  <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-[10px] flex-shrink-0">
                    {(p.first_name?.[0] || '')}{(p.last_name?.[0] || '')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-[10px] text-gray-500 capitalize">{p.role}</p>
                  </div>
                </div>
              ))}
              {parties.length === 0 && (
                <p className="col-span-2 text-xs text-gray-500 text-center py-3">No primary client linked.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History Deals */}
      {historyDeals.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm no-print mt-6">
          <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4">Past Deals for this Property</h3>
          <div className="space-y-3">
            {historyDeals.map((h: any) => (
              <Link
                key={h.id}
                to={`/transactions/${h.id}`}
                className="block p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{h.name}</p>
                  <span className={clsx(
                    "text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize",
                    h.status === 'closed' ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"
                  )}>
                    {h.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{h.target_close_date || h.created_at.split(' ')[0]}</span>
                  <span className="font-medium text-gray-700">{h.price ? `$${h.price.toLocaleString()}` : ''}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
