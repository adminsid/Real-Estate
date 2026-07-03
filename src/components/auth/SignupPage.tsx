import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { UserPlus, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useAuth, type SignupData } from '@/context/AuthContext'
import type { User } from '@/types'

const ROLES: { value: User['role']; label: string }[] = [
  { value: 'salesperson', label: 'Licensed Salesperson' },
  { value: 'broker', label: 'Licensed Broker' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'vendor', label: 'Vendor / Service Provider' },
  { value: 'partner', label: 'Partner' },
]

export function SignupPage() {
  const { signup, isLoading } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<SignupData>({
    name: '',
    email: '',
    password: '',
    role: 'salesperson',
    licenseNumber: '',
    companyName: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  function update(field: keyof SignupData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    try {
      await signup(form)
      navigate('/')
    } catch (err) {
      setError((err as Error).message || 'Registration failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_50%_0%,#C9A84C_0%,transparent_60%)]" />

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-gold mb-4">
            <span className="text-brand-navy font-bold text-2xl">RE</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Create your workspace</h1>
          <p className="text-white/50 mt-1 text-sm">Start managing your real estate business</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 p-3 mb-5 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name + Company */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={form.companyName ?? ''}
                  onChange={(e) => update('companyName', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="My Realty LLC"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                placeholder="you@example.com"
              />
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Your Role *</label>
              <select
                required
                value={form.role}
                onChange={(e) => update('role', e.target.value as User['role'])}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* License Number (for salesperson/broker) */}
            {(form.role === 'salesperson' || form.role === 'broker') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  NY License Number
                </label>
                <input
                  type="text"
                  value={form.licenseNumber ?? ''}
                  onChange={(e) => update('licenseNumber', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="10401XXXXXXXXX"
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  placeholder="Min. 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-navy text-white font-semibold py-3 hover:bg-brand-navy-light transition-colors disabled:opacity-60"
            >
              {isLoading ? (
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {isLoading ? 'Creating workspace…' : 'Create Workspace'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand-navy hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
