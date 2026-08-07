import { Megaphone, Mail, Download, ExternalLink, Calendar, ArrowUpRight } from 'lucide-react'
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

  // Sample static brand assets list
  const brandAssets = [
    { name: 'Prime America Official Logo (PNG/SVG)', format: 'ZIP Archive', size: '2.4 MB' },
    { name: 'Company Letterhead Document Template', format: 'DOCX Format', size: '1.1 MB' },
    { name: 'Social Media Presentation Slide Kit', format: 'PPTX Format', size: '8.7 MB' },
    { name: 'Digital Business Card QR Template', format: 'PDF Vector', size: '450 KB' },
  ]

  return (
    <Layout title="Marketing">
      {/* Premium Header */}
      <div className="mb-6 flex items-center gap-4 bg-gradient-to-r from-pink-500/10 to-transparent p-5 rounded-2xl border border-pink-500/10">
        <div className="h-12 w-12 rounded-xl bg-pink-500/20 flex items-center justify-center border border-pink-500/30">
          <Megaphone className="h-6 w-6 text-pink-600 animate-pulse" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Marketing Suite</h2>
          <p className="text-sm text-gray-500">Promote your brand, manage CRM marketing campaigns, and download collateral.</p>
        </div>
      </div>

      {/* Metrics Panel */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Email Blast CTR</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">12.4%</span>
            <span className="text-xs font-semibold text-emerald-500 flex items-center gap-0.5">
              +1.8% <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Active Campaigns</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">6 Active</span>
            <span className="text-xs font-normal text-gray-500">running now</span>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">CRM Subscribers</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">2,548</span>
            <span className="text-xs font-semibold text-emerald-500 flex items-center gap-0.5">
              +120 <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Open House RSVPs</span>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-extrabold text-gray-900">42 New</span>
            <span className="text-xs font-semibold text-blue-500">this week</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Core Apps / Tiles Section */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h3 className="font-bold text-gray-800 text-sm mb-3 uppercase tracking-wider">Marketing Modules</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {modules.map((mod) => (
                <AppTile key={mod.id} module={mod} size="lg" />
              ))}
            </div>
          </div>

          {/* Quick Tasks / Campaign Shortcuts */}
          <div className="p-5 bg-white rounded-2xl border border-gray-150 shadow-sm space-y-3">
            <h3 className="font-bold text-gray-900 text-sm">Quick Campaign Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="/marketing/crm"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors text-left"
              >
                <div className="p-2 bg-pink-100 rounded-lg text-pink-600">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-800">Launch Email Blast</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Target lists with templates</p>
                </div>
              </a>
              <a
                href="/marketing/openhouses"
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 border border-gray-100 transition-colors text-left"
              >
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-800">Promote Open House</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Collect feedback and guest signins</p>
                </div>
              </a>
            </div>
          </div>
        </div>

        {/* Brand Asset Library / Sidepanel */}
        <div className="space-y-6">
          <div className="p-5 bg-white rounded-2xl border border-gray-150 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">Official Brand Asset Library</h3>
              <p className="text-[11px] text-gray-500 mt-1">Download approved high-quality Prime America brand files.</p>
            </div>

            <div className="space-y-2">
              {brandAssets.map((asset, i) => (
                <div key={i} className="p-3 bg-gray-50/50 rounded-xl flex items-center justify-between border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-xs font-semibold text-gray-800 truncate">{asset.name}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{asset.format} • {asset.size}</p>
                  </div>
                  <button
                    onClick={() => alert(`Downloading brand asset: ${asset.name}`)}
                    className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Download Asset"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-gray-100 flex justify-between items-center text-[10px] text-gray-500">
              <span>Updated: August 2026</span>
              <a
                href="https://inside.primeamericarealestate.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-600 hover:underline flex items-center gap-0.5 font-bold"
              >
                Go to Brand Hub <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
