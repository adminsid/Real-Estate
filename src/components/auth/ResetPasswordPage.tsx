import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function ResetPasswordPage() {
  const { branding } = useAuth()
  const [params] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.get('token'), password }),
      })
      const data = await res.json()
      if (data.success) setDone(true)
      else setError(data.error ?? 'Reset failed. The link may have expired.')
    } catch { setError('Something went wrong.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, var(--brand-accent) 0%, transparent 60%)' }} />
      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-4 overflow-hidden bg-brand-gold">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Brand Logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-brand-navy font-bold text-2xl">RE</span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">Set new password</h1>
          <p className="text-white/50 mt-1 text-sm">Choose a strong password for your account</p>
        </div>
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="font-semibold text-gray-900 mb-2">Password updated!</p>
              <p className="text-gray-500 text-sm mb-6">You can now log in with your new password.</p>
              <Link to="/login" className="inline-block rounded-xl bg-brand-navy text-white font-semibold px-6 py-3 hover:bg-brand-navy-light transition-colors">Sign In</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                <div className="relative">
                  <input type={show ? 'text' : 'password'} required minLength={8} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-brand-navy" placeholder="Min. 8 characters" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                <input type={show ? 'text' : 'password'} required value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy" placeholder="Repeat password" />
              </div>
              <button type="submit" disabled={loading}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-brand-navy text-white font-semibold py-3 hover:bg-brand-navy-light transition-colors disabled:opacity-60">
                {loading ? <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock className="h-4 w-4" />}
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
