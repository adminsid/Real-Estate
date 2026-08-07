import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, Eye, EyeOff, AlertCircle, Mail } from 'lucide-react'
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
  const { signup, isLoading, branding } = useAuth()

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
  const [successMsg, setSuccessMsg] = useState('')

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
      const { message } = await signup(form)
      setSuccessMsg(message)
    } catch (err) {
      setError((err as Error).message || 'Registration failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4 py-8">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, var(--brand-accent) 0%, transparent 60%)' }} />

      <div className="relative w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4 overflow-hidden bg-brand-gold">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Brand Logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-brand-navy font-bold text-2xl">RE</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Create your workspace</h1>
          <p className="text-white/50 mt-1 text-sm">Start managing your real estate business</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {successMsg ? (
            <div className="text-center py-4">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 mb-4">
                <Mail className="h-7 w-7 text-teal-600" />
              </div>
              <h2 className="font-bold text-gray-900 text-lg mb-2">Check your inbox!</h2>
              <p className="text-gray-500 text-sm">{successMsg}</p>
              <p className="text-gray-400 text-xs mt-3">Click the link in the email to activate your account.</p>
              <Link to="/login" className="inline-block mt-6 text-sm font-semibold text-brand-navy hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>


        <p className="text-center text-white/30 text-xs mt-6">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
