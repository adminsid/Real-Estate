import { useState } from 'react'
import { useTransactionDetail } from './TransactionContext'
import { CalendarDays, Send, Plus } from 'lucide-react'

export function TransactionTimelineTab() {
  const {
    data,
    handleNotifyTeam,
    handleCreateChecklistReminder
  } = useTransactionDetail()

  const { transaction: tx } = data
  const [notifyingMilestone, setNotifyingMilestone] = useState<string | null>(null)
  const [creatingTaskMilestone, setCreatingTaskMilestone] = useState<string | null>(null)

  const milestoneItems = [
    { key: 'listed_date', label: 'Listed Date', val: tx.listed_date },
    { key: 'expire_date', label: 'Agreement Expiration', val: tx.expire_date },
    { key: 'offer_date', label: 'Offer Date', val: tx.offer_date },
    { key: 'pending_date', label: 'Offer Accepted / Pending Date', val: tx.pending_date },
    { key: 'home_inspection_date', label: 'Home Inspection Date', val: tx.home_inspection_date },
    { key: 'possession_date', label: 'Possession Date', val: tx.possession_date },
    { key: 'escrow_date', label: 'Escrow Deposit Date', val: tx.escrow_date },
    { key: 'inspection_deadline', label: 'Inspection Contingency Deadline', val: tx.inspection_deadline },
    { key: 'appraisal_date', label: 'Appraisal Contingency Date', val: tx.appraisal_date },
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

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
      <div>
        <h3 className="font-bold text-gray-950 text-sm">Deal Journey Timeline</h3>
        <p className="text-xs text-gray-500">Track and share contract milestones with clients & attorneys.</p>
      </div>

      <div className="relative border-l border-gray-200 ml-4 pl-6 space-y-8">
        {milestoneItems.map((item) => (
          <div key={item.key} className="relative">
            <span className="absolute -left-[31px] top-0.5 bg-blue-100 text-blue-700 rounded-full p-1 border-2 border-white">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider">{item.label}</h4>
                <p className="text-xs font-semibold text-gray-900 mt-1">
                  {item.val ? <u>{item.val}</u> : <span className="italic text-gray-400">Date not scheduled</span>}
                </p>
              </div>
              {item.val && (
                <div className="flex items-center gap-1.5 no-print">
                  <button
                    onClick={() => handleCreateIcsFile(item.label, item.val!)}
                    className="text-xs bg-slate-50 border hover:bg-slate-100 text-gray-700 px-2.5 py-1.5 rounded-lg font-bold"
                  >
                    📅 Export ICS
                  </button>
                  <button
                    onClick={() => handleCreateReminderClick(item.label, item.val!)}
                    disabled={creatingTaskMilestone === item.label}
                    className="text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg font-bold disabled:opacity-50 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {creatingTaskMilestone === item.label ? 'Creating...' : 'Create Reminder'}
                  </button>
                  <button
                    onClick={() => handleNotifyClick(item.key, item.val!)}
                    disabled={notifyingMilestone === item.key}
                    className="text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg font-bold disabled:opacity-50 flex items-center gap-1"
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
  )
}
