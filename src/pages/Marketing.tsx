import { Megaphone } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { AppTile } from '@/components/apps/AppTile'
import { APP_MODULES, isSubitemVisible } from '@/utils/constants'
import { useAuth } from '@/context/AuthContext'
import type { AppModule } from '@/types'

interface CustomModuleInfo {
  category: string
  visibility?: 'all' | 'admin' | 'broker' | 'admin_broker'
  adminOnly?: boolean
}

export function MarketingPage() {
  const { branding, user, can } = useAuth()
  const customModules = branding.dashboardSettings ? JSON.parse(branding.dashboardSettings).customModules || [] : []
  const visibleCustomModules = (customModules as CustomModuleInfo[]).filter((m) => {
    if (m.category !== 'marketing' || !user) return false
    const visibility = m.visibility || (m.adminOnly ? 'admin' : 'all')
    if (visibility === 'all') return true
    if (visibility === 'admin') return user.role === 'admin'
    if (visibility === 'broker') return user.role === 'broker'
    if (visibility === 'admin_broker') return user.role === 'admin' || user.role === 'broker'
    return false
  })

  const modules = [
    ...APP_MODULES.filter((m) => m.category === 'marketing'),
    ...(visibleCustomModules as unknown as AppModule[])
  ].filter(m => isSubitemVisible(m.id, m.category, user, can))

  return (
    <Layout title="Marketing">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-pink-100 flex items-center justify-center">
          <Megaphone className="h-5 w-5 text-pink-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Marketing Suite</h2>
          <p className="text-sm text-gray-500">Manage your online presence, CRM, and marketing campaigns</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {modules.map((mod) => (
          <AppTile key={mod.id} module={mod} size="lg" />
        ))}
      </div>
    </Layout>
  )
}
