import React, { createContext, useContext, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

interface Notification {
  id: string
  message: string
  created_at: string
}

interface NotificationContextProps {
  notifications: Notification[]
}

const NotificationContext = createContext<NotificationContextProps>({ notifications: [] })

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [toasts, setToasts] = useState<Notification[]>([])

  useEffect(() => {
    if (
      location.pathname.startsWith('/inventory/listings/') ||
      location.pathname.startsWith('/login') ||
      location.pathname.startsWith('/signup') ||
      location.pathname.startsWith('/verify-email') ||
      location.pathname.startsWith('/reset-password') ||
      location.pathname.startsWith('/accept-invite')
    ) {
      return
    }

    let sse: EventSource | null = null

    const connectSSE = () => {
      sse = new EventSource('/api/notifications/stream')

      sse.onmessage = (event) => {
        try {
          const row = JSON.parse(event.data) as Notification
          setNotifications((prev) => [row, ...prev])
          setToasts((prev) => [...prev, row])
          
          // Auto dismiss toast after 5 seconds
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== row.id))
          }, 5000)
        } catch (e) {
          console.error('Failed to parse notification SSE data', e)
        }
      }

      sse.onerror = (e) => {
        console.error('Notification SSE connection lost, reconnecting...', e)
        sse?.close()
        setTimeout(connectSSE, 5000) // retry after 5 seconds
      }
    }

    connectSSE()

    return () => {
      sse?.close()
    }
  }, [location.pathname])

  return (
    <NotificationContext.Provider value={{ notifications }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-brand-navy border border-brand-gold/40 text-white rounded-xl shadow-2xl p-4 flex flex-col gap-1 transition-all duration-300 animate-slide-in-right"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-gold tracking-wide uppercase">Workspace Alert</span>
              <button
                onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="text-white/40 hover:text-white text-xs"
              >
                ✕
              </button>
            </div>
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  return useContext(NotificationContext)
}
