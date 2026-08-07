import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, X, LogOut, Settings, User2 } from 'lucide-react'
import clsx from 'clsx'
import * as Icons from 'lucide-react'
import { NAV_CATEGORIES, isCategoryVisible, isSubitemVisible } from '@/utils/constants'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { ExternalAppBridgeModal } from '@/components/common/ExternalAppBridgeModal'
import type { NavCategory } from '@/utils/constants'

interface SidebarProps {
  collapsed?: boolean
  onClose?: () => void
}

export function Sidebar({ collapsed = false, onClose }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, branding, logout, can } = useAuth()
  const { expandedCategories, toggleCategory, toggleSidebarCollapsed } = useWorkspace()
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [bridgeTarget, setBridgeTarget] = useState<{ name: string; url: string } | null>(null)
  const isAdminOrBroker = user && ['admin', 'broker'].includes(user.role)

  const mergedCategories = useMemo(() => {
    type CustomModule = {
      id: string
      name: string
      path: string
      externalUrl?: string
      status?: 'active' | 'coming_soon' | 'under_construction'
      category: string
      visibility?: 'all' | 'admin' | 'broker' | 'admin_broker'
      adminOnly?: boolean
      showInNavigation?: boolean
    }

    let customModules: CustomModule[] = []
    try {
      const parsed = branding.dashboardSettings ? JSON.parse(branding.dashboardSettings) : null
      customModules = Array.isArray(parsed?.customModules) ? parsed.customModules : []
    } catch {
      customModules = []
    }

    const visibleNavModules = customModules.filter((m) => {
      if (!m.showInNavigation || !user) return false
      const visibility = m.visibility || (m.adminOnly ? 'admin' : 'all')
      if (visibility === 'all') return true
      if (visibility === 'admin') return user.role === 'admin'
      if (visibility === 'broker') return user.role === 'broker'
      if (visibility === 'admin_broker') return user.role === 'admin' || user.role === 'broker'
      return false
    })

    return NAV_CATEGORIES.map((cat) => {
      const customChildren = visibleNavModules
        .filter((m) => m.category === cat.id)
        .map((m) => ({
          id: m.id,
          label: m.name,
          path: m.path,
          status: m.status,
          externalUrl: m.externalUrl,
        }))

      return {
        ...cat,
        children: [...(cat.children || []), ...customChildren],
      }
    })
  }, [branding.dashboardSettings, user])

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <aside className="flex flex-col h-full bg-brand-navy text-white overflow-hidden">
      {/* ── Logo / Brand ──────────────────────────────────────────────── */}
      <div className={clsx('flex items-center justify-between border-b border-white/10', collapsed ? 'px-3 py-4 lg:justify-center' : 'px-5 py-4')}>
        <Link to="/" className={clsx('flex items-center gap-3 min-w-0', collapsed && 'lg:gap-0')}>
          <div className="flex-shrink-0 h-9 w-9 rounded-xl overflow-hidden bg-brand-gold flex items-center justify-center">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-brand-navy font-bold text-sm">RE</span>
            )}
          </div>
          <div className={clsx('min-w-0', collapsed && 'lg:hidden')}>
            <p className="font-bold text-sm leading-tight truncate">{branding.companyName}</p>
            <p className="text-xs text-white/50 leading-tight">Workspace</p>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          {/* Collapse Toggle (Desktop) */}
          <button
            onClick={toggleSidebarCollapsed}
            className="hidden lg:flex p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <Icons.ChevronLeft className="h-4 w-4" />}
          </button>
          
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors lg:hidden">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Dashboard & Network links ─────────────────────────────────── */}
      <div className="px-3 pt-4 pb-1 space-y-0.5">
        <NavLink
          to="/"
          icon="LayoutDashboard"
          label="Dashboard"
          active={location.pathname === '/'}
          collapsed={collapsed}
        />
        {(!user || user.role === 'admin' || can('network', 'read')) && (
          <NavLink
            to="/network"
            icon="Network"
            label="Network"
            active={location.pathname.startsWith('/network')}
            collapsed={collapsed}
          />
        )}
      </div>

      {/* ── Categories ────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5 scrollbar-hide">
        {mergedCategories.filter(cat => isCategoryVisible(cat, user, can)).map((cat) => (
          <CategoryItem
            key={cat.id}
            category={cat}
            expanded={expandedCategories.has(cat.id)}
            onToggle={() => toggleCategory(cat.id)}
            currentPath={location.pathname}
            hovered={hoveredId === cat.id}
            onHover={setHoveredId}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* ── Bottom Actions ────────────────────────────────────────────── */}
      <div className="border-t border-white/10 p-3 space-y-0.5">
        {isAdminOrBroker && (
          <>
            {(!user || user.role === 'admin' || can('hr', 'read')) && (
              <NavLink to="/hr" icon="Briefcase" label="HR" active={location.pathname === '/hr'} collapsed={collapsed} />
            )}
            {user && user.role === 'admin' && (
              <NavLink to="/user-management" icon="Users" label="User-Management" active={location.pathname.startsWith('/user-management')} collapsed={collapsed} />
            )}
          </>
        )}
        <NavLink to="/settings" icon="Settings" label="Settings" active={location.pathname.startsWith('/settings')} collapsed={collapsed} />
      </div>

      {/* ── User section ──────────────────────────────────────────────── */}
      <div className={clsx('border-t border-white/10', collapsed ? 'p-2 lg:p-3' : 'p-4')}>
        {user ? (
          <div className={clsx('flex items-center', collapsed ? 'lg:flex-col lg:gap-2' : 'gap-3')}>
            <div className="h-8 w-8 rounded-full bg-brand-gold/20 border border-brand-gold/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <User2 className="h-4 w-4 text-brand-gold" />
              )}
            </div>
            <div className={clsx('flex-1 min-w-0', collapsed && 'lg:hidden')}>
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-white/40 truncate capitalize">{user.role}</p>
            </div>
            <div className={clsx('flex gap-1', collapsed && 'lg:flex-col')}>
              <Link to="/settings" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <Settings className="h-3.5 w-3.5 text-white/60" />
              </Link>
              <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <LogOut className="h-3.5 w-3.5 text-white/60" />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {bridgeTarget && (
        <ExternalAppBridgeModal
          appName={bridgeTarget.name}
          externalUrl={bridgeTarget.url}
          onClose={() => setBridgeTarget(null)}
        />
      )}
    </aside>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NavLink({ to, icon, label, active, collapsed }: { to: string; icon: string; label: string; active: boolean; collapsed?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as Record<string, any>)[icon] as React.ComponentType<{ className?: string }>
  return (
    <Link
      to={to}
      title={label}
      className={clsx(
        'flex items-center px-3 py-2 rounded-xl text-sm font-medium transition-colors',
        collapsed ? 'gap-0 lg:justify-center' : 'gap-3',
        active
          ? 'bg-white/10 text-white'
          : 'text-white/60 hover:text-white hover:bg-white/5',
      )}
    >
      {Icon && <Icon className="h-4 w-4 flex-shrink-0" />}
      <span className={clsx(collapsed && 'lg:hidden')}>{label}</span>
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
  collapsed?: boolean
}

function CategoryItem({ category, expanded, onToggle, currentPath, onHover, collapsed }: CategoryItemProps) {
  const { user, can } = useAuth()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Icons as Record<string, any>)[category.icon] as React.ComponentType<{ className?: string }>
  const isActive = currentPath.startsWith(category.path)

  return (
    <div>
      <div
        onMouseEnter={() => onHover(category.id)}
        onMouseLeave={() => onHover(null)}
        title={category.label}
        className={clsx(
          'flex items-center justify-between w-full rounded-xl transition-colors',
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/60 hover:text-white hover:bg-white/5',
        )}
      >
        <Link
          to={category.path}
          className={clsx('flex items-center flex-1 px-3 py-2 text-sm font-medium', collapsed ? 'gap-0 lg:justify-center' : 'gap-3')}
        >
          {Icon && (
            <Icon
              className="h-4 w-4 flex-shrink-0"
              // @ts-expect-error inline style
              style={{ color: isActive ? category.color : undefined }}
            />
          )}
          <span className={clsx('truncate', collapsed && 'lg:hidden')}>{category.label}</span>
        </Link>
        {!collapsed && category.children && category.children.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggle()
            }}
            aria-label={expanded ? `Collapse ${category.label}` : `Expand ${category.label}`}
            aria-expanded={expanded}
            className="p-2 mr-1 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Sub-items */}
      {!collapsed && expanded && category.children && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
          {category.children.filter(child => isSubitemVisible(child.id, category.id, user, can)).map((child) => {
            const active = currentPath === child.path
            const classNames = clsx(
              'flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer',
              active
                ? 'text-brand-gold bg-white/5'
                : 'text-white/50 hover:text-white hover:bg-white/5',
            )

            if (child.externalUrl) {
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => window.open(child.externalUrl!, '_blank', 'noopener,noreferrer')}
                  className={classNames}
                >
                  <span className="truncate">{child.label}</span>
                  <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1 py-0.5 rounded border border-amber-400/20">
                    EXT <Icons.ExternalLink className="h-2.5 w-2.5" />
                  </span>
                </button>
              )
            }

            return (
              <Link
                key={child.id}
                to={child.path}
                className={classNames}
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
