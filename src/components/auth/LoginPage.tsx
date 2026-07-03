import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError((err as Error).message || 'Login failed. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_50%_0%,#C9A84C_0%,transparent_60%)]" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-brand-gold mb-4">
            <span className="text-brand-navy font-bold text-2xl">RE</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="text-white/50 mt-1 text-sm">Sign in to your workspace</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 p-3 mb-5 text-red-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-brand-navy focus:border-transparent"
                  placeholder="••••••••"
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
                <LogIn className="h-4 w-4" />
              )}
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-brand-navy hover:underline">
              Create one
            </Link>
          </p>
        </div>

        <p className="text-center text-white/30 text-xs mt-6">
          Protected by industry-standard encryption. Your data stays private.
        </p>
      </div>
    </div>
  )
}
