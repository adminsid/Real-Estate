import { Routes, Route, Navigate } from 'react-router-dom'
import { DashboardPage } from '@/pages/Dashboard'
import { TransactionsPage } from '@/pages/Transactions'
import { CMAPage } from '@/pages/CMA'
import { InventoryPage } from '@/pages/Inventory'
import { MLSPage } from '@/pages/MLS'
import { MarketingPage } from '@/pages/Marketing'
import { CRMPage } from '@/pages/CRM'
import { LearningPage } from '@/pages/Learning'
import { NetworkPage } from '@/pages/Network'
import { SettingsPage } from '@/pages/Settings'
import { LoginPage } from '@/components/auth/LoginPage'
import { SignupPage } from '@/components/auth/SignupPage'
import {
  TransactionDeskPage,
  ListingManagerPage,
  MarketingHubPage,
  BrokerCoursePage,
} from '@/pages/UnderConstruction'

export function AppRoutes() {
  return (
    <Routes>
      {/* ── Public auth ────────────────────────────────────────────── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* ── Workspace ──────────────────────────────────────────────── */}
      <Route path="/" element={<DashboardPage />} />

      {/* Transactions */}
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/transactions/cma" element={<CMAPage />} />
      <Route path="/transactions/desk" element={<TransactionDeskPage />} />

      {/* Inventory */}
      <Route path="/inventory" element={<InventoryPage />} />
      <Route path="/inventory/mls" element={<MLSPage />} />
      <Route path="/inventory/listings" element={<ListingManagerPage />} />

      {/* Marketing */}
      <Route path="/marketing" element={<MarketingPage />} />
      <Route path="/marketing/crm" element={<CRMPage />} />
      <Route path="/marketing/hub" element={<MarketingHubPage />} />

      {/* Learning */}
      <Route path="/learning" element={<LearningPage />} />
      <Route path="/learning/academy" element={<Navigate to="https://primeamerica.theceshop.com/real-estate/" replace />} />
      <Route path="/learning/license-law" element={<LearningPage />} />
      <Route path="/learning/broker" element={<BrokerCoursePage />} />

      {/* Network & Settings */}
      <Route path="/network" element={<NetworkPage />} />
      <Route path="/settings" element={<SettingsPage />} />

      {/* 404 fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
