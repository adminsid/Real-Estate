import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, X, LogOut, Settings, User2 } from 'lucide-react'
import clsx from 'clsx'
import * as Icons from 'lucide-react'
import { NAV_CATEGORIES } from '@/utils/constants'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import type { NavCategory } from '@/utils/constants'

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, branding, logout } = useAuth()
  const { expandedCategories, toggleCategory } = useWorkspace()
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  function handleLogout() {
    logout()
    navigate('/')
  }

  return (
    <aside className="flex flex-col h-full bg-brand-navy text-white overflow-hidden">
      {/* ── Logo / Brand ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-brand-gold flex items-center justify-center">
            <span className="text-brand-navy font-bold text-sm">RE</span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">{branding.companyName}</p>
            <p className="text-xs text-white/50 leading-tight">Workspace</p>
          </div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors lg:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Dashboard link ────────────────────────────────────────────── */}
      <div className="px-3 pt-4 pb-1">
        <NavLink
          to="/"
          icon="LayoutDashboard"
          label="Dashboard"
          active={location.pathname === '/'}
        />
      </div>

      {/* ── Categories ────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5 scrollbar-hide">
        {NAV_CATEGORIES.map((cat) => (
          <CategoryItem
            key={cat.id}
            category={cat}
            expanded={expandedCategories.has(cat.id)}
            onToggle={() => toggleCategory(cat.id)}
            currentPath={location.pathname}
            hovered={hoveredId === cat.id}
            onHover={setHoveredId}
          />
        ))}
      </nav>

      {/* ── Bottom Actions ────────────────────────────────────────────── */}
      <div className="border-t border-white/10 p-3 space-y-0.5">
        <NavLink to="/network" icon="Network" label="Network" active={location.pathname.startsWith('/network')} />
        <NavLink to="/settings" icon="Settings" label="Settings" active={location.pathname.startsWith('/settings')} />
      </div>

      {/* ── User section ──────────────────────────────────────────────── */}
      <div className="border-t border-white/10 p-4">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-brand-gold/20 border border-brand-gold/30 flex items-center justify-center flex-shrink-0">
              <User2 className="h-4 w-4 text-brand-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-white/40 truncate capitalize">{user.role}</p>
            </div>
            <div className="flex gap-1">
              <Link to="/settings" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <Settings className="h-3.5 w-3.5 text-white/60" />
              </Link>
              <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <LogOut className="h-3.5 w-3.5 text-white/60" />
              </button>
            </div>
          </div>
        ) : (
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-gold text-brand-navy font-semibold text-sm py-2.5 hover:bg-brand-gold-light transition-colors"
          >
            Sign In
          </Link>
        )}
      </div>
    </aside>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NavLink({ to, icon, label, active }: { to: string; icon: string; label: string; active: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as Record<string, any>)[icon] as React.ComponentType<{ className?: string }>
  return (
    <Link
      to={to}
      className={clsx(
        'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors',
        active
          ? 'bg-white/10 text-white'
          : 'text-white/60 hover:text-white hover:bg-white/5',
      )}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
      <span>{label}</span>
    </Link>
  )
}

interface CategoryItemProps {
  category: NavCategory
  expanded: boolean
  onToggle: () => void
  currentPath: string
  hovered: boolean
  onHover: (id: string | null) => void
}

function CategoryItem({ category, expanded, onToggle, currentPath, onHover }: CategoryItemProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as Record<string, any>)[category.icon] as React.ComponentType<{ className?: string }>
  const isActive = currentPath.startsWith(category.path)

  return (
    <div>
      <button
        onClick={onToggle}
        onMouseEnter={() => onHover(category.id)}
        onMouseLeave={() => onHover(null)}
        className={clsx(
          'flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm font-medium transition-colors',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/60 hover:text-white hover:bg-white/5',
        )}
      >
        {Icon && (
          <Icon
            className="h-4 w-4 flex-shrink-0"
            // @ts-expect-error inline style
            style={{ color: isActive ? category.color : undefined }}
          />
        )}
        <span className="flex-1 text-left">{category.label}</span>
        {category.children && (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            : <ChevronRight className="h-3.5 w-3.5 text-white/40" />
        )}
      </button>

      {/* Sub-items */}
      {expanded && category.children && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {category.children.map((child) => {
            const active = currentPath === child.path
            return (
              <Link
                key={child.id}
                to={child.path}
                className={clsx(
                  'flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  active
                    ? 'text-brand-gold bg-white/5'
                    : 'text-white/50 hover:text-white hover:bg-white/5',
                )}
              >
                <span className="truncate">{child.label}</span>
                {child.status === 'under_construction' && (
                  <span className="flex-shrink-0 text-[10px] bg-amber-400/20 text-amber-400 rounded px-1">WIP</span>
                )}
                {child.status === 'coming_soon' && (
                  <span className="flex-shrink-0 text-[10px] bg-purple-400/20 text-purple-400 rounded px-1">Soon</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
