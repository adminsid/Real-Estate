import { useEffect } from 'react'
import clsx from 'clsx'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { ImpersonationBanner } from '@/components/ImpersonationBanner'
import { useWorkspace } from '@/context/WorkspaceContext'

interface LayoutProps {
  children: React.ReactNode
  title?: string
}

export function Layout({ children, title }: LayoutProps) {
  const { sidebarOpen, sidebarCollapsed, setSidebarOpen } = useWorkspace()

  // Close sidebar on small screens when route changes
  useEffect(() => {
    const handler = () => {
      if (window.innerWidth < 1024) setSidebarOpen(false)
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [setSidebarOpen])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      <ImpersonationBanner />
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Sidebar overlay (mobile) ────────────────────────────────── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div
          className={clsx(
            'fixed lg:static inset-y-0 left-0 z-50 w-64 flex-shrink-0 transition-all duration-250',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
            sidebarCollapsed ? 'lg:w-20' : 'lg:w-64',
            'lg:flex lg:flex-col',
          )}
        >
          <Sidebar collapsed={sidebarCollapsed} onClose={() => setSidebarOpen(false)} />
        </div>

        {/* ── Main area ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header title={title} />
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  )
}
