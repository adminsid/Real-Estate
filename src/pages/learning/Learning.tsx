import { useEffect, useState } from 'react'
import { GraduationCap, ExternalLink, CheckCircle2, Calendar, AlertTriangle, Info } from 'lucide-react'
import clsx from 'clsx'
import { Layout } from '@/components/layout/Layout'
import { APP_MODULES, NY_LAW_RESOURCES, isSubitemVisible } from '@/utils/constants'
import { AppTile } from '@/components/apps/AppTile'
import { useAuth } from '@/context/AuthContext'
import type { AppModule } from '@/types'

interface CustomModuleInfo {
  category: string
  visibility?: 'all' | 'admin' | 'broker' | 'admin_broker'
  adminOnly?: boolean
}

export function LearningPage() {
  const { branding, user, can, refreshUser } = useAuth()
  const [expiryInput, setExpiryInput] = useState(user?.license_expiration_date || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const expiryStorageKey = user ? `license_expiration_date:${user.id}` : null

  const customModules = branding.dashboardSettings ? JSON.parse(branding.dashboardSettings).customModules || [] : []
  const visibleCustomModules = (customModules as CustomModuleInfo[]).filter((m) => {
    if (m.category !== 'learning' || !user) return false
    const visibility = m.visibility || (m.adminOnly ? 'admin' : 'all')
    if (visibility === 'all') return true
    if (visibility === 'admin') return user.role === 'admin'
    if (visibility === 'broker') return user.role === 'broker'
    if (visibility === 'admin_broker') return user.role === 'admin' || user.role === 'broker'
    return false
  })

  const modules = [
    ...APP_MODULES.filter((m) => m.category === 'learning'),
    ...(visibleCustomModules as unknown as AppModule[])
  ].filter(m => isSubitemVisible(m.id, m.category, user, can))

  useEffect(() => {
    if (!expiryStorageKey) return
    const fromProfile = user?.license_expiration_date || ''
    if (fromProfile) {
      setExpiryInput(fromProfile)
      localStorage.setItem(expiryStorageKey, fromProfile)
      return
    }
    const cached = localStorage.getItem(expiryStorageKey)
    if (cached) setExpiryInput(cached)
  }, [expiryStorageKey, user?.license_expiration_date])

  function parseDateOnly(iso: string) {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
  }

  // License Expiration Calculations
  const effectiveExpiry = user?.license_expiration_date || expiryInput || null
  const expirationDate = effectiveExpiry ? parseDateOnly(effectiveExpiry) : null
  const daysRemaining = expirationDate ? Math.ceil((expirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 90 && daysRemaining > 0
  const isExpired = daysRemaining !== null && daysRemaining <= 0

  const handleUpdateLicenseExpiry = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsUpdating(true)
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_expiration_date: expiryInput || null })
      })
      if (res.ok) {
        if (expiryStorageKey) {
          if (expiryInput) localStorage.setItem(expiryStorageKey, expiryInput)
          else localStorage.removeItem(expiryStorageKey)
        }
        await refreshUser()
        alert('License expiration date updated successfully!')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <Layout title="Learning & Education">
      <div className="mb-6 flex items-center justify-between border-b border-gray-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Learning Hub</h2>
            <p className="text-sm text-gray-500">Continuing education, license law, and professional development</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Learning list */}
        <div className="lg:col-span-2 space-y-6">
          {/* App tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {modules.map((mod) => (
              <AppTile key={mod.id} module={mod} size="lg" />
            ))}
          </div>

          {/* CE Requirements summary */}
          <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100">
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
          <div>
            <h3 className="text-base font-bold text-gray-800 mb-4">NY Real Estate Law Resources</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
        </div>

        {/* Expiration and renewal sidebar tracker */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-indigo-600" />
              License Expiration Tracker
            </h3>
            
            {expirationDate ? (
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center">
                  <p className="text-xs text-gray-400 font-medium">Expiration Date</p>
                  <p className="text-lg font-bold text-gray-800 mt-1">
                    {expirationDate.toLocaleDateString('en-US', { dateStyle: 'long' })}
                  </p>
                  {daysRemaining !== null && (
                    <p className={clsx(
                      "text-xs font-semibold mt-2 inline-block px-2.5 py-1 rounded-full",
                      isExpired ? "bg-red-100 text-red-800" :
                      isExpiringSoon ? "bg-amber-100 text-amber-800" :
                      "bg-emerald-100 text-emerald-800"
                    )}>
                      {isExpired ? 'Expired' : isExpiringSoon ? `${daysRemaining} days left (Warning)` : `${daysRemaining} days remaining`}
                    </p>
                  )}
                </div>

                {isExpiringSoon && (
                  <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-800 flex gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-bold">Renewal Approaching!</p>
                      <p className="mt-0.5">Please make sure to complete your 22.5 hours CE requirements before filing renewal.</p>
                    </div>
                  </div>
                )}

                {isExpired && (
                  <div className="bg-red-50 rounded-xl p-3 border border-red-200 text-xs text-red-800 flex gap-2">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-bold">License Expired!</p>
                      <p className="mt-0.5">Your license is expired. You must immediately complete requirements and file renewal via eAccessNY to practice.</p>
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-4">
                  <h4 className="font-bold text-xs text-gray-500 uppercase mb-2">Step-by-step NY Renewal Instructions</h4>
                  <ul className="space-y-2 text-xs text-gray-600">
                    <li className="flex gap-2">
                      <span className="h-4 w-4 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-[10px]">1</span>
                      <span>Complete 22.5 hours of approved continuing education.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="h-4 w-4 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-[10px]">2</span>
                      <span>Log into your NYS <a href="https://my.ny.gov/" target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">eAccessNY Portal</a>.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="h-4 w-4 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-[10px]">3</span>
                      <span>Select "License Renewal" under your ID, pay the renewal fee, and submit.</span>
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 text-center text-xs text-gray-400">
                <Info className="h-5 w-5 mx-auto mb-2 text-gray-300" />
                No license expiration date set yet. Select a date below to track.
              </div>
            )}

            <form onSubmit={handleUpdateLicenseExpiry} className="mt-4 pt-4 border-t border-gray-100 space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Set Expiration Date</label>
                <input
                  type="date"
                  value={expiryInput}
                  onChange={e => setExpiryInput(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
              <button
                type="submit"
                disabled={isUpdating}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl text-xs transition-colors"
              >
                {isUpdating ? 'Updating...' : 'Save Expiration Date'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  )
}
