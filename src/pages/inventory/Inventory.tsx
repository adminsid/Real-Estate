import { Building2, ArrowUpRight } from 'lucide-react'
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
      {/* Premium Header */}
      <div className="mb-6 flex items-center gap-4 bg-gradient-to-r from-emerald-500/10 to-transparent p-5 rounded-2xl border border-emerald-500/10">
        <div className="h-12 w-12 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
          <Building2 className="h-6 w-6 text-emerald-600 animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Property Inventory</h2>
          <p className="text-sm text-gray-500">Access MLS listings, manage in-house listings, and generate comparative market analyses.</p>
        </div>
      </div>

      {/* Metrics Panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Active Inventory</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">14 listings</span>
            <span className="text-xs font-semibold text-emerald-500 flex items-center gap-0.5">
              +2 new <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Portfolio Value</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">$38.5M</span>
            <span className="text-xs font-normal text-gray-500">managed value</span>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Active Open Houses</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">3 Active</span>
            <span className="text-xs font-semibold text-blue-500">scheduled</span>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">CMA Reports Generated</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">28 total</span>
            <span className="text-xs font-semibold text-emerald-500">99% accuracy</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Modules & Listing Directory */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Left Side: Modules & Directory */}
        <div className="lg:col-span-2 space-y-8">
          {/* Modules List */}
          <div>
            <h3 className="font-bold text-gray-800 text-sm mb-3 uppercase tracking-wider">Inventory Modules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {modules.map((mod) => (
                <AppTile key={mod.id} module={mod} size="lg" />
              ))}
              {user && ['admin', 'broker'].includes(user.role) && (
                <AppTile module={{ id: 'inventory-reporting', name: 'Reporting', description: 'Showing logs, lead activity and export', icon: 'BarChart3', path: '/inventory/reporting', category: 'inventory', status: 'active', color: 'emerald' } as AppModule} size="lg" />
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Fast Inventory Tools */}
        <div className="space-y-6">
          <div className="p-5 bg-white rounded-2xl border border-gray-150 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Inventory Quick Actions</h3>
              <p className="text-[11px] text-gray-500 mt-1">Manage listings or evaluate market comps instantly.</p>
            </div>

            <div className="space-y-2">
              <a
                href="/inventory/mls"
                className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all text-left"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-xs font-bold text-gray-800">Search MLS Database</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">Access public NY real estate feeds</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              </a>

              <a
                href="/inventory/cma"
                className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100 hover:bg-gray-50 transition-all text-left"
              >
                <div className="min-w-0 pr-3">
                  <p className="text-xs font-bold text-gray-800">Create New CMA Valuation</p>
                  <p className="text-[9px] text-gray-400 mt-0.5">Determine current property value</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
