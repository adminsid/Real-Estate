import {
  createContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'

interface WorkspaceState {
  sidebarOpen: boolean
  activeCategoryId: string | null
  expandedCategories: Set<string>
  toggleSidebar: () => void
  setSidebarOpen: (v: boolean) => void
  setActiveCategory: (id: string | null) => void
  toggleCategory: (id: string) => void
  expandCategory: (id: string) => void
}

export const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeCategoryId, setActiveCategory] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['transactions', 'inventory', 'marketing', 'learning']),
  )

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), [])

  const toggleCategory = useCallback((id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const expandCategory = useCallback((id: string) => {
    setExpandedCategories((prev) => new Set([...prev, id]))
  }, [])

  return (
    <WorkspaceContext.Provider
      value={{
        sidebarOpen,
        activeCategoryId,
        expandedCategories,
        toggleSidebar,
        setSidebarOpen,
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
