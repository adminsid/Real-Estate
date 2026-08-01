import type { AppModule, WorkspaceBranding } from '@/types'

// ─── App Metadata ──────────────────────────────────────────────────────────
export const APP_NAME = 'RE Workspace'
export const APP_TAGLINE = 'Your Real Estate Command Center'
export const APP_VERSION = '1.0.0'

// ─── Default Branding ──────────────────────────────────────────────────────
export const DEFAULT_BRANDING: WorkspaceBranding = {
  companyName: 'Prime America Realty',
  companyAddress: '100 Wall Street, 12th Floor, New York, NY 10005',
  companyTelephone: '(212) 555-0100',
  companyFax: '',
  primaryColor: '#0F2040',
  accentColor: '#C9A84C',
  tagline: 'Your Real Estate Command Center',
  websiteUrl: 'https://primeamericany.com',
  leadAppDomain: '',
}
export const APP_MODULES: AppModule[] = [
  // — Transactions ——————————————————————————————————————
  {
    id: 'deals',
    name: 'Deals Pipeline',
    description: 'Track and manage transaction pipelines, inspect deals, and apply checklists',
    icon: 'ArrowLeftRight',
    path: '/transactions/pipeline',
    status: 'active',
    category: 'transactions',
    color: '#3B82F6',
  },
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
    externalUrl: 'https://pr.transactiondesk.com/',
    status: 'active',
    category: 'transactions',
    color: '#8B5CF6',
  },
  {
    id: 'onekey-portal',
    name: 'OneKey MLS',
    description: 'Find MLS listings for buyers and access OneKey MLS dashboard features',
    icon: 'Map',
    path: '/transactions/onekey',
    externalUrl: 'https://onekey.clareity.net/layouts',
    status: 'active',
    category: 'transactions',
    color: '#3B82F6',
  },
  // — Inventory ———————————————————————————————————————
  {
    id: 'mls',
    name: 'Listings',
    description: 'Browse and manage real estate listings',
    icon: 'Map',
    path: '/inventory/mls',
    status: 'active',
    category: 'inventory',
    color: '#10B981',
  },
  // — Marketing ———————————————————————————————————————
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
  {
    id: 'brand-marketing-hub',
    name: 'Brand & Marketing Hub',
    description: 'Marketing resources, branding files, forms, policies, and company assets',
    icon: 'Megaphone',
    path: '/marketing/brand-marketing-hub',
    externalUrl: 'https://inside.primeamericarealestate.com/',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },
  {
    id: 'cabinet-ai',
    name: 'Cabinet AI Knowledge Base',
    description: 'AI-first team knowledge base, document workspace, and startup OS',
    icon: 'FolderKanban',
    path: '/tools/cabinet',
    externalUrl: '/api/sso/redirect?app=cabinet',
    status: 'active',
    category: 'learning',
    color: '#6366F1',
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
  externalUrl?: string
}

export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'ArrowLeftRight',
    path: '/transactions',
    color: '#3B82F6',
    children: [
      { id: 'deals', label: 'Deals Pipeline', path: '/transactions/pipeline' },
      { id: 'cma', label: 'CMA', path: '/transactions/cma' },
      { id: 'transaction-desk', label: 'TransactionDesk', path: '/transactions/desk', externalUrl: 'https://pr.transactiondesk.com/' },
      { id: 'onekey-portal', label: 'OneKey MLS', path: '/transactions/onekey', externalUrl: 'https://onekey.clareity.net/layouts' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'Building2',
    path: '/inventory',
    color: '#10B981',
    children: [
      { id: 'mls', label: 'Listings', path: '/inventory/mls' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: 'Megaphone',
    path: '/marketing',
    color: '#EC4899',
    children: [
      { id: 'crm', label: 'CRM', path: '/marketing/crm' },
      { id: 'openhouse-list', label: 'Open Houses', path: '/marketing/openhouses' },
      { id: 'brand-marketing-hub', label: 'Brand & Marketing Hub', path: '/marketing/brand-marketing-hub', externalUrl: 'https://inside.primeamericarealestate.com/' },
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
      { id: 'cabinet-ai', label: 'Cabinet AI Knowledge Base', path: '/tools/cabinet', externalUrl: '/api/sso/redirect?app=cabinet' },
      { id: 'broker-course', label: 'Broker License', path: '/learning/broker', status: 'coming_soon' },
    ],
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

export function isSubitemVisible(childId: string, categoryId: string, user: any, can: (module: string, action: string) => boolean): boolean {
  if (!user) return false
  if (user.role === 'admin') return true

  if (childId === 'crm') {
    return can('crm', 'read')
  }

  let catModule = categoryId
  if (categoryId === 'inventory') {
    catModule = 'listings'
  }

  return can(catModule, 'read')
}

export function isCategoryVisible(cat: { id: string; children?: { id: string }[] }, user: any, can: (module: string, action: string) => boolean): boolean {
  if (!user) return false
  if (user.role === 'admin') return true

  let catModule = cat.id
  if (cat.id === 'inventory') {
    catModule = 'listings'
  }

  if (!can(catModule, 'read')) {
    return false
  }

  if (cat.children && cat.children.length > 0) {
    return cat.children.some(child => isSubitemVisible(child.id, cat.id, user, can))
  }

  return true
}
