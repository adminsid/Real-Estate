import { AlertTriangle, UserX } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function ImpersonationBanner() {
  const { impersonating, stopImpersonating, user } = useAuth()

  if (!impersonating) return null

  return (
    <div className="w-full bg-amber-500 text-amber-950 flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-2 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            You are viewing as <strong>{user?.name}</strong> ({user?.role}) — you only have their permissions.
          </span>
        </div>
        <button
          onClick={stopImpersonating}
          className="flex items-center gap-1.5 rounded-lg bg-amber-950/15 hover:bg-amber-950/25 px-3 py-1.5 text-xs font-bold transition-colors"
        >
          <UserX className="h-3.5 w-3.5" />
          Stop Impersonating
        </button>
      </div>
    </div>
  )
}
