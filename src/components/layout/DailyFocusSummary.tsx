import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock } from 'lucide-react'

interface FocusItem {
  id: string
  title: string
  subtitle: string
  priority: 'urgent' | 'today' | 'informational'
  actionUrl: string
  type: 'follow_up' | 'deal_task' | 'compliance'
}

export function DailyFocusSummary() {
  const [items, setItems] = useState<FocusItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadFocusItems() {
      try {
        const res = await fetch('/api/contacts/stats')
        const json = await res.json()
        const focusList: FocusItem[] = []

        if (json.success && json.data) {
          const stats = json.data
          if (stats.overdue > 0) {
            focusList.push({
              id: 'focus_overdue',
              title: `${stats.overdue} Overdue Lead Follow-ups`,
              subtitle: 'Prospects require immediate follow-up action',
              priority: 'urgent',
              actionUrl: '/marketing/crm?lead_stage=overdue',
              type: 'follow_up',
            })
          }
          if (stats.needsFollowUp > 0) {
            focusList.push({
              id: 'focus_today',
              title: `${stats.needsFollowUp} Scheduled Lead Touchpoints Today`,
              subtitle: 'Planned calls & emails scheduled for today',
              priority: 'today',
              actionUrl: '/marketing/crm?lead_stage=needs_follow_up',
              type: 'follow_up',
            })
          }
        }

        focusList.push({
          id: 'focus_deals',
          title: 'Review Active Deals Pipeline',
          subtitle: 'Check milestone progress & attorney contacts',
          priority: 'informational',
          actionUrl: '/transactions/pipeline',
          type: 'deal_task',
        })

        setItems(focusList)
      } catch (e) {
        console.error('Failed to load focus items', e)
      } finally {
        setLoading(false)
      }
    }

    loadFocusItems()
  }, [])

  if (loading) return null

  return (
    <div className="bg-gradient-to-r from-brand-navy to-brand-navy-light text-white rounded-2xl p-5 shadow-card mb-6">
      <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-brand-gold/20 flex items-center justify-center border border-brand-gold/30">
            <Clock className="h-4 w-4 text-brand-gold" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm text-white">Daily Focus Operating Summary</h3>
            <p className="text-[11px] text-white/60">Top operational priorities for working agents today</p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-brand-gold uppercase tracking-wider bg-brand-gold/10 px-2 py-0.5 rounded-full border border-brand-gold/30">
          Action Ready
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.actionUrl}
            className="p-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 transition-all flex items-start justify-between group"
          >
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                {item.priority === 'urgent' && <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />}
                {item.priority === 'today' && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                <p className="font-bold text-xs text-white group-hover:text-brand-gold transition-colors">{item.title}</p>
              </div>
              <p className="text-[11px] text-white/70 leading-snug">{item.subtitle}</p>
            </div>
            <ArrowRight className="h-4 w-4 text-white/40 group-hover:text-brand-gold group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
          </Link>
        ))}
      </div>
    </div>
  )
}
