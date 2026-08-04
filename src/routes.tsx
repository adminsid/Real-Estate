import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/components/auth/LoginPage'
import { SignupPage } from '@/components/auth/SignupPage'
import { VerifyEmailPage } from '@/components/auth/VerifyEmailPage'
import { ResetPasswordPage } from '@/components/auth/ResetPasswordPage'
import { AcceptInvitePage } from '@/components/auth/AcceptInvitePage'
import { ForgotPasswordPage } from '@/components/auth/ForgotPasswordPage'
import { DashboardPage } from '@/pages/Dashboard'
import { TransactionsPage } from '@/pages/Transactions'
import { TransactionsOverviewPage } from '@/pages/TransactionsOverview'
import { TransactionDetailPage } from '@/pages/TransactionDetail'
import { CMAPage } from '@/pages/CMA'
import { InventoryPage } from '@/pages/Inventory'
import { MLSPage } from '@/pages/MLS'
import { MarketingPage } from '@/pages/Marketing'
import { CRMPage } from '@/pages/CRM'
import { CRMContactDetailPage } from '@/pages/CRMContactDetail'
import { CRMMailingListsPage } from '@/pages/CRMMailingLists'
import { LearningPage } from '@/pages/Learning'
import { OpenHousesPage } from '@/pages/OpenHouses'
import { NetworkPage } from '@/pages/Network'
import { NetworkContactDetailPage } from '@/pages/NetworkContactDetail'
import { SettingsPage } from '@/pages/Settings'
import { HRPage } from '@/pages/HR'
import { UserManagementPage } from '@/pages/UserManagement'
import { ListingDetailPage } from '@/pages/ListingDetail'
import { InventoryReportingPage } from '@/pages/InventoryReporting'
import { FormFillerPage } from '@/pages/FormFiller'
import {
  TransactionDeskPage,
  BrokerCoursePage,
} from '@/pages/UnderConstruction'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <div className="h-10 w-10 border-4 border-brand-gold/30 border-t-brand-gold rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function getSafeRedirectUrl(urlStr: string | null): string | null {
  if (!urlStr) return null
  if (urlStr.startsWith('/') && !urlStr.startsWith('//')) {
    return urlStr
  }
  try {
    const parsed = new URL(urlStr)
    const allowedHostnames = [
      'workspace.primeamericany.com',
      'inventory.primeamericarealestate.com',
      'openhouse.primeamericarealestate.com',
      'inside.primeamericarealestate.com',
      're-workspace.lama-4db.workers.dev'
    ]
    if (
      allowedHostnames.includes(parsed.hostname) ||
      parsed.hostname.endsWith('.primeamericarealestate.com') ||
      parsed.hostname.endsWith('.primeamericany.com') ||
      parsed.hostname.endsWith('.workers.dev')
    ) {
      return urlStr
    }
  } catch {
    // ignore
  }
  return null
}

function LoginRouteWrapper() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    console.log('[LoginRouteWrapper] effect fired:', JSON.stringify({
      isAuthenticated,
      locationSearch: location.search,
      windowSearch: window.location.search,
      href: window.location.href,
    }))
    if (isAuthenticated) {
      const params = new URLSearchParams(location.search)
      const redirectUrl = params.get('redirect')
      const safeUrl = getSafeRedirectUrl(redirectUrl)

      console.log('[LoginRouteWrapper] redirect decision:', JSON.stringify({ redirectUrl, safeUrl }))

      if (safeUrl) {
        window.location.replace(safeUrl)
      } else {
        navigate('/', { replace: true })
      }
    }
  }, [isAuthenticated, location.search, navigate])

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <div className="h-10 w-10 border-4 border-brand-gold/30 border-t-brand-gold rounded-full animate-spin" />
      </div>
    )
  }

  return <LoginPage />
}

export function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-navy flex items-center justify-center">
        <div className="h-10 w-10 border-4 border-brand-gold/30 border-t-brand-gold rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      {/* ── Public auth pages ────────────────────────────────────────── */}
      <Route path="/login" element={<LoginRouteWrapper />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to="/" replace /> : <SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/" replace /> : <ForgotPasswordPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/login/:slug" element={<LoginRouteWrapper />} />
      <Route path="/unauthorized" element={
        <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
          <div className="text-center">
            <div className="text-brand-gold text-6xl font-bold mb-4">403</div>
            <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
            <p className="text-white/60 mb-6">You don't have permission to access this resource.</p>
            <a href="/" className="inline-flex items-center gap-2 bg-brand-gold text-brand-navy font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity">
              Return to Workspace
            </a>
          </div>
        </div>
      } />

      {/* ── Index: landing/login when logged out, dashboard when logged in ── */}
      <Route path="/" element={isAuthenticated ? <DashboardPage /> : <LoginPage />} />

      {/* ── Protected workspace routes ─────────────────────────────── */}
      <Route path="/transactions" element={<ProtectedRoute><TransactionsOverviewPage /></ProtectedRoute>} />
      <Route path="/transactions/pipeline" element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
      <Route path="/transactions/:id" element={<ProtectedRoute><TransactionDetailPage /></ProtectedRoute>} />
      <Route path="/transactions/cma" element={<ProtectedRoute><CMAPage /></ProtectedRoute>} />
      <Route path="/transactions/desk" element={<ProtectedRoute><TransactionDeskPage /></ProtectedRoute>} />

      <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
      <Route path="/inventory/mls" element={<ProtectedRoute><MLSPage /></ProtectedRoute>} />
      <Route path="/inventory/reporting" element={<ProtectedRoute><InventoryReportingPage /></ProtectedRoute>} />
      <Route path="/inventory/listings/:id/:slug?" element={<ListingDetailPage />} />

      <Route path="/marketing" element={<ProtectedRoute><MarketingPage /></ProtectedRoute>} />
      <Route path="/marketing/crm" element={<ProtectedRoute><CRMPage /></ProtectedRoute>} />
      <Route path="/marketing/crm/lists" element={<ProtectedRoute><CRMMailingListsPage /></ProtectedRoute>} />
      <Route path="/marketing/crm/:id" element={<ProtectedRoute><CRMContactDetailPage /></ProtectedRoute>} />
      <Route path="/marketing/openhouses" element={<ProtectedRoute><OpenHousesPage /></ProtectedRoute>} />
      <Route path="/marketing/brand-marketing-hub" element={<ExternalRedirect url="https://inside.primeamericarealestate.com/" />} />

      <Route path="/learning" element={<ProtectedRoute><LearningPage /></ProtectedRoute>} />
      <Route path="/learning/academy" element={<ExternalRedirect url="https://primeamerica.theceshop.com/real-estate/" />} />
      <Route path="/learning/license-law" element={<ProtectedRoute><LearningPage /></ProtectedRoute>} />
      <Route path="/learning/broker" element={<ProtectedRoute><BrokerCoursePage /></ProtectedRoute>} />

      <Route path="/network" element={<ProtectedRoute><NetworkPage /></ProtectedRoute>} />
      <Route path="/network/:id" element={<ProtectedRoute><NetworkContactDetailPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="/hr" element={<ProtectedRoute><HRPage /></ProtectedRoute>} />
      <Route path="/user-management" element={<ProtectedRoute><UserManagementPage /></ProtectedRoute>} />
      <Route path="/tools/form-filler" element={<ProtectedRoute><FormFillerPage /></ProtectedRoute>} />

      {/* 404 fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function ExternalRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.replace(url)
  }, [url])

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
        <p className="mt-4 text-sm text-gray-500">Redirecting to external portal...</p>
      </div>
    </div>
  )
}