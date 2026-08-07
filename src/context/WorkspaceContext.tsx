import {
  createContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'

export type OperationalMode = 'prospecting' | 'listing' | 'buyer' | 'transaction' | 'compliance'

interface WorkspaceState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  activeCategoryId: string | null
  expandedCategories: Set<string>
  operationalMode: OperationalMode | null
  setOperationalMode: (mode: OperationalMode) => void
  toggleSidebar: () => void
  toggleSidebarCollapsed: () => void
  setSidebarOpen: (v: boolean) => void
  setSidebarCollapsed: (v: boolean) => void
  setActiveCategory: (id: string | null) => void
  toggleCategory: (id: string) => void
  expandCategory: (id: string) => void
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebarCollapsed') === '1'
    } catch {
      return false
    }
  })
  const [activeCategoryId, setActiveCategory] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => {
    try {
      const cached = localStorage.getItem('expandedCategories')
      if (cached) {
        return new Set(JSON.parse(cached))
      }
    } catch (e) {
      console.error('Failed to load navigation categories cache', e)
    }
    return new Set(['transactions', 'inventory', 'marketing', 'learning'])
  })

  // null = never explicitly set → triggers "My Workflow Mode" banner on dashboard
  const [operationalMode, setOperationalModeState] = useState<OperationalMode | null>(() => {
    try {
      const saved = localStorage.getItem('workspace_operational_mode')
      if (saved && ['prospecting', 'listing', 'buyer', 'transaction', 'compliance'].includes(saved)) {
        return saved as OperationalMode
      }
    } catch { console.warn('Unable to access browser storage') }
    return null
  })

  const setOperationalMode = useCallback((mode: OperationalMode) => {
    setOperationalModeState(mode)
    try {
      localStorage.setItem('workspace_operational_mode', mode)
    } catch (e) {
      console.error(e)
    }
    // Best-effort server persist (non-blocking)
    fetch('/api/user/preferences', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operationalMode: mode }),
    }).catch(() => {})
  }, [])

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), [])

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v
      try {
        localStorage.setItem('sidebarCollapsed', next ? '1' : '0')
      } catch { console.warn('Unable to access browser storage') }
      return next
    })
  }, [])

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      try {
        localStorage.setItem('expandedCategories', JSON.stringify(Array.from(next)))
      } catch (e) {
        console.error('Failed to save navigation categories cache', e)
      }
      return next
    })
  }, [])

  const expandCategory = useCallback((id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set([...prev, id])
      try {
        localStorage.setItem('expandedCategories', JSON.stringify(Array.from(next)))
      } catch { /* Ignore browser storage failures. */ }
      return next
    })
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        sidebarOpen,
        sidebarCollapsed,
        activeCategoryId,
        expandedCategories,
        operationalMode,
        setOperationalMode,
        toggleSidebar,
        toggleSidebarCollapsed,
        setSidebarOpen,
        setSidebarCollapsed,
        setActiveCategory,
        toggleCategory,
        expandCategory,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export { useWorkspace } from '@/hooks/useWorkspace'
