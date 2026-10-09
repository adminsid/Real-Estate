import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  buildOperationsCalendarEvents,
  getCalendarDaysForMonth,
  toDateKey,
  type OperationCalendarEvent,
  type ProjectCalendarInput,
} from './operations-calendar'
export function OperationsCalendar({
  projects,
  onOpen,
  onMove,
}: {
  projects: ProjectCalendarInput[]
  onOpen: (event: OperationCalendarEvent) => void
  onMove?: (event: OperationCalendarEvent, date: string) => void
}) {
  const [expandedDays, setExpandedDays] = useState<Record<string, boolean>>({})
  const [date, setDate] = useState(() => new Date())
  const [view, setView] = useState<'week' | 'month'>('week')
  const events = useMemo(
    () => buildOperationsCalendarEvents(projects),
    [projects],
  )
  const days = useMemo(() => {
    if (view === 'month') return getCalendarDaysForMonth(date, events)
    const start = new Date(date)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      return {
        date: day,
        inMonth: true,
        events: events.filter((e) => e.date === toDateKey(day)),
      }
    })
  }, [date, view, events])
  function shift(direction: number) {
    const next = new Date(date)
    if (view === 'week') next.setDate(next.getDate() + direction * 7)
    else {
      next.setDate(1)
      next.setMonth(next.getMonth() + direction)
    }
    setDate(next)
  }
  const today = toDateKey(new Date())
  return (
    <section className="ops-panel">
      <div className="ops-section-heading">
        <div>
          <h2>Project agenda</h2>
          <p>
            {date.toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}{' '}
            ·{' '}
            {onMove
              ? 'Drag to reschedule, or open an item to edit its dates.'
              : 'Select an item to open its project.'}
          </p>
        </div>
        <div className="ops-actions">
          <button onClick={() => setDate(new Date())}>Today</button>
          <button aria-label="Previous period" onClick={() => shift(-1)}>
            <ChevronLeft size={16} />
          </button>
          <button aria-label="Next period" onClick={() => shift(1)}>
            <ChevronRight size={16} />
          </button>
          <select
            aria-label="Calendar view"
            value={view}
            onChange={(e) => setView(e.target.value as 'week' | 'month')}
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </div>
      </div>
      <div className="ops-calendar-legend">
        <span>● Work deadline</span>
        <span className="ops-teal">● Content publication</span>
        <span className="ops-gold">● Project target</span>
      </div>
      <div className="ops-calendar-scroll">
        <div className={`ops-calendar ${view}`}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="ops-weekday">
              {day}

            </div>
          ))}
          {days.map((day) => (
            <div
              key={toDateKey(day.date)}
              className={`ops-day ${day.inMonth ? '' : 'muted'} ${today === toDateKey(day.date) ? 'today' : ''}`}
              onDragOver={(e) => {
                if (onMove) e.preventDefault()
              }}
              onDrop={(e) => {
                e.preventDefault()
                const id = e.dataTransfer.getData('text/plain')
                const item = events.find((x) => x.id === id)
                if (item && onMove) onMove(item, toDateKey(day.date))
              }}
            >
              <span className="ops-day-number">{day.date.getDate()}</span>
              {day.events
                .slice(
                  0,
                  expandedDays[toDateKey(day.date)]
                    ? day.events.length
                    : view === 'week'
                      ? 4
                      : 3,
                )
                .map((event) => (
                  <button
                    key={event.id}
                    draggable={!!onMove && event.kind !== 'project'}
                    onDragStart={(e) =>
                      e.dataTransfer.setData('text/plain', event.id)
                    }
                    onClick={() => onOpen(event)}
                    className={`ops-calendar-item ${event.kind} ${event.done ? 'done' : ''}`}
                    title={event.title}
                  >
                    {projects.length > 1 && (
                      <small>
                        {projects.find((p) => p.id === event.projectId)?.name}
                      </small>
                    )}
                    {event.title}
                  </button>
                ))}
              {day.events.length > (view === 'week' ? 4 : 3) && (
                <button
                  className="ops-calendar-more"
                  onClick={() =>
                    setExpandedDays((current) => ({
                      ...current,
                      [toDateKey(day.date)]: !current[toDateKey(day.date)],
                    }))
                  }
                >
                  {expandedDays[toDateKey(day.date)]
                    ? 'Show less'
                    : `+${day.events.length - (view === 'week' ? 4 : 3)} more`}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      {!events.length && (
        <p className="ops-empty">
          No dates yet. Apply a procedure or give your tasks a deadline.
        </p>
      )}
    </section>
  )
}
