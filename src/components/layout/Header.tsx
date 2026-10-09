import { UserAvatar } from '@/components/common/UserAvatar'
import { ConnectionStatus } from './ConnectionStatus'
import { Menu, Target } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Link } from 'react-router-dom'
import { WorkspaceSearch } from './WorkspaceSearch'
import { NotificationBell } from './NotificationBell'
import { AppsMenu } from './AppsMenu'
import { HeaderStatusWidget } from './HeaderStatusWidget'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const { user, branding } = useAuth()
  const { toggleSidebar, primeView } = useWorkspace()

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 shadow-xs">
      {/* Hamburger */}
      <button
        onClick={toggleSidebar}
        className="p-2 rounded-xl hover:bg-gray-100 transition-colors lg:hidden"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5 text-gray-600" />
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {title ? (
          <h1 className="text-lg font-bold text-gray-800 truncate">{title}</h1>
        ) : (
          <span className="text-sm text-gray-500">{branding.tagline}</span>
        )}
      </div>

      {/* Search (desktop) */}
      <WorkspaceSearch />

      {/* Live Command Center Status: Time, Date, Weather */}
      {user && <ConnectionStatus />}
      {user && <HeaderStatusWidget />}

      {/* Apps Launcher (Google Apps Style) */}
      {user && <AppsMenu />}

      {/* Prime View Trigger */}
      {user && (
        <button
          onClick={primeView.togglePrimeView}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-600 hover:text-brand-navy"
          aria-label="Open Prime View — Your Daily Lens"
          title="Prime View — Your Daily Lens"
        >
          <Target className="h-5 w-5" />
        </button>
      )}

      {/* Notifications */}
      {user && <NotificationBell />}

      {/* Auth */}
      {user ? (
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-xl hover:bg-gray-50 transition-colors px-2 py-1.5"
        >
          <UserAvatar name={user.name} src={user.avatarUrl} className="h-8 w-8 text-xs" />
          <span className="hidden xl:block text-sm font-medium text-gray-700 truncate max-w-[120px]">
            {user.name}
          </span>
        </Link>
      ) : (
        <Link
          to="/login"
          className="rounded-xl bg-brand-navy text-white text-sm font-semibold px-4 py-2 hover:bg-brand-navy-light transition-colors"
        >
          Sign In
        </Link>
      )}
    </header>
  )
}
