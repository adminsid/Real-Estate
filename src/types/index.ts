// ─── User & Auth ───────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  licenseNumber?: string
  licenseState?: string
  license_expiration_date?: string | null
  tenantId?: string
  avatarUrl?: string
  phone?: string
  title?: string
  branding?: WorkspaceBranding
  mfa_enabled?: number
  createdAt: string
}

import type { UserRole } from './roles'
export type { UserRole }
export { ROLE_HIERARCHY, roleAtLeast, assertRole } from './roles'


export interface WorkspaceBranding {
  companyName: string
  companyAddress?: string
  companyTelephone?: string
  companyFax?: string
  logoUrl?: string
  primaryColor: string
  accentColor: string
  tagline?: string
  websiteUrl?: string
  dashboardSettings?: string
  companyLicenseNumber?: string
  companyLicenseHolderName?: string
  companyLicenseType?: string
  companyLicenseExpirationDate?: string | null
  companyLicenseSyncedAt?: string | null
  companyAgentsData?: string
  leadAppDomain?: string
  customWorkspaceDomain?: string
}
// ─── App Module ────────────────────────────────────────────────────────────
export type AppStatus = 'active' | 'under_construction' | 'external' | 'coming_soon'

export interface AppModule {
  id: string
  name: string
  description: string
  icon: string
  path: string
  externalUrl?: string
  status: AppStatus
  category: AppCategory
  color: string
}

export type AppCategory =
  | 'transactions'
  | 'inventory'
  | 'marketing'
  | 'learning'
  | 'network'
  | 'tools'

// ─── MLS / Listing ─────────────────────────────────────────────────────────
export interface MLSListing {
  id: string
  mlsNumber: string
  address: string
  city: string
  state: string
  zip: string
  price: number
  bedrooms: number
  bathrooms: number
  sqft: number
  status: ListingStatus
  approval_status?: string
  type: PropertyType
  propertyType?: string
  propertySubtype?: string
  description?: string
  images?: string[]
  listedDate: string
  agentId?: string
  heroMediaUrl?: string
}


export type ListingStatus = 'active' | 'pending' | 'sold' | 'expired' | 'withdrawn'
export type PropertyType = 'residential' | 'condo' | 'co-op' | 'multi-family' | 'commercial' | 'land'

// ─── CRM Contact ───────────────────────────────────────────────────────────
export interface CRMContact {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  type: ContactType
  status: ContactStatus
  source?: string
  notes?: string
  assignedAgentId?: string
  createdAt: string
  updatedAt: string
}

export type ContactType = 'buyer' | 'seller' | 'both' | 'referral' | 'vendor' | 'landlord' | 'tenant' | 'agent' | 'other'
export type ContactStatus = 'active' | 'prospect' | 'closed' | 'inactive'

// ─── Transaction ───────────────────────────────────────────────────────────
export interface Transaction {
  id: string
  name: string
  type: 'sale' | 'lease' | 'rental'
  status: TransactionStatus
  price?: number
  commissionAmount?: number
  commissionRate?: number
  targetCloseDate?: string
  actualCloseDate?: string
  escrowDate?: string
  inspectionDeadline?: string
  appraisalDate?: string
  possessionDate?: string
  agreementType?: string
  assignedTo?: string
  isLocked?: boolean
  notes?: string
  createdAt: string
  updatedAt: string
}

// Backend status values — must match workers/transactions/index.ts
export type TransactionStatus =
  | 'lead'
  | 'active'
  | 'offer_received'
  | 'under_contract'
  | 'closed'
  | 'fallen_through'

// ─── Network ───────────────────────────────────────────────────────────────
export interface NetworkConnection {
  id: string
  userId: string
  name: string
  title: string
  company?: string
  email: string
  phone?: string
  type: ConnectionType
  avatarUrl?: string
  connectedAt: string
}

export type ConnectionType =
  | 'licensed_professional'
  | 'broker'
  | 'assistant'
  | 'vendor'
  | 'partner'
  | 'colleague'
  | 'expert'

// ─── API ───────────────────────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
  error?: string
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number
  page: number
  limit: number
}
