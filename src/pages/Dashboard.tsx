import { TrendingUp, Home, Users, BookOpen, ArrowRight, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { AppTile } from '@/components/apps/AppTile'
import { useAuth } from '@/context/AuthContext'
import { APP_MODULES, NAV_CATEGORIES } from '@/utils/constants'

const STAT_CARDS = [
  { icon: Home, label: 'Active Listings', value: '—', trend: null, color: '#10B981' },
  { icon: Users, label: 'CRM Contacts', value: '—', trend: null, color: '#3B82F6' },
  { icon: TrendingUp, label: 'Transactions', value: '—', trend: null, color: '#8B5CF6' },
  { icon: Star, label: 'Network', value: '—', trend: null, color: '#F59E0B' },
]

export function DashboardPage() {
  const { user, branding } = useAuth()

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <Layout title="Dashboard">
      {/* ── Welcome banner ──────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-navy to-brand-navy-light p-6 mb-6 text-white overflow-hidden relative">
        <div className="absolute right-0 top-0 w-64 h-64 rounded-full bg-brand-gold/10 -translate-y-16 translate-x-16" />
        <div className="relative">
          <p className="text-white/60 text-sm mb-1">
            {greeting()}{user ? `, ${user.name}` : ''}
          </p>
          <h2 className="text-2xl font-bold mb-1">{branding.companyName}</h2>
          <p className="text-white/70 text-sm">{branding.tagline}</p>
          {!user && (
            <div className="mt-4 flex gap-3">
              <Link
                to="/signup"
                className="rounded-xl bg-brand-gold text-brand-navy font-semibold text-sm px-5 py-2.5 hover:bg-brand-gold-light transition-colors"
              >
                Get Started Free
              </Link>
              <Link
                to="/login"
                className="rounded-xl border border-white/20 text-white font-medium text-sm px-5 py-2.5 hover:bg-white/10 transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl p-5 shadow-card border border-gray-100">
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center mb-3"
              style={{ backgroundColor: card.color + '18' }}
            >
              <card.icon className="h-5 w-5" style={{ color: card.color }} />
            </div>
            <p className="text-2xl font-bold text-gray-800">{card.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* ── App categories ──────────────────────────────────────────── */}
      {NAV_CATEGORIES.map((cat) => {
        const modules = APP_MODULES.filter((m) => m.category === cat.id)
        if (modules.length === 0) return null
        return (
          <section key={cat.id} className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="h-1.5 w-6 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <h3 className="text-base font-bold text-gray-800">{cat.label}</h3>
              </div>
              <Link
                to={cat.path}
                className="text-xs font-medium text-gray-400 hover:text-brand-navy flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {modules.map((mod) => (
                <AppTile key={mod.id} module={mod} />
              ))}
            </div>
          </section>
        )
      })}

      {/* ── Quick links ─────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-1.5 w-6 rounded-full bg-gray-300" />
          <h3 className="text-base font-bold text-gray-800">Quick Links</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'MLS Listings', url: 'https://inventory.primeamericany.com', icon: Home },
            { label: 'Academy', url: 'https://primeamerica.theceshop.com/real-estate/', icon: BookOpen },
            { label: 'Company Website', url: 'https://primeamericany.com', icon: TrendingUp },
          ].map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-white rounded-xl p-4 shadow-card border border-gray-100 hover:shadow-card-hover hover:-translate-y-0.5 transition-all text-sm font-medium text-gray-700"
            >
              <link.icon className="h-5 w-5 text-brand-navy flex-shrink-0" />
              {link.label}
            </a>
          ))}
        </div>
      </section>
    </Layout>
  )
}
