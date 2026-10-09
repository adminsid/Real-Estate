import { useState, useMemo } from 'react'
import { useTransactionDetail } from './TransactionContext'
import {
  CalendarDays, Send, Plus, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, CalendarRange
} from 'lucide-react'
import clsx from 'clsx'
import { getLocalDateString } from '@/utils/date'

type CalendarEvent = {
  id: string
  title: string
  dateStr: string
  type: 'milestone' | 'task'
  status?: string
  priority?: 'low' | 'medium' | 'high'
}

export function TransactionTimelineTab() {
  const {
    data,
    handleNotifyTeam,
    handleCreateChecklistReminder
  } = useTransactionDetail()

  const { transaction: tx, tasks = [] } = data
  const [activeView, setActiveView] = useState<'timeline' | 'calendar'>('timeline')

  // Timeline state
  const [notifyingMilestone, setNotifyingMilestone] = useState<string | null>(null)
  const [creatingTaskMilestone, setCreatingTaskMilestone] = useState<string | null>(null)

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null)

  const milestoneItems = [
    { key: 'listed_date', label: 'Listed Date', val: tx.listed_date },
    { key: 'expire_date', label: 'Agreement Expiration Date', val: tx.expire_date },
    { key: 'offer_date', label: 'Offer Date', val: tx.offer_date },
    { key: 'offer_accepted_date', label: 'Offer Accepted Date', val: tx.offer_accepted_date || tx.accepted_date },
    { key: 'pending_date', label: 'Pending / Board Submission Date', val: tx.pending_date },
    { key: 'home_inspection_date', label: 'Home Inspection Date', val: tx.home_inspection_date },
    { key: 'escrow_date', label: 'Escrow Deposit Date', val: tx.escrow_date },
    { key: 'inspection_deadline', label: 'Inspection Contingency Deadline', val: tx.inspection_deadline },
    { key: 'appraisal_date', label: 'Appraisal Contingency Date', val: tx.appraisal_date },
    { key: 'closing_date', label: 'Target Closing Date', val: tx.target_close_date || tx.closing_date },
    { key: 'possession_date', label: 'Possession Date', val: tx.possession_date },
  ]

  const handleNotifyClick = async (key: string, val: string) => {
    setNotifyingMilestone(key)
    await handleNotifyTeam(key, val)
    setNotifyingMilestone(null)
  }

  const handleCreateReminderClick = async (label: string, val: string) => {
    setCreatingTaskMilestone(label)
    await handleCreateChecklistReminder(label, val)
    setCreatingTaskMilestone(null)
  }

  const handleCreateIcsFile = (label: string, val: string) => {
    if (!val) return
    const cleanTitle = label.replace(/[^\w\s-]/g, '')
    const yyyymmdd = val.replace(/-/g, '')
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Prime America Real Estate//RE Workspace//EN',
      'BEGIN:VEVENT',
      `UID:${cleanTitle}-${Date.now()}@primeamericany.com`,
      `DTSTAMP:${yyyymmdd}T000000Z`,
      `DTSTART;VALUE=DATE:${yyyymmdd}`,
      `SUMMARY:${cleanTitle} for ${tx.name || 'Transaction'}`,
      `DESCRIPTION:Milestone Date Alert for: ${cleanTitle}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n')

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${cleanTitle.toLowerCase().replace(/\s+/g, '_')}_reminder.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Gather calendar events from milestones and checklist tasks
  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = []

    milestoneItems.forEach((m) => {
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

  // Calendar Grid Calculation
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const monthName = currentDate.toLocaleString('en-US', { month: 'long' })
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayIndex = new Date(year, month, 1).getDay()
  const prevMonthDays = new Date(year, month, 0).getDate()

  const calendarCells = useMemo(() => {
    const cells = []
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const m = month === 0 ? 11 : month - 1
      const y = month === 0 ? year - 1 : year
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ dayNum: d, isCurrentMonth: false, dateStr })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ dayNum: d, isCurrentMonth: true, dateStr })
    }
    const totalRemaining = 42 - cells.length
    for (let d = 1; d <= totalRemaining; d++) {
      const m = month === 11 ? 0 : month + 1
      const y = month === 11 ? year + 1 : year
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ dayNum: d, isCurrentMonth: false, dateStr })
    }
    return cells
  }, [year, month, daysInMonth, firstDayIndex, prevMonthDays])

  const selectedDateEvents = useMemo(() => {
    if (!selectedDateStr) return []
    return events.filter(e => e.dateStr === selectedDateStr)
  }, [selectedDateStr, events])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-xs overflow-hidden">
      {/* Top Header with Segmented View Switcher */}
      <div className="p-5 border-b border-gray-100 bg-gray-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-900 text-sm">Schedule & Timeline</h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {milestoneItems.filter(m => !!m.val).length} Scheduled
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Track critical NYC contract dates, inspection deadlines, and calendar events.</p>
        </div>

        {/* View Switcher */}
        <div className="inline-flex rounded-xl bg-gray-200/80 p-1 border border-gray-200">
          <button
            type="button"
            onClick={() => setActiveView('timeline')}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
              activeView === 'timeline'
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Milestone Timeline</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('calendar')}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5",
              activeView === 'calendar'
                ? "bg-white text-gray-900 shadow-xs"
                : "text-gray-600 hover:text-gray-900"
            )}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            <span>Monthly Calendar</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: Milestone Timeline */}
      {activeView === 'timeline' && (
        <div className="p-6 space-y-6">
          <div className="relative border-l-2 border-blue-200 ml-4 pl-6 space-y-7">
            {milestoneItems.map((item) => (
              <div key={item.key} className="relative group">
                <span className={clsx(
                  "absolute -left-[33px] top-0.5 rounded-full p-1.5 border-2 border-white shadow-2xs transition-colors",
                  item.val ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-400"
                )}>
                  <CalendarDays className="h-3.5 w-3.5" />
                </span>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/40 hover:bg-gray-50/80 p-3.5 rounded-xl border border-gray-100 transition-colors">
                  <div>
                    <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider">{item.label}</h4>
                    <p className="text-xs font-semibold mt-1">
                      {item.val ? (
                        <span className="text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md font-bold border border-blue-200/60">
                          {item.val}
                        </span>
                      ) : (
                        <span className="italic text-gray-400">Date not scheduled</span>
                      )}
                    </p>
                  </div>

                  {item.val && (
                    <div className="flex items-center gap-1.5 no-print flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleCreateIcsFile(item.label, item.val!)}
                        className="text-xs bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg font-bold transition-colors shadow-2xs cursor-pointer"
                        title="Download .ics event file"
                      >
                        📅 Export ICS
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateReminderClick(item.label, item.val!)}
                        disabled={creatingTaskMilestone === item.label}
                        className="text-xs bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg font-bold disabled:opacity-50 flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {creatingTaskMilestone === item.label ? 'Creating...' : 'Create Reminder'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNotifyClick(item.key, item.val!)}
                        disabled={notifyingMilestone === item.key}
                        className="text-xs bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-bold disabled:opacity-50 flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                        {notifyingMilestone === item.key ? 'Sending...' : 'Notify Team'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW 2: Monthly Calendar */}
      {activeView === 'calendar' && (
        <div className="flex flex-col md:flex-row h-[550px]">
          {/* Calendar Grid */}
          <div className="flex-1 p-5 flex flex-col justify-between border-r border-gray-100">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 flex-shrink-0">
              <span className="text-sm font-bold text-gray-900">
                {monthName} {year}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-50">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            <div className="grid grid-cols-7 gap-1 mt-1 flex-1">
              {calendarCells.map((cell, idx) => {
                const dayEvents = events.filter(e => e.dateStr === cell.dateStr)
                const hasEvents = dayEvents.length > 0
                const isToday = getLocalDateString() === cell.dateStr
                const isSelected = selectedDateStr === cell.dateStr

                return (
                  <button
                    key={`${cell.dateStr}-${idx}`}
                    type="button"
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    className={clsx(
                      "p-1.5 rounded-xl border text-left flex flex-col justify-between transition-all hover:bg-blue-50/20 group relative overflow-hidden min-h-[56px] cursor-pointer",
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

          {/* Selected Date Inspector Sidebar */}
          <div className="w-full md:w-72 bg-gray-50/60 p-5 flex flex-col overflow-y-auto">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 border-b pb-2 mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-blue-600" />
              Selected Date Info
            </h4>

            {selectedDateStr ? (
              <div className="space-y-4">
                <div className="bg-white rounded-xl p-3 border shadow-2xs">
                  <p className="text-[10px] uppercase font-bold text-gray-400">Date Selected</p>
                  <p className="text-xs font-extrabold text-gray-900 mt-0.5">
                    {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase text-gray-400">
                    Events & Deadlines ({selectedDateEvents.length})
                  </p>

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
                            "p-3 rounded-xl border bg-white shadow-2xs flex flex-col gap-1",
                            e.type === 'milestone' ? "border-amber-200 border-l-4 border-l-amber-500" : "border-blue-200 border-l-4 border-l-blue-500"
                          )}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className="font-bold text-[11px] text-gray-900 leading-tight">
                              {e.title}
                            </span>
                            <span className={clsx(
                              "text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase",
                              e.type === 'milestone' ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                            )}>
                              {e.type}
                            </span>
                          </div>

                          {e.type === 'task' && (
                            <div className="flex items-center gap-1 text-[10px] text-gray-500 mt-1">
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-16 text-gray-400 space-y-2 flex-1">
                <CalendarRange className="h-8 w-8 text-gray-300" />
                <p className="text-xs font-medium">Select any day on the calendar to view its milestone deadlines and checklist tasks.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
