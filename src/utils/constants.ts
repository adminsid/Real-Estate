import type { AppModule, WorkspaceBranding } from '@/types'

// ─── App Metadata ──────────────────────────────────────────────────────────
export const APP_NAME = 'RE Workspace'
export const APP_TAGLINE = 'Your Real Estate Command Center'
export const APP_VERSION = '1.0.0'

// ─── Default Branding ──────────────────────────────────────────────────────
export const DEFAULT_BRANDING: WorkspaceBranding = {
  companyName: 'Prime America Realty',
  primaryColor: '#0F2040',
  accentColor: '#C9A84C',
  tagline: 'Your Real Estate Command Center',
  websiteUrl: 'https://primeamericany.com',
}

// ─── App Modules ───────────────────────────────────────────────────────────
export const APP_MODULES: AppModule[] = [
  // — Transactions ——————————————————————————————————————
  {
    id: 'cma',
    name: 'CMA',
    description: 'Comparative Market Analysis — generate professional property valuations',
    icon: 'BarChart3',
    path: '/transactions/cma',
    status: 'active',
    category: 'transactions',
    color: '#3B82F6',
  },
  {
    id: 'transaction-desk',
    name: 'TransactionDesk',
    description: 'Digital forms, e-signatures, and transaction management',
    icon: 'FileSignature',
    path: '/transactions/desk',
    status: 'under_construction',
    category: 'transactions',
    color: '#8B5CF6',
  },
  // — Inventory ———————————————————————————————————————
  {
    id: 'mls',
    name: 'MLS Listings',
    description: 'Browse and manage Multiple Listing Service properties',
    icon: 'Map',
    path: '/inventory/mls',
    externalUrl: 'https://inventory.primeamericany.com',
    status: 'active',
    category: 'inventory',
    color: '#10B981',
  },
  {
    id: 'listing-manager',
    name: 'Listing Manager',
    description: 'Create and publish new property listings',
    icon: 'Home',
    path: '/inventory/listings',
    status: 'under_construction',
    category: 'inventory',
    color: '#F59E0B',
  },
  // — Marketing ———————————————————————————————————————
  {
    id: 'website',
    name: 'Custom Website',
    description: 'Your branded real estate website at primeamericany.com',
    icon: 'Globe',
    path: '/marketing/website',
    externalUrl: 'https://primeamericany.com',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },
  {
    id: 'crm',
    name: 'CRM',
    description: 'Customer Relationship Management — track leads and clients',
    icon: 'Users',
    path: '/marketing/crm',
    status: 'active',
    category: 'marketing',
    color: '#EF4444',
  },
  {
    id: 'marketing-hub',
    name: 'Marketing Hub',
    description: 'Email campaigns, social media, and promotional materials',
    icon: 'Megaphone',
    path: '/marketing/hub',
    status: 'under_construction',
    category: 'marketing',
    color: '#F97316',
  },
  // — Learning ————————————————————————————————————————
  {
    id: 'academy',
    name: 'Academy',
    description: 'Continuing education, CE credits, and license renewal',
    icon: 'GraduationCap',
    path: '/learning/academy',
    externalUrl: 'https://primeamerica.theceshop.com/real-estate/',
    status: 'active',
    category: 'learning',
    color: '#6366F1',
  },
  {
    id: 'license-law',
    name: 'License Law',
    description: 'NY Real Estate Article 12-A — eAccess NY compliance resources',
    icon: 'Scale',
    path: '/learning/license-law',
    status: 'active',
    category: 'learning',
    color: '#0EA5E9',
  },
  {
    id: 'broker-course',
    name: 'Broker License',
    description: 'Broker license education and exam preparation resources',
    icon: 'Award',
    path: '/learning/broker',
    externalUrl: 'https://primeamerica.theceshop.com/real-estate/',
    status: 'coming_soon',
    category: 'learning',
    color: '#14B8A6',
  },
]

// ─── Navigation ────────────────────────────────────────────────────────────
export interface NavCategory {
  id: string
  label: string
  icon: string
  path: string
  color: string
  children?: NavItem[]
}

export interface NavItem {
  id: string
  label: string
  path: string
  status?: AppModule['status']
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'ArrowLeftRight',
    path: '/transactions',
    color: '#3B82F6',
    children: [
      { id: 'cma', label: 'CMA', path: '/transactions/cma' },
      { id: 'transaction-desk', label: 'TransactionDesk', path: '/transactions/desk', status: 'under_construction' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'Building2',
    path: '/inventory',
    color: '#10B981',
    children: [
      { id: 'mls', label: 'MLS Listings', path: '/inventory/mls' },
      { id: 'listing-manager', label: 'Listing Manager', path: '/inventory/listings', status: 'under_construction' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: 'Megaphone',
    path: '/marketing',
    color: '#EC4899',
    children: [
      { id: 'website', label: 'Website', path: '/marketing/website' },
      { id: 'crm', label: 'CRM', path: '/marketing/crm' },
      { id: 'marketing-hub', label: 'Marketing Hub', path: '/marketing/hub', status: 'under_construction' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning',
    icon: 'GraduationCap',
    path: '/learning',
    color: '#6366F1',
    children: [
      { id: 'academy', label: 'Academy', path: '/learning/academy' },
      { id: 'license-law', label: 'License Law (NY 12-A)', path: '/learning/license-law' },
      { id: 'broker-course', label: 'Broker License', path: '/learning/broker', status: 'coming_soon' },
    ],
  },
  {
    id: 'network',
    label: 'Network',
    icon: 'Network',
    path: '/network',
    color: '#F59E0B',
  },
]

// ─── NY Real Estate Law Resources ──────────────────────────────────────────
export const NY_LAW_RESOURCES = [
  {
    title: 'Article 12-A — Real Estate Brokers and Salespersons',
    description:
      'The primary state law governing real estate licensing, conduct, and practice in New York.',
    url: 'https://www.dos.ny.gov/licensing/re_salesperson/re_salesperson.html',
    category: 'State Law',
  },
  {
    title: 'eAccessNY — License Management',
    description:
      'New York State online portal for managing real estate licenses, renewals, and CE requirements.',
    url: 'https://www.eaccessny.ny.gov/',
    category: 'License Portal',
  },
  {
    title: 'DOS Fair Housing Regulations',
    description: 'New York State Division of Human Rights fair housing compliance requirements.',
    url: 'https://www.dos.ny.gov/licensing/re_salesperson/fair_housing.html',
    category: 'Compliance',
  },
  {
    title: 'Agency Disclosure Requirements',
    description:
      'NY Real Property Law §443 — required disclosure forms and agency relationship rules.',
    url: 'https://www.dos.ny.gov/licensing/re_salesperson/re_salesperson.html',
    category: 'Disclosure',
  },
  {
    title: 'CE Requirements — NY Salesperson',
    description:
      '22.5 hours of continuing education required every 2 years for license renewal.',
    url: 'https://primeamerica.theceshop.com/real-estate/',
    category: 'Education',
  },
  {
    title: 'NAR Code of Ethics',
    description:
      'National Association of REALTORS® ethical standards and professional obligations.',
    url: 'https://www.nar.realtor/about-nar/governing-documents/code-of-ethics',
    category: 'Ethics',
  },
]

// ─── CMA Comparable Fields ─────────────────────────────────────────────────
export const PROPERTY_TYPES = [
  { value: 'residential', label: 'Single Family' },
  { value: 'condo', label: 'Condo / Co-op' },
  { value: 'multi-family', label: 'Multi-Family' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'land', label: 'Land / Lot' },
]

export const LISTING_STATUSES = [
  { value: 'active', label: 'Active', color: 'green' },
  { value: 'pending', label: 'Pending', color: 'yellow' },
  { value: 'sold', label: 'Sold', color: 'blue' },
  { value: 'expired', label: 'Expired', color: 'red' },
  { value: 'withdrawn', label: 'Withdrawn', color: 'gray' },
]

export const NY_BOROUGHS = [
  'Manhattan',
  'Brooklyn',
  'Queens',
  'The Bronx',
  'Staten Island',
]

export const NY_COUNTIES = [
  'New York (Manhattan)',
  'Kings (Brooklyn)',
  'Queens',
  'Bronx',
  'Richmond (Staten Island)',
  'Nassau',
  'Suffolk',
  'Westchester',
  'Rockland',
  'Orange',
]
