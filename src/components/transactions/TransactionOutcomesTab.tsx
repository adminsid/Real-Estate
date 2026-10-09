import { UserAvatar } from '@/components/common/UserAvatar'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import { Send, Shield, Sparkles, MessageSquare, Bot, Trash2 } from 'lucide-react'
import clsx from 'clsx'

const BROKER_PROMPTS = [
  'Request Inspection Contingency status',
  'Confirm Escrow deposit received with attorney',
  'Review Board Package draft before submission',
  'Confirm Mortgage Commitment letter received',
  'Schedule final walkthrough before closing',
]

export function TransactionOutcomesTab() {
  const { user } = useAuth()
  const {
    id,
    outcomes,
    setOutcomes,
    handlePostOutcome,
    handleResetOutcomes
  } = useTransactionDetail()

  const [message, setMessage] = useState('')
  const [isBrokerDirective, setIsBrokerDirective] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)

  // Live WebSocket connection to Durable Object OutcomesRoom
  useEffect(() => {
    if (!id) return
    let ws: WebSocket | null = null
    let reconnectTimeout: any = null

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/api/transactions/${id}/outcomes/ws`

      try {
        ws = new WebSocket(wsUrl)
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.type === 'new_outcome' && data.outcome) {
              setOutcomes((prev: any[]) => {
                const exists = prev.some(item => item.id === data.outcome.id)
                if (exists) return prev
                return [...prev, data.outcome]
              })
            } else if (data.type === 'reset_outcomes') {
              setOutcomes([])
            }
          } catch (e) {
            console.error('Failed to parse outcome message', e)
          }
        }

        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWs, 5000)
        }
      } catch (e) {
        console.error('WebSocket connection error:', e)
      }
    }

    connectWs()

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [id, setOutcomes])

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!message.trim() || isSending) return

    setIsSending(true)
    const textToSend = message.trim()
    const isAdvice = Boolean(isBrokerOrAdmin && isBrokerDirective)

    setMessage('')
    try {
      await handlePostOutcome(textToSend, isAdvice)
    } finally {
      setIsSending(false)
    }
  }

  const handleApplyPrompt = (promptText: string) => {
    setMessage(promptText)
    if (isBrokerOrAdmin) {
      setIsBrokerDirective(true)
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-xs overflow-hidden flex flex-col h-[620px]">
      {/* Top Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-900 text-sm">Deal Intelligence & Team Chat</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Room
              </span>
            </div>
            <p className="text-[11px] text-gray-500">Real-time collaboration between managing broker and assigned agents.</p>
          </div>
        </div>

        {isBrokerOrAdmin && outcomes.length > 0 && (
          <button
            type="button"
            onClick={handleResetOutcomes}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-600 transition-colors font-medium px-2 py-1 rounded-lg hover:bg-red-50"
            title="Clear Chat History"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear Chat</span>
          </button>
        )}
      </div>

      {/* Broker Quick Suggestions */}
      {isBrokerOrAdmin && (
        <div className="px-4 py-2 bg-gradient-to-r from-amber-50/60 to-yellow-50/40 border-b border-amber-100/60 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          <div className="flex items-center gap-1 text-[10px] font-bold text-amber-800 uppercase tracking-wider whitespace-nowrap mr-1">
            <Sparkles className="h-3 w-3 text-amber-600" />
            Broker Guidance:
          </div>
          {BROKER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleApplyPrompt(prompt)}
              className="text-[11px] font-medium bg-white hover:bg-amber-100/80 text-amber-900 border border-amber-200/80 px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors shadow-2xs cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Unified Chat Feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-gray-50/20">
        {outcomes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
            <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center mb-3">
              <Bot className="h-6 w-6" />
            </div>
            <p className="text-sm font-bold text-gray-700">No messages in this deal room yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm">
              Use this space to share progress, ask questions, or provide broker instructions on this transaction.
            </p>
          </div>
        ) : (
          outcomes.map((item) => {
            const isMe = user?.id === item.user_id
            const isAdvice = item.is_broker_advice === 1

            // Check if it's an automated system event
            const isSystemLog = item.message.startsWith('[System]') || item.message.startsWith('Status changed') || item.message.startsWith('Stage Gate:')

            if (isSystemLog) {
              return (
                <div key={item.id} className="flex items-center justify-center my-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200 shadow-2xs">
                    <span>{item.message}</span>
                    <span className="text-[9px] text-gray-400">
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={item.id}
                className={clsx(
                  "flex flex-col max-w-[85%] sm:max-w-[75%]",
                  isMe ? "ml-auto items-end" : "mr-auto items-start"
                )}
              >
                {/* Author & Tag */}
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px]">
                  <UserAvatar name={item.name || item.author_name || (isMe ? user?.name : undefined) || 'Agent'} src={item.avatar_url || (isMe ? user?.avatarUrl : undefined)} className="h-7 w-7 text-xs" />
                  <span className="font-bold text-gray-800">
                    {item.name || item.author_name || (isMe ? user?.name : null) || [item.first_name, item.last_name].filter(Boolean).join(' ') || 'Agent'}
                  </span>
                  {isAdvice && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                      <Shield className="h-2.5 w-2.5 text-amber-700" />
                      Broker Directive
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Message Bubble */}
                <div
                  className={clsx(
                    "rounded-2xl p-3.5 text-xs shadow-2xs whitespace-pre-wrap leading-relaxed",
                    isAdvice
                      ? "bg-amber-50/90 border-2 border-amber-300 text-amber-950 font-medium"
                      : isMe
                        ? "bg-blue-600 text-white rounded-br-xs"
                        : "bg-white border border-gray-200 text-gray-900 rounded-bl-xs"
                  )}
                >
                  {item.message}
                </div>
              </div>
            )
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Unified Input Footer */}
      <div className="p-3 border-t border-gray-200 bg-white flex-shrink-0">
        <form onSubmit={handleSend} className="space-y-2">
          {isBrokerOrAdmin && (
            <div className="flex items-center justify-between px-1">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold select-none text-gray-700">
                <input
                  type="checkbox"
                  checked={isBrokerDirective}
                  onChange={(e) => setIsBrokerDirective(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
                />
                <span className={clsx(isBrokerDirective ? "text-amber-800 font-bold" : "text-gray-500")}>
                  Tag as Official Broker Directive
                </span>
              </label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={isBrokerOrAdmin ? "Type broker guidance, update request, or message to agents..." : "Type message or update for the broker & team..."}
              disabled={isSending}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-gray-50/50 hover:bg-white focus:bg-white transition-all placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={isSending || !message.trim()}
              className={clsx(
                "rounded-xl px-4 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-1.5 flex-shrink-0 shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                isBrokerDirective
                  ? "bg-amber-600 text-white hover:bg-amber-700"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              )}
            >
              <span>Send</span>
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
