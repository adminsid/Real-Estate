import { useState } from 'react'
import { BarChart3, Plus, Trash2, Calculator } from 'lucide-react'
import { Layout } from '@/components/layout/Layout'
import { PROPERTY_TYPES, NY_BOROUGHS } from '@/utils/constants'

interface Comparable {
  id: string
  address: string
  soldPrice: number
  sqft: number
  beds: number
  baths: number
  soldDate: string
  adjustments: number
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function CMAPage() {
  const [subjectAddress, setSubjectAddress] = useState('')
  const [subjectCity, setSubjectCity] = useState('Manhattan')
  const [subjectType, setSubjectType] = useState('condo')
  const [subjectSqft, setSubjectSqft] = useState('')
  const [comps, setComps] = useState<Comparable[]>([
    { id: '1', address: '100 Park Ave #12A', soldPrice: 950_000, sqft: 900, beds: 2, baths: 1, soldDate: '2024-04-01', adjustments: 15_000 },
    { id: '2', address: '220 E 65th St #8B', soldPrice: 1_100_000, sqft: 1050, beds: 2, baths: 2, soldDate: '2024-03-15', adjustments: -20_000 },
    { id: '3', address: '55 Water St #34C', soldPrice: 875_000, sqft: 850, beds: 1, baths: 1, soldDate: '2024-05-02', adjustments: 30_000 },
  ])

  function addComp() {
    setComps((prev) => [
      ...prev,
      { id: Date.now().toString(), address: '', soldPrice: 0, sqft: 0, beds: 0, baths: 0, soldDate: '', adjustments: 0 },
    ])
  }

  function removeComp(id: string) {
    setComps((prev) => prev.filter((c) => c.id !== id))
  }

  function updateComp(id: string, field: keyof Comparable, val: string | number) {
    setComps((prev) => prev.map((c) => c.id === id ? { ...c, [field]: val } : c))
  }

  const adjustedValues = comps.map((c) => c.soldPrice + c.adjustments)
  const avgAdjusted = adjustedValues.length > 0 ? adjustedValues.reduce((a, b) => a + b, 0) / adjustedValues.length : 0
  const minVal = adjustedValues.length > 0 ? Math.min(...adjustedValues) : 0
  const maxVal = adjustedValues.length > 0 ? Math.max(...adjustedValues) : 0

  // Price per sqft
  const ppsf = comps
    .filter((c) => c.sqft > 0)
    .map((c) => (c.soldPrice + c.adjustments) / c.sqft)
  const avgPpsf = ppsf.length > 0 ? ppsf.reduce((a, b) => a + b, 0) / ppsf.length : 0
  const subjectEstFromPpsf = avgPpsf > 0 && Number(subjectSqft) > 0 ? avgPpsf * Number(subjectSqft) : null

  return (
    <Layout title="Comparative Market Analysis">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Subject Property ────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-800">Subject Property</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Address</label>
                <input
                  value={subjectAddress}
                  onChange={(e) => setSubjectAddress(e.target.value)}
                  placeholder="123 Main St, Apt 4B"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Borough / City</label>
                <select
                  value={subjectCity}
                  onChange={(e) => setSubjectCity(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {NY_BOROUGHS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                  <select
                    value={subjectType}
                    onChange={(e) => setSubjectType(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Sq Ft</label>
                  <input
                    type="number"
                    value={subjectSqft}
                    onChange={(e) => setSubjectSqft(e.target.value)}
                    placeholder="1000"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── CMA Summary ────────────────────────────────────────── */}
          <div className="bg-gradient-to-br from-brand-navy to-brand-navy-light rounded-2xl p-5 text-white">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="h-5 w-5 text-brand-gold" />
              <h3 className="font-bold">CMA Summary</h3>
            </div>

            <div className="space-y-3">
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-xs text-white/60 mb-0.5">Average Adjusted Value</p>
                <p className="text-xl font-bold text-brand-gold">{avgAdjusted > 0 ? fmt(avgAdjusted) : '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-xs text-white/60 mb-0.5">Low</p>
                  <p className="font-bold">{minVal > 0 ? fmt(minVal) : '—'}</p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-xs text-white/60 mb-0.5">High</p>
                  <p className="font-bold">{maxVal > 0 ? fmt(maxVal) : '—'}</p>
                </div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <p className="text-xs text-white/60 mb-0.5">Avg Price / Sq Ft</p>
                <p className="font-bold">{avgPpsf > 0 ? fmt(avgPpsf) + '/sf' : '—'}</p>
              </div>
              {subjectEstFromPpsf && (
                <div className="bg-brand-gold/20 border border-brand-gold/30 rounded-xl p-3">
                  <p className="text-xs text-brand-gold mb-0.5">Estimated Value (PPSF)</p>
                  <p className="font-bold text-brand-gold">{fmt(subjectEstFromPpsf)}</p>
                </div>
              )}
            </div>

            <p className="text-xs text-white/30 mt-4">Based on {comps.length} comparable sale{comps.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* ── Right: Comparables ────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Comparable Sales</h3>
              <button
                onClick={addComp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Comp
              </button>
            </div>

            <div className="divide-y divide-gray-100">
              {comps.map((comp, idx) => (
                <div key={comp.id} className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Comp #{idx + 1}</span>
                    <button onClick={() => removeComp(comp.id)} className="p-1 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors text-gray-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      placeholder="Address"
                      value={comp.address}
                      onChange={(e) => updateComp(comp.id, 'address', e.target.value)}
                      className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:col-span-2"
                    />

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Sold Price</label>
                      <input
                        type="number"
                        value={comp.soldPrice || ''}
                        onChange={(e) => updateComp(comp.id, 'soldPrice', Number(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Sq Ft</label>
                      <input
                        type="number"
                        value={comp.sqft || ''}
                        onChange={(e) => updateComp(comp.id, 'sqft', Number(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Sold Date</label>
                      <input
                        type="date"
                        value={comp.soldDate}
                        onChange={(e) => updateComp(comp.id, 'soldDate', e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Net Adjustments ($)</label>
                      <input
                        type="number"
                        value={comp.adjustments || ''}
                        onChange={(e) => updateComp(comp.id, 'adjustments', Number(e.target.value))}
                        placeholder="0"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {comp.soldPrice > 0 && (
                    <div className="mt-3 flex items-center gap-4 bg-gray-50 rounded-xl px-4 py-2.5 text-sm">
                      <span className="text-gray-500">Adjusted:</span>
                      <span className="font-bold text-gray-800">{fmt(comp.soldPrice + comp.adjustments)}</span>
                      {comp.sqft > 0 && (
                        <span className="text-gray-400 text-xs">({fmt((comp.soldPrice + comp.adjustments) / comp.sqft)}/sf)</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
