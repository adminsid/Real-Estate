import { useState, useMemo } from 'react'
import { useTransactionDetail } from './TransactionContext'
import { CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Clock, CalendarRange, AlertCircle } from 'lucide-react'
import clsx from 'clsx'

type CalendarEvent = {
  id: string
  title: string
  dateStr: string
  type: 'milestone' | 'task'
  status?: string
  priority?: 'low' | 'medium' | 'high'
}

export function TransactionCalendarTab() {
  const { data } = useTransactionDetail()
  const { transaction: tx, tasks = [] } = data

  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null)

  // 1. Gather all calendar events from milestones and checklist tasks
  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = []

    // Map Transaction milestones
    const milestones = [
      { key: 'listed_date', label: 'Listed Date', val: tx.listed_date },
      { key: 'expire_date', label: 'Agreement Expiration', val: tx.expire_date },
      { key: 'offer_date', label: 'Offer Date', val: tx.offer_date },
      { key: 'pending_date', label: 'Offer Accepted / Pending Date', val: tx.pending_date },
      { key: 'home_inspection_date', label: 'Home Inspection Date', val: tx.home_inspection_date },
      { key: 'possession_date', label: 'Possession Date', val: tx.possession_date },
      { key: 'escrow_date', label: 'Escrow Deposit Date', val: tx.escrow_date },
      { key: 'inspection_deadline', label: 'Inspection Contingency Deadline', val: tx.inspection_deadline },
      { key: 'appraisal_date', label: 'Appraisal Contingency Date', val: tx.appraisal_date },
      { key: 'target_close_date', label: 'Target Close Date', val: tx.target_close_date },
      { key: 'actual_close_date', label: 'Actual Close Date', val: tx.actual_close_date },
    ]

    milestones.forEach((m) => {
      if (m.val) {
        list.push({
          id: `milestone-${m.key}`,
          title: m.label,
          dateStr: m.val,
          type: 'milestone',
          priority: m.key.includes('deadline') || m.key.includes('escrow') ? 'high' : 'medium'
        })
      }
    })

    // Map Checklist Tasks
    tasks.forEach((t: any) => {
      if (t.due_date) {
        list.push({
          id: `task-${t.id}`,
          title: `Task: ${t.title}`,
          dateStr: t.due_date,
          type: 'task',
          status: t.status,
          priority: t.document_required ? 'high' : 'low'
        })
      }
    })

    return list
  }, [tx, tasks])

  // 2. Calendar grid calculation logic
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthName = currentDate.toLocaleString('en-US', { month: 'long' })

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayIndex = new Date(year, month, 1).getDay() // 0 = Sunday

  const prevMonthDays = new Date(year, month, 0).getDate()

  const calendarCells = useMemo(() => {
    const cells = []

    // Padding days from previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const m = month === 0 ? 11 : month - 1
      const y = month === 0 ? year - 1 : year
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ dayNum: d, isCurrentMonth: false, dateStr })
    }

    // Days in current month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ dayNum: d, isCurrentMonth: true, dateStr })
    }

    // Padding days for next month to complete the row grids
    const totalRemaining = 42 - cells.length
    for (let d = 1; d <= totalRemaining; d++) {
      const m = month === 11 ? 0 : month + 1
      const y = month === 11 ? year + 1 : year
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ dayNum: d, isCurrentMonth: false, dateStr })
    }

    return cells
  }, [year, month, daysInMonth, firstDayIndex, prevMonthDays])

  // Get events on selected date
  const selectedDateEvents = useMemo(() => {
    if (!selectedDateStr) return []
    return events.filter(e => e.dateStr === selectedDateStr)
  }, [selectedDateStr, events])

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col md:flex-row h-[550px]">
      {/* LEFT: Calendar grid workspace */}
      <div className="flex-1 p-5 flex flex-col justify-between border-r border-gray-100">
        {/* Navigation Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-955 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <CalendarRange className="h-4 w-4 text-blue-600 animate-pulse" />
              Deadlines & Milestones
            </h3>
            <p className="text-[11px] text-gray-500">View upcoming compliance dates, closing goals, and checklist tasks.</p>
          </div>
          <div className="flex items-center gap-1.5 no-print">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-bold text-gray-850 min-w-[100px] text-center">
              {monthName} {year}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Days of week labels */}
        <div className="grid grid-cols-7 gap-1 text-center py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {/* Calendar days grid */}
        <div className="grid grid-cols-7 gap-1 mt-1 flex-1">
          {calendarCells.map((cell, idx) => {
            const dayEvents = events.filter(e => e.dateStr === cell.dateStr)
            const hasEvents = dayEvents.length > 0
            const isToday = new Date().toISOString().split('T')[0] === cell.dateStr
            const isSelected = selectedDateStr === cell.dateStr

            return (
              <button
                key={`${cell.dateStr}-${idx}`}
                onClick={() => setSelectedDateStr(cell.dateStr)}
                className={clsx(
                  "p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all hover:bg-blue-50/20 group relative overflow-hidden min-h-[60px]",
                  cell.isCurrentMonth ? "bg-white border-gray-150" : "bg-gray-50/50 border-gray-50 text-gray-400",
                  isToday && "border-blue-500 ring-1 ring-blue-500/30",
                  isSelected && "bg-blue-50/40 border-blue-600 shadow-sm"
                )}
              >
                <span className={clsx(
                  "text-[10px] font-extrabold leading-none",
                  isToday ? "text-blue-600" : cell.isCurrentMonth ? "text-gray-800" : "text-gray-400"
                )}>
                  {cell.dayNum}
                </span>

                {/* Event Dots/Indicators */}
                {hasEvents && (
                  <div className="flex flex-wrap gap-0.5 mt-auto">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={clsx(
                          "w-1.5 h-1.5 rounded-full block",
                          e.type === 'milestone'
                            ? e.priority === 'high' ? "bg-red-500" : "bg-amber-500"
                            : e.status === 'completed' ? "bg-emerald-500" : "bg-blue-500"
                        )}
                        title={e.title}
                      />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[7px] font-extrabold text-gray-500 leading-none">
                        +{dayEvents.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* RIGHT: Selected Day Details Sidebar */}
      <div className="w-full md:w-64 bg-gray-50/50 p-5 flex flex-col overflow-y-auto">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 border-b pb-2 mb-3 flex items-center gap-1">
          <CalendarDays className="h-4 w-4 text-gray-400" />
          Selected Date Info
        </h4>

        {selectedDateStr ? (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-3 border shadow-sm">
              <p className="text-[10px] uppercase font-bold text-gray-400 leading-none">Date Selected</p>
              <p className="text-sm font-extrabold text-gray-900 mt-1">
                {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase text-gray-400">Events & Deadlines ({selectedDateEvents.length})</p>

              {selectedDateEvents.length === 0 ? (
                <div className="text-center py-6 bg-white rounded-xl border border-dashed text-xs text-gray-400 font-medium">
                  No deadlines on this date.
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map((e) => (
                    <div
                      key={e.id}
                      className={clsx(
                        "p-3 rounded-xl border bg-white shadow-sm flex flex-col gap-1.5",
                        e.type === 'milestone' ? "border-amber-100 border-l-4 border-l-amber-500" : "border-blue-100 border-l-4 border-l-blue-500"
                      )}
                    >
                      <div className="flex justify-between items-start gap-1">
                        <span className="font-bold text-[11px] text-gray-800 leading-tight">
                          {e.title}
                        </span>
                        {e.type === 'milestone' ? (
                          <span className="text-[8px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                            Milestone
                          </span>
                        ) : (
                          <span className="text-[8px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                            Checklist
                          </span>
                        )}
                      </div>

                      {e.type === 'task' && (
                        <div className="flex items-center gap-1 text-[10px] font-medium text-gray-500">
                          {e.status === 'completed' ? (
                            <span className="text-emerald-600 flex items-center gap-1 font-bold">
                              <CheckCircle2 className="h-3 w-3" /> Completed
                            </span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1 font-bold">
                              <Clock className="h-3 w-3" /> Pending Completion
                            </span>
                          )}
                        </div>
                      )}

                      {e.priority === 'high' && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-red-600 uppercase bg-red-50 px-2 py-0.5 rounded w-fit">
                          <AlertCircle className="h-3 w-3" /> High Priority Alert
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-20 text-gray-400 space-y-2 flex-1">
            <CalendarRange className="h-8 w-8 text-gray-300" />
            <p className="text-xs font-semibold">Select any day on the calendar to view its milestone deadlines and checklist tasks.</p>
          </div>
        )}
      </div>
    </div>
  )
}
