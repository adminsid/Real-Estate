import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import { Send, Shield } from 'lucide-react'
import clsx from 'clsx'

export function TransactionOutcomesTab() {
  const { user } = useAuth()
  const {
    outcomes,
    outcomeTemplates,
    handlePostOutcome,
    handleResetOutcomes
  } = useTransactionDetail()

  const [newOutcomeMessage, setNewOutcomeMessage] = useState('')
  const [isOutcomeAdvice, setIsOutcomeAdvice] = useState(false)
  const [isPostingOutcome, setIsPostingOutcome] = useState(false)
  const feedEndRef = useRef<HTMLDivElement>(null)

  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [outcomes])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOutcomeMessage.trim()) return
    setIsPostingOutcome(true)
    await handlePostOutcome(newOutcomeMessage, isOutcomeAdvice)
    setNewOutcomeMessage('')
    setIsOutcomeAdvice(false)
    setIsPostingOutcome(false)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[600px]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="font-bold text-gray-950 text-sm">Deal Chat & Outcomes Log</h3>
          <p className="text-[10px] text-gray-500">Live feed for logging actions, files, and decisions.</p>
        </div>
        <button
          onClick={handleResetOutcomes}
          className="text-xs text-gray-500 hover:text-red-600 font-semibold"
        >
          Clear Chat
        </button>
      </div>

      {/* Feed Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/30">
        {outcomes.map((item) => {
          const isAdvice = item.is_broker_advice === 1
          return (
            <div
              key={item.id}
              className={clsx(
                "max-w-[85%] rounded-2xl p-4 shadow-sm text-xs space-y-1.5",
                isAdvice
                  ? "mr-auto bg-amber-50 border border-amber-200 text-amber-900"
                  : "ml-auto bg-blue-600 text-white"
              )}
            >
              {isAdvice && (
                <p className="font-extrabold text-[10px] text-amber-700 uppercase flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Broker/Admin Action
                </p>
              )}
              <p className="whitespace-pre-wrap">{item.message}</p>
              <div className={clsx(
                "text-[9px] mt-1 flex justify-between",
                isAdvice ? "text-amber-600" : "text-blue-100"
              )}>
                <span>Logged by {item.author_name || 'Agent'}</span>
                <span>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          )
        })}
        <div ref={feedEndRef} />
      </div>

      {/* Template chips */}
      {outcomeTemplates.length > 0 && (
        <div className="px-6 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-2 overflow-x-auto flex-shrink-0">
          <span className="text-[10px] font-bold text-gray-400 uppercase whitespace-nowrap">Presets:</span>
          {outcomeTemplates.map((t) => (
            <button
              key={t}
              onClick={() => setNewOutcomeMessage(t)}
              className="text-[10px] font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap"
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Form Input */}
      <form onSubmit={onSubmit} className="p-4 border-t border-gray-100 flex gap-3 items-center flex-shrink-0">
        <input
          value={newOutcomeMessage}
          onChange={(e) => setNewOutcomeMessage(e.target.value)}
          placeholder="Log deal milestone, update or note..."
          disabled={isPostingOutcome}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-xs focus:outline-none focus:border-blue-500 bg-white"
        />
        {isBrokerOrAdmin && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isOutcomeAdvice}
              onChange={(e) => setIsOutcomeAdvice(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-amber-600"
            />
            <span className="text-[11px] font-bold text-amber-700">Broker Advice</span>
          </label>
        )}
        <button
          type="submit"
          disabled={isPostingOutcome || !newOutcomeMessage.trim()}
          className="bg-blue-600 text-white rounded-xl p-2.5 hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center flex-shrink-0"
        >
          <Send className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  )
}
