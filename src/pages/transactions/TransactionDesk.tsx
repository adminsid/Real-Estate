import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldAlert, DollarSign, FileCheck, Calendar, Activity,
  Users, CheckCircle2, XCircle, Award, ExternalLink
} from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { apiFetch } from '@/utils/api'
import { useAuth } from '@/context/AuthContext'
import { SkeletonTable } from '@/components/common/SkeletonLoader'
import clsx from 'clsx'

type GCIStats = {
  totalClosed: number
  totalPending: number
  byAgent: Array<{
    agentName: string
    closed: number
    pending: number
  }>
  transactions: Array<{
    id: string
    name: string
    status: string
    commission: number
    agentName: string
    closeDate: string | null
  }>
}

type EscrowItem = {
  id: string
  name: string
  earnestMoneyAmount: number
  earnestMoneyStatus: 'pending' | 'deposited' | 'returned' | 'released'
  earnestMoneyNotes: string | null
}

type ComplianceItem = {
  id: string
  transactionId: string
  transactionName: string
  title: string
  documentKey: string
  approvalStatus: 'pending' | 'approved' | 'rejected'
  updatedAt: string
}

type LicenseItem = {
  name: string
  email: string
  licenseNumber: string
  licenseExpiration: string
  daysRemaining: number
}

type DeskData = {
  gci: GCIStats
  escrow: EscrowItem[]
  compliance: ComplianceItem[]
  licenses: LicenseItem[]
}

export function TransactionDeskPage() {
  const { user } = useAuth()
  const [data, setData] = useState<DeskData | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'compliance' | 'gci' | 'escrow' | 'licenses'>('compliance')

  // Reject Modal state
  const [rejectingItem, setRejectingItem] = useState<ComplianceItem | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')

  const fetchDeskData = async () => {
    try {
      const res = await apiFetch<DeskData>('/api/broker/desk')
      setData(res)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDeskData()
  }, [])

  const handleApprove = async (item: ComplianceItem) => {
    try {
      await apiFetch(`/api/transactions/${item.transactionId}/tasks/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ approval_status: 'approved' })
      })
      // Refresh
      fetchDeskData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Approval failed')
    }
  }

  const handleRejectSubmit = async () => {
    if (!rejectingItem) return
    try {
      await apiFetch(`/api/transactions/${rejectingItem.transactionId}/tasks/${rejectingItem.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          approval_status: 'rejected',
          approval_notes: rejectNotes
        })
      })
      setRejectingItem(null)
      setRejectNotes('')
      fetchDeskData()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rejection failed')
    }
  }

  if (!user || (user.role !== 'broker' && user.role !== 'admin')) {
    return (
      <Layout title="Transaction Compliance Desk">
        <div className="flex items-center justify-center h-64 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
          <p className="text-gray-500">Only brokers and admins have access to the Transaction Desk.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Transaction Compliance Desk">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Transaction Desk & Compliance</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage GCI reports, escrow logs, compliance reviews, and license expirations</p>
          </div>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-150 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Gross Commission Income (GCI) Closed</p>
              <h2 className="text-3xl font-extrabold text-gray-950 mt-2">
                ${data?.gci.totalClosed.toLocaleString() ?? '0'}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold mt-4">
              <Award className="h-4 w-4" />
              <span>Earned revenue fully finalized</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-150 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pending Pipeline Commission</p>
              <h2 className="text-3xl font-extrabold text-gray-950 mt-2">
                ${data?.gci.totalPending.toLocaleString() ?? '0'}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-blue-600 text-xs font-bold mt-4">
              <Activity className="h-4 w-4" />
              <span>In active/under-contract stages</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-150 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pending Compliance Audits</p>
              <h2 className="text-3xl font-extrabold text-gray-950 mt-2">
                {data?.compliance.length ?? '0'}
              </h2>
            </div>
            <div className={clsx(
              "flex items-center gap-1.5 text-xs font-bold mt-4",
              (data?.compliance.length || 0) > 0 ? "text-amber-600 animate-pulse" : "text-gray-500"
            )}>
              <ShieldAlert className="h-4 w-4" />
              <span>{(data?.compliance.length || 0) > 0 ? "Documents require review" : "Compliance queue is clear"}</span>
            </div>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => setTab('compliance')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
              tab === 'compliance' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <FileCheck className="h-4 w-4" />
            Compliance Queue
            {data && data.compliance.length > 0 && (
              <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">
                {data.compliance.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab('gci')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
              tab === 'gci' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <DollarSign className="h-4 w-4" />
            Commissions & GCI
          </button>

          <button
            onClick={() => setTab('escrow')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
              tab === 'escrow' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <ShieldAlert className="h-4 w-4" />
            Escrow Ledger
          </button>

          <button
            onClick={() => setTab('licenses')}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
              tab === 'licenses' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Calendar className="h-4 w-4" />
            Agent Licenses
            {data && data.licenses.filter(l => l.daysRemaining <= 90).length > 0 && (
              <span className="bg-red-100 text-red-800 text-[10px] px-2 py-0.5 rounded-full font-bold ml-1">
                {data.licenses.filter(l => l.daysRemaining <= 90).length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Contents */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-150 p-6 shadow-sm">
            <SkeletonTable rows={5} cols={5} />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {tab === 'compliance' && (
              <div className="divide-y divide-gray-100">
                {data?.compliance.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <FileCheck className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No documents currently pending compliance review.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100">
                        <th className="text-left font-medium px-6 py-3">Deal / Transaction</th>
                        <th className="text-left font-medium px-6 py-3">Requirement / Task</th>
                        <th className="text-left font-medium px-6 py-3">Attachment File</th>
                        <th className="text-left font-medium px-6 py-3">Submitted At</th>
                        <th className="text-right font-medium px-6 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.compliance.map(item => (
                        <tr key={item.id} className="hover:bg-gray-55/20 transition-colors">
                          <td className="px-6 py-4 font-bold text-gray-900">
                            <Link to={`/transactions/${item.transactionId}`} className="hover:underline flex items-center gap-1">
                              {item.transactionName}
                              <ExternalLink className="h-3 w-3 text-gray-400" />
                            </Link>
                          </td>
                          <td className="px-6 py-4 text-gray-600">{item.title}</td>
                          <td className="px-6 py-4 font-mono text-xs text-blue-600">
                            <a href={`/api/transactions/${item.transactionId}/documents/${item.documentKey}`} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
                              {item.documentKey.slice(-20)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs">
                            {new Date(item.updatedAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleApprove(item)}
                                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectingItem(item)}
                                className="bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'gci' && (
              <div className="p-6 space-y-8">
                {/* Agent Leaderboard table */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    Gross Commission Income by Agent
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 text-left">
                        <th className="px-4 py-2 font-medium">Agent Name</th>
                        <th className="px-4 py-2 font-medium">Closed GCI (Earned)</th>
                        <th className="px-4 py-2 font-medium">Pending GCI (Pipeline)</th>
                        <th className="px-4 py-2 font-medium">Total Volume Represented</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.gci.byAgent.map((agent, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-semibold text-gray-900">{agent.agentName}</td>
                          <td className="px-4 py-3 text-emerald-600 font-bold">${agent.closed.toLocaleString()}</td>
                          <td className="px-4 py-3 text-blue-600 font-medium">${agent.pending.toLocaleString()}</td>
                          <td className="px-4 py-3 font-bold text-gray-900">${(agent.closed + agent.pending).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* All Transactions GCI Ledger */}
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-gray-400" />
                    Consolidated Commission Ledger
                  </h3>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 text-left">
                        <th className="px-4 py-2 font-medium">Transaction Name</th>
                        <th className="px-4 py-2 font-medium">Agent</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Commission Amount</th>
                        <th className="px-4 py-2 font-medium">Finalized Close Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.gci.transactions.map((tx, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-bold text-gray-900">
                            <Link to={`/transactions/${tx.id}`} className="hover:underline flex items-center gap-1 w-fit">
                              {tx.name}
                              <ExternalLink className="h-3 w-3 text-gray-400" />
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{tx.agentName}</td>
                          <td className="px-4 py-3">
                            <span className={clsx(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                              tx.status === 'closed' ? "bg-emerald-100 text-emerald-800" :
                              tx.status === 'under_contract' ? "bg-blue-100 text-blue-800" :
                              tx.status === 'fallen_through' ? "bg-red-100 text-red-800" :
                              "bg-gray-100 text-gray-600"
                            )}>
                              {tx.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900">${tx.commission.toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{tx.closeDate ? new Date(tx.closeDate).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'escrow' && (
              <div>
                {data?.escrow.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <ShieldAlert className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No transactions holding earnest money escrow currently.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 text-left">
                        <th className="px-6 py-3 font-medium">Transaction</th>
                        <th className="px-6 py-3 font-medium">Earnest Money Held</th>
                        <th className="px-6 py-3 font-medium">Escrow Status</th>
                        <th className="px-6 py-3 font-medium">Ledger Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.escrow.map(item => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-900">
                            <Link to={`/transactions/${item.id}`} className="hover:underline flex items-center gap-1 w-fit">
                              {item.name}
                              <ExternalLink className="h-3 w-3 text-gray-400" />
                            </Link>
                          </td>
                          <td className="px-6 py-4 font-bold text-gray-900">
                            ${item.earnestMoneyAmount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4">
                            <span className={clsx(
                              "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider",
                              item.earnestMoneyStatus === 'deposited' ? "bg-emerald-100 text-emerald-800" :
                              item.earnestMoneyStatus === 'released' ? "bg-blue-100 text-blue-800" :
                              item.earnestMoneyStatus === 'returned' ? "bg-amber-100 text-amber-800" :
                              "bg-gray-100 text-gray-600"
                            )}>
                              {item.earnestMoneyStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-gray-500 text-xs italic">{item.earnestMoneyNotes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'licenses' && (
              <div>
                {data?.licenses.length === 0 ? (
                  <div className="p-12 text-center text-gray-500">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    No team members have registered license expiration dates.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b border-gray-100 text-left">
                        <th className="px-6 py-3 font-medium">Agent Name</th>
                        <th className="px-6 py-3 font-medium">Agent Email</th>
                        <th className="px-6 py-3 font-medium">License Number</th>
                        <th className="px-6 py-3 font-medium">Expiration Date</th>
                        <th className="px-6 py-3 font-medium">Days Remaining</th>
                        <th className="px-6 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.licenses.map((item, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-6 py-4 font-bold text-gray-900">{item.name}</td>
                          <td className="px-6 py-4 text-gray-600">{item.email}</td>
                          <td className="px-6 py-4 font-mono text-xs">{item.licenseNumber}</td>
                          <td className="px-6 py-4 text-gray-500 text-xs">
                            {new Date(item.licenseExpiration).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 font-semibold text-gray-900">
                            {item.daysRemaining} days
                          </td>
                          <td className="px-6 py-4">
                            <span className={clsx(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase",
                              item.daysRemaining <= 30 ? "bg-red-100 text-red-800 animate-pulse" :
                              item.daysRemaining <= 90 ? "bg-amber-100 text-amber-800" :
                              "bg-emerald-100 text-emerald-800"
                            )}>
                              {item.daysRemaining <= 30 ? 'Critical' : item.daysRemaining <= 90 ? 'Warning' : 'Active'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectingItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-gray-100 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-950">Reject Compliance Document</h3>
            <p className="text-gray-500 text-sm">
              Please specify the reason for rejecting the document uploaded for task <strong>{rejectingItem.title}</strong> on deal <strong>{rejectingItem.transactionName}</strong>.
            </p>
            <textarea
              className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
              rows={4}
              placeholder="e.g. Missing signature on page 4, scan quality is too blurry..."
              value={rejectNotes}
              onChange={e => setRejectNotes(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setRejectingItem(null)
                  setRejectNotes('')
                }}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectNotes.trim()}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
              >
                Submit Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
