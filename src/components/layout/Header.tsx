import { Menu, Bell, Search, Wifi } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { Link } from 'react-router-dom'

interface HeaderProps {
  title?: string
}

export function Header({ title }: HeaderProps) {
  const { user, branding } = useAuth()
  const { toggleSidebar } = useWorkspace()

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3">
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
      <div className="hidden md:flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 w-64">
        <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search workspace…"
          className="bg-transparent text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none w-full"
        />
      </div>

      {/* PWA online indicator */}
      <div className="hidden sm:flex items-center gap-1 text-xs text-emerald-600">
        <Wifi className="h-3.5 w-3.5" />
        <span>Online</span>
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors">
        <Bell className="h-5 w-5 text-gray-600" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-gold" />
      </button>

      {/* Auth */}
      {user ? (
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-xl hover:bg-gray-50 transition-colors px-2 py-1.5"
        >
          <div className="h-8 w-8 rounded-full bg-brand-navy flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-brand-gold uppercase">
              {user.name.slice(0, 2)}
            </span>
          </div>
          <span className="hidden sm:block text-sm font-medium text-gray-700 truncate max-w-[120px]">
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
