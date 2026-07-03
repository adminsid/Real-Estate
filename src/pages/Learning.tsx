import { GraduationCap, ExternalLink, CheckCircle2 } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { NY_LAW_RESOURCES } from '@/utils/constants'
import { APP_MODULES } from '@/utils/constants'
import { AppTile } from '@/components/apps/AppTile'

export function LearningPage() {
  const modules = APP_MODULES.filter((m) => m.category === 'learning')

  return (
    <Layout title="Learning & Education">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <GraduationCap className="h-5 w-5 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-800">Learning Hub</h2>
          <p className="text-sm text-gray-500">Continuing education, license law, and professional development</p>
        </div>
      </div>

      {/* App tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {modules.map((mod) => (
          <AppTile key={mod.id} module={mod} size="lg" />
        ))}
      </div>

      {/* CE Requirements summary */}
      <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 mb-6">
        <h3 className="font-bold text-indigo-800 mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" />
          NY CE Requirements — Salesperson
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { label: 'Total CE Hours', value: '22.5 hrs', detail: 'Every 2-year renewal' },
            { label: 'Fair Housing', value: '3 hrs', detail: 'Required component' },
            { label: 'Agency', value: '1 hr', detail: 'Required component' },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-xl p-4 shadow-sm">
              <p className="text-2xl font-bold text-indigo-700">{item.value}</p>
              <p className="font-medium text-gray-700 mt-0.5">{item.label}</p>
              <p className="text-xs text-gray-400 mt-1">{item.detail}</p>
            </div>
          ))}
        </div>
        <a
          href="https://primeamerica.theceshop.com/real-estate/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900"
        >
          Start CE courses at Prime America Academy <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* License Law Resources */}
      <h3 className="text-base font-bold text-gray-800 mb-4">NY Real Estate Law Resources</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {NY_LAW_RESOURCES.map((res) => (
          <a
            key={res.title}
            href={res.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-white rounded-2xl shadow-card border border-gray-100 p-5 hover:shadow-card-hover hover:-translate-y-0.5 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5 mb-2 inline-block">
                  {res.category}
                </span>
                <p className="font-semibold text-gray-800 leading-tight">{res.title}</p>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{res.description}</p>
              </div>
              <ExternalLink className="h-4 w-4 text-gray-300 group-hover:text-indigo-500 flex-shrink-0 mt-1 transition-colors" />
            </div>
          </a>
        ))}
      </div>
    </Layout>
  )
}
