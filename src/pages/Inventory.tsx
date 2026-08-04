import { Building2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { AppTile } from '@/components/apps/AppTile'
import { useAuth } from '@/context/AuthContext'
import { APP_MODULES, isSubitemVisible } from '@/utils/constants'
import type { AppModule } from '@/types'

interface CustomModuleInfo {
  category: string
  visibility?: 'all' | 'admin' | 'broker' | 'admin_broker'
  adminOnly?: boolean
}

export function InventoryPage() {
  const { branding, user, can } = useAuth()
  const customModules = branding.dashboardSettings ? JSON.parse(branding.dashboardSettings).customModules || [] : []
  const visibleCustomModules = (customModules as CustomModuleInfo[]).filter((m) => {
    if (m.category !== 'inventory' || !user) return false
    const visibility = m.visibility || (m.adminOnly ? 'admin' : 'all')
    if (visibility === 'all') return true
    if (visibility === 'admin') return user.role === 'admin'
    if (visibility === 'broker') return user.role === 'broker'
    if (visibility === 'admin_broker') return user.role === 'admin' || user.role === 'broker'
    return false
  })

  const modules = [
    ...APP_MODULES.filter((m) => m.category === 'inventory'),
    ...(visibleCustomModules as unknown as AppModule[])
  ].filter(m => isSubitemVisible(m.id, m.category, user, can))

  return (
    <Layout title="Inventory">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-emerald-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Property Inventory</h2>
          <p className="text-sm text-gray-500">Browse MLS listings and manage your active property inventory</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {modules.map((mod) => (
          <AppTile key={mod.id} module={mod} size="lg" />
        ))}
        {user && ['admin', 'broker'].includes(user.role) && (
          <AppTile module={{ id: 'inventory-reporting', name: 'Reporting', description: 'Showing logs, lead activity and export', icon: 'BarChart3', path: '/inventory/reporting', category: 'inventory', status: 'active', color: 'emerald' } as AppModule} size="lg" />
        )}
      </div>

    </Layout>
  )
}
