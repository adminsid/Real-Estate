// ─── User & Auth ───────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  licenseNumber?: string
  licenseState?: string
  avatarUrl?: string
  branding?: WorkspaceBranding
  createdAt: string
}

export type UserRole =
  | 'admin'
  | 'broker'
  | 'salesperson'
  | 'assistant'
  | 'vendor'
  | 'partner'

// ─── Workspace Branding ────────────────────────────────────────────────────
export interface WorkspaceBranding {
  companyName: string
  logoUrl?: string
  primaryColor: string
  accentColor: string
  tagline?: string
  websiteUrl?: string
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
  type: PropertyType
  description?: string
  images?: string[]
  listedDate: string
  agentId?: string
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

export type ContactType = 'buyer' | 'seller' | 'both' | 'referral' | 'vendor' | 'other'
export type ContactStatus = 'active' | 'prospect' | 'closed' | 'inactive'

// ─── Transaction ───────────────────────────────────────────────────────────
export interface Transaction {
  id: string
  address: string
  type: 'purchase' | 'sale' | 'rental'
  status: TransactionStatus
  price: number
  closingDate?: string
  buyerId?: string
  sellerId?: string
  agentId: string
  coAgentId?: string
  createdAt: string
  updatedAt: string
}

export type TransactionStatus =
  | 'prospect'
  | 'contract'
  | 'inspection'
  | 'financing'
  | 'closing'
  | 'closed'
  | 'cancelled'

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
