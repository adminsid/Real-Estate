import { useState, useRef, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { LayoutGrid, ExternalLink, Search, X } from 'lucide-react'
import * as Icons from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { NAV_CATEGORIES, isSubitemVisible, isCategoryVisible } from '@/utils/constants'
import clsx from 'clsx'

export function AppsMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const { user, can } = useAuth()

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !window.matchMedia('(max-width: 639px)').matches) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  // Get allowed categories and their sub-items
  const visibleCategories = useMemo(() => {
    return NAV_CATEGORIES.filter((cat) => isCategoryVisible(cat, user, can))
      .map((cat) => {
        const allowedChildren = (cat.children || []).filter((child) =>
          isSubitemVisible(child.id, cat.id, user, can)
        )
        return {
          ...cat,
          children: allowedChildren,
        }
      })
      .filter((cat) => cat.children.length > 0)
  }, [user, can])

  // Flat list of apps filtered by search
  const filteredApps = useMemo(() => {
    const allApps = visibleCategories.flatMap((cat) =>
      cat.children.map((child) => ({
        ...child,
        categoryLabel: cat.label,
        categoryColor: cat.color,
        categoryIcon: cat.icon,
      }))
    )

    // Deduplicate by id or externalUrl
    const seen = new Set<string>()
    const deduped = allApps.filter((app) => {
      const key = app.externalUrl || app.path || app.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (!search.trim()) return deduped
    const q = search.toLowerCase()
    return deduped.filter(
      (app) =>
        app.label.toLowerCase().includes(q) ||
        app.categoryLabel.toLowerCase().includes(q)
    )
  }, [visibleCategories, search])

  return (
    <div className="relative" ref={menuRef}>
      {/* 9-Dot Google Apps Style Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Apps Menu"
        aria-expanded={isOpen}
        title="Apps"
        className={clsx(
          'p-2 rounded-xl transition-all flex items-center justify-center',
          isOpen
            ? 'bg-brand-navy text-brand-gold shadow-sm'
            : 'text-gray-600 hover:text-brand-navy hover:bg-gray-100'
        )}
      >
        <LayoutGrid className="h-5 w-5" />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <>
        <button
          type="button"
          className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[1px] sm:hidden"
          onClick={() => setIsOpen(false)}
          aria-label="Close apps menu"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Workspace apps"
          className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-[80] flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:w-96 sm:max-w-[calc(100vw-2rem)] sm:rounded-2xl sm:zoom-in-95"
        >
          {/* Header */}
          <div className="p-3.5 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-brand-navy/10 flex items-center justify-center text-brand-navy">
                <LayoutGrid className="h-4 w-4 text-brand-navy" />
              </div>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-800">
                  Workspace Apps
                </h3>
                <p className="text-[10px] text-gray-500">Fast access to tools & modules</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-gray-200/60 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Quick Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search apps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-100/70 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-navy"
              />
            </div>
          </div>

          {/* Apps Grid */}
          <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:max-h-[380px] sm:gap-2.5">
            {filteredApps.map((app) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const CategoryIcon = (Icons as Record<string, any>)[
                app.categoryIcon
              ] as React.ComponentType<{ className?: string; style?: React.CSSProperties }>

              if (app.externalUrl) {
                return (
                  <a
                    key={app.id}
                    href={app.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsOpen(false)}
                    className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-center group cursor-pointer"
                  >
                    <div
                      className="h-10 w-10 rounded-xl flex items-center justify-center mb-1.5 shadow-xs transition-transform group-hover:scale-105"
                      style={{ backgroundColor: `${app.categoryColor}15` }}
                    >
                      {CategoryIcon ? (
                        <CategoryIcon
                          className="h-5 w-5"
                          style={{ color: app.categoryColor }}
                        />
                      ) : (
                        <LayoutGrid
                          className="h-5 w-5"
                          style={{ color: app.categoryColor }}
                        />
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-gray-800 line-clamp-1 group-hover:text-brand-navy">
                      {app.label}
                    </span>
                    <span className="flex items-center gap-0.5 text-[8px] font-bold text-amber-600 bg-amber-50 px-1 py-0.2 rounded mt-0.5">
                      EXT <ExternalLink className="h-2 w-2" />
                    </span>
                  </a>
                )
              }

              return (
                <Link
                  key={app.id}
                  to={app.path}
                  onClick={() => setIsOpen(false)}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-center group"
                >
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center mb-1.5 shadow-xs transition-transform group-hover:scale-105"
                    style={{ backgroundColor: `${app.categoryColor}15` }}
                  >
                    {CategoryIcon ? (
                      <CategoryIcon
                        className="h-5 w-5"
                        style={{ color: app.categoryColor }}
                      />
                    ) : (
                      <LayoutGrid
                        className="h-5 w-5"
                        style={{ color: app.categoryColor }}
                      />
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-gray-800 line-clamp-1 group-hover:text-brand-navy">
                    {app.label}
                  </span>
                  <span className="text-[9px] text-gray-400 capitalize">
                    {app.categoryLabel}
                  </span>
                </Link>
              )
            })}
          </div>

          {filteredApps.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-400">
              No matching apps found.
            </div>
          )}
        </div>
        </>
      )}
    </div>
  )
}
