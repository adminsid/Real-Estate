import { Megaphone, ExternalLink } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { AppTile } from '@/components/apps/AppTile'
import { APP_MODULES } from '@/utils/constants'
import { useAuth } from '@/context/AuthContext'

export function MarketingPage() {
  const modules = APP_MODULES.filter((m) => m.category === 'marketing')
  const { branding } = useAuth()

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

      {/* Website preview card */}
      <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-bold text-gray-800">Your Website</p>
            <a
              href={branding.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-brand-navy hover:underline flex items-center gap-1 mt-0.5"
            >
              {branding.websiteUrl} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <a
            href={branding.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-50 text-pink-700 text-sm font-medium hover:bg-pink-100 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Visit
          </a>
        </div>
        <div className="h-32 bg-gradient-to-br from-brand-navy to-brand-navy-light rounded-xl flex items-center justify-center">
          <span className="text-white/30 text-sm">Website Preview</span>
        </div>
      </div>
    </Layout>
  )
}
