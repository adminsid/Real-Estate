import { useState, useEffect } from 'react'
import { AlertTriangle, UserX, UserCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import clsx from 'clsx'

export function ImpersonationBanner() {
  const { impersonating, stopImpersonating, user, isActingAsAssistant, principal } = useAuth()
  const [timeLeft, setTimeLeft] = useState(7200)

  useEffect(() => {
    if (!impersonating) return

    const key = `impersonation_start_time:${impersonating.logId}`
    let startTime = localStorage.getItem(key)
    if (!startTime) {
      startTime = Date.now().toString()
      localStorage.setItem(key, startTime)
    }

    const startMs = Number(startTime)
    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startMs) / 1000)
      const remaining = Math.max(0, 7200 - elapsedSeconds)
      setTimeLeft(remaining)

      if (remaining <= 0) {
        clearInterval(interval)
        stopImpersonating()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [impersonating, stopImpersonating])

  // Assistant banner
  if (isActingAsAssistant && principal) {
    return (
      <div className="w-full flex-shrink-0 transition-colors duration-300 bg-blue-500 text-white">
        <div className="flex items-center justify-between px-4 py-2 max-w-screen-xl mx-auto">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserCheck className="h-4 w-4 flex-shrink-0" />
            <span>
              Working for <strong>{principal.name}</strong> ({principal.email}) — Assistant delegation active.
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (!impersonating) return null

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`
  const isWarning = timeLeft <= 300

  return (
    <div className={clsx("w-full flex-shrink-0 transition-colors duration-300", isWarning ? "bg-red-500 text-white" : "bg-amber-500 text-amber-950")}>
      <div className="flex items-center justify-between px-4 py-2 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className={clsx("h-4 w-4 flex-shrink-0", isWarning && "animate-pulse")} />
          <span>
            You are viewing as <strong>{user?.name}</strong> ({user?.role}) — you only have their permissions.
          </span>
          <span className={clsx("ml-2 px-2 py-0.5 rounded-md font-extrabold text-xs", isWarning ? "bg-red-700 text-white animate-pulse" : "bg-amber-950/15")}>
            Session Expiry: {timeStr}
          </span>
        </div>
        <button
          onClick={stopImpersonating}
          className={clsx(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
            isWarning ? "bg-red-700 hover:bg-red-800 text-white" : "bg-amber-950/15 hover:bg-amber-950/25 text-amber-950"
          )}
        >
          <UserX className="h-3.5 w-3.5" />
          Stop Impersonating
        </button>
      </div>
    </div>
  )
}
