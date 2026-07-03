import { Building2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { AppTile } from '@/components/apps/AppTile'
import { APP_MODULES } from '@/utils/constants'

export function InventoryPage() {
  const modules = APP_MODULES.filter((m) => m.category === 'inventory')

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
      </div>

      <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
        <h3 className="font-bold text-emerald-800 mb-2">MLS & Listing Resources</h3>
        <ul className="space-y-2 text-sm text-emerald-700">
          <li>
            <a href="https://inventory.primeamericany.com" target="_blank" rel="noopener noreferrer" className="hover:underline font-medium">→ Open Full MLS Portal (inventory.primeamericany.com)</a>
          </li>
          <li>
            <a href="https://www.rebny.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">→ REBNY — Real Estate Board of New York</a>
          </li>
          <li>
            <a href="https://www.onekey-mls.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">→ OneKey MLS — Greater New York</a>
          </li>
        </ul>
      </div>
    </Layout>
  )
}
