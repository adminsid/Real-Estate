import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, Clock, ArrowRight, CheckCircle2 } from 'lucide-react'

interface ActionItem {
  id: string
  title: string
  subtitle: string
  priority: 'urgent' | 'today' | 'info'
  actionUrl: string
}

export function TodayActions() {
  const [items, setItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/contacts/stats', { credentials: 'include' })
        const json = await res.json()
        const list: ActionItem[] = []

        if (json.success && json.data) {
          const s = json.data
          if (s.overdue > 0) {
            list.push({
              id: 'overdue',
              title: `${s.overdue} Overdue Follow-up${s.overdue === 1 ? '' : 's'}`,
              subtitle: 'Leads requiring immediate attention',
              priority: 'urgent',
              actionUrl: '/marketing/crm?lead_stage=overdue',
            })
          }
          if (s.needsFollowUp > 0) {
            list.push({
              id: 'today',
              title: `${s.needsFollowUp} Touchpoint${s.needsFollowUp === 1 ? '' : 's'} Scheduled Today`,
              subtitle: 'Planned calls & emails for today',
              priority: 'today',
              actionUrl: '/marketing/crm?lead_stage=needs_follow_up',
            })
          }
        }
        setItems(list)
      } catch {
        // fail silently — don't show noise on error
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Only render if there are actionable items
  if (loading || items.length === 0) return null

  return (
    <div className="mb-5 flex flex-wrap gap-2 items-center">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex-shrink-0">
        Today
      </span>
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.actionUrl}
          className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all hover:shadow-sm ${
            item.priority === 'urgent'
              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
        >
          {item.priority === 'urgent' ? (
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          ) : (
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
          )}
          {item.title}
          <ArrowRight className="h-3 w-3 flex-shrink-0" />
        </Link>
      ))}
      {items.every(i => i.priority === 'info') && (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <CheckCircle2 className="h-3.5 w-3.5" />
          All caught up
        </span>
      )}
    </div>
  )
}
