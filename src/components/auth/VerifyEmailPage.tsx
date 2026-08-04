import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

export function VerifyEmailPage() {
  const { branding } = useAuth()
  const [params] = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const token = params.get('token')
    if (!token) { setStatus('error'); setMessage('Invalid verification link.'); return }

    fetch(`/api/auth/verify-email?token=${token}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setStatus('success'); setMessage(d.message ?? 'Email verified!') }
        else { setStatus('error'); setMessage(d.error ?? 'Verification failed.') }
      })
      .catch(() => { setStatus('error'); setMessage('Something went wrong. Please try again.') })
  }, [params])

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, var(--brand-accent) 0%, transparent 60%)' }} />
      <div className="relative w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl mb-6 overflow-hidden bg-brand-gold">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Brand Logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-brand-navy font-bold text-2xl">RE</span>
          )}
        </div>
        <div className="bg-white rounded-2xl p-10 shadow-2xl">
          {status === 'loading' && (
            <><Loader2 className="h-12 w-12 text-brand-navy animate-spin mx-auto mb-4" /><p className="text-gray-500">Verifying your email…</p></>
          )}
          {status === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Email Verified!</h1>
              <p className="text-gray-500 mb-6">{message}</p>
              <Link to="/" className="inline-block rounded-xl bg-brand-navy text-white font-semibold px-6 py-3 hover:bg-brand-navy-light transition-colors">
                Go to Dashboard
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-gray-900 mb-2">Verification Failed</h1>
              <p className="text-gray-500 mb-6">{message}</p>
              <Link to="/login" className="inline-block rounded-xl bg-brand-navy text-white font-semibold px-6 py-3 hover:bg-brand-navy-light transition-colors">
                Back to Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
