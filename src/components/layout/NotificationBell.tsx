import { useState, useEffect, useRef, useMemo } from 'react'
import { Bell, Check, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

export function NotificationBell() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [filter, setFilter] = useState<'all' | 'urgent' | 'today'>('all')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications')
      const data = await res.json()
      if (data.success || Array.isArray(data)) {
        const raw = data.notifications || data.data || data || []
        const notifs = Array.isArray(raw) ? raw : (raw.notifications || [])
        setNotifications(notifs)
        setUnreadCount(notifs.filter((n: any) => !n.is_read).length)
      }
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchNotifications()

    let eventSource: EventSource | null = null
    let reconnectTimeout: any = null

    const connectSSE = () => {
      eventSource = new EventSource('/api/notifications/stream', { withCredentials: true })

      eventSource.onmessage = (event) => {
        try {
          const row = JSON.parse(event.data)
          if (row && row.id) {
            setNotifications((prev) => {
              if (prev.some((n) => n.id === row.id)) return prev
              const next = [row, ...prev]
              setUnreadCount(next.filter((n: any) => !n.is_read).length)
              return next
            })
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }
        reconnectTimeout = setTimeout(connectSSE, 10000)
      }
    }

    connectSSE()

    return () => {
      if (eventSource) eventSource.close()
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)))
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (e) {
      console.error(e)
    }
  }

  const dismissNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    try {
      await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error(e)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })))
      setUnreadCount(0)
    } catch (e) {
      console.error(e)
    }
  }

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (filter === 'urgent') return n.priority === 'urgent'
      if (filter === 'today') return n.priority === 'today' || n.priority === 'urgent'
      return true
    })
  }, [notifications, filter])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-4.5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-88 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h3 className="font-bold text-gray-900 text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="flex border-b border-gray-100 bg-gray-50/30 px-3 py-1.5 gap-1 text-[11px]">
            {(['all', 'urgent', 'today'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg font-bold capitalize transition-colors',
                  filter === t ? 'bg-brand-navy text-white' : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {filteredNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-xs">
                No notifications matching this filter.
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {filteredNotifications.map((notif) => (
                  <li
                    key={notif.id}
                    className={clsx(
                      'px-4 py-3 hover:bg-gray-50 transition-colors relative group text-xs',
                      !notif.is_read ? 'bg-blue-50/30' : ''
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {notif.priority === 'urgent' && (
                            <span className="bg-red-100 text-red-700 text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase">Urgent</span>
                          )}
                          <p className="text-xs font-semibold text-gray-800 leading-snug">{notif.message}</p>
                        </div>

                        {notif.action_url && (
                          <Link
                            to={notif.action_url}
                            onClick={() => {
                              if (!notif.is_read) markAsRead(notif.id)
                              setIsOpen(false)
                            }}
                            className="text-xs text-blue-600 hover:underline font-bold mt-1 inline-block"
                          >
                            View Details →
                          </Link>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        {!notif.is_read && (
                          <button
                            onClick={() => markAsRead(notif.id)}
                            className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Mark as read"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => dismissNotification(notif.id)}
                          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                          title="Dismiss"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
