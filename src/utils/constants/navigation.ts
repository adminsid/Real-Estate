import type { AppModule } from '@/types'

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
    externalUrl: '/apps/transactiondesk',
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
  // — Inventory —————————————————————————————————————───
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
  // — Marketing —————————————————————————————————————───
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
    externalUrl: '/apps/academy',
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
    externalUrl: '/apps/branding-hub',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },
  {
    id: 'prime-america-kb',
    name: 'Prime America Knowledge Base',
    description: 'Prime America Real Estate knowledge base hub for admin, broker, and team',
    icon: 'BookOpen',
    path: '/learning/kb',
    externalUrl: '/apps/prime-america-kb',
    status: 'active',
    category: 'learning',
    color: '#6366F1',
  },
]

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
    label: 'Deals & Transactions',
    icon: 'ArrowLeftRight',
    path: '/transactions',
    color: '#3B82F6',
    children: [
      { id: 'deals', label: 'Deals Pipeline', path: '/transactions/pipeline' },
      { id: 'cma', label: 'CMA', path: '/transactions/cma' },
      { id: 'transaction-desk', label: 'TransactionDesk', path: '/transactions/desk', externalUrl: '/apps/transactiondesk' },
      { id: 'onekey-portal', label: 'OneKey MLS', path: '/transactions/onekey', externalUrl: 'https://onekey.clareity.net/layouts' },
    ],
  },
  {
    id: 'inventory',
    label: 'Listings & Inventory',
    icon: 'Building2',
    path: '/inventory',
    color: '#10B981',
    children: [
      { id: 'mls', label: 'Listings', path: '/inventory/mls' },
    ],
  },
  {
    id: 'marketing',
    label: 'Clients & Growth',
    icon: 'Megaphone',
    path: '/marketing',
    color: '#EC4899',
    children: [
      { id: 'crm', label: 'CRM', path: '/marketing/crm' },
      { id: 'openhouse-list', label: 'Open Houses', path: '/marketing/openhouses' },
      { id: 'brand-marketing-hub', label: 'Brand & Marketing Hub', path: '/marketing/brand-marketing-hub', externalUrl: '/apps/branding-hub' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning & Compliance',
    icon: 'GraduationCap',
    path: '/learning',
    color: '#6366F1',
    children: [
      { id: 'academy', label: 'Academy', path: '/learning/academy', externalUrl: '/apps/academy' },
      { id: 'license-law', label: 'License Law (NY 12-A)', path: '/learning/license-law' },
      { id: 'prime-america-kb', label: 'Prime America Knowledge Base', path: '/learning/kb', externalUrl: '/apps/prime-america-kb' },
      { id: 'broker-course', label: 'Broker License', path: '/learning/broker', status: 'coming_soon' },
    ],
  },
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
