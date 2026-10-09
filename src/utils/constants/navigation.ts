import type { AppModule } from '@/types'

export const APP_MODULES: AppModule[] = [
  // — Operations ———————————————————————————————————————
  {
    id: 'operations-projects',
    name: 'Operations',
    description: 'Coordinate signed-agreement projects, tasks, approvals, and project timelines.',
    icon: 'BriefcaseBusiness',
    path: '/operations',
    status: 'active',
    category: 'operations',
    color: '#0EA5E9',
  },

  // — Deals —————————————————————————————————————————————
  {
    id: 'deals',
    name: 'Deals',
    description: 'Track and manage transaction pipelines, inspect deals, and apply checklists',
    icon: 'ArrowLeftRight',
    path: '/transactions/pipeline',
    status: 'active',
    category: 'operations',
    color: '#3B82F6',
  },
  {
    id: 'cma',
    name: 'CMA',
    description: 'Comparative Market Analysis — generate professional property valuations',
    icon: 'BarChart3',
    path: '/transactions/cma',
    status: 'active',
    category: 'operations',
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

  // — Inventory —————————————————————————————————────────
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
  {
    id: 'onekey-portal',
    name: 'OneKey MLS',
    description: 'OneKey MLS portal to feed and search regional MLS listings',
    icon: 'ExternalLink',
    path: '/inventory/onekey',
    externalUrl: 'https://onekey.clareity.net/layouts',
    status: 'active',
    category: 'inventory',
    color: '#10B981',
  },
  {
    id: 'inventory-admin',
    name: 'Inventory Admin',
    description: 'Central listing draft, media upload, and approval backend',
    icon: 'Building2',
    path: '/inventory/admin',
    externalUrl: 'https://inventory.primeamericarealestate.com',
    status: 'active',
    category: 'inventory',
    color: '#10B981',
  },

  // — Marketing —————————————————————————————————————————
  {
    id: 'crm',
    name: 'CRM',
    description: 'Customer Relationship Management — track leads and clients',
    icon: 'Users',
    path: '/marketing/crm',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },
  {
    id: 'openhouse-list',
    name: 'Open Houses',
    description: 'Manage open house events and visitor sign-ins',
    icon: 'Home',
    path: '/marketing/openhouses',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },
  {
    id: 'openhouse-admin',
    name: 'Open House Admin',
    description: 'Central open house event administration and manager portal',
    icon: 'ExternalLink',
    path: '/marketing/openhouse-admin',
    externalUrl: 'https://openhouse.primeamericarealestate.com',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },
  {
    id: 'brand-marketing-hub',
    name: 'Brand & Marketing Hub',
    description: 'Logos, marketing collateral, templates, and company brand assets',
    icon: 'Sparkles',
    path: '/marketing/brand-marketing-hub',
    externalUrl: '/api/sso/redirect?app=brand-hub&return_to=%2Fdashboard',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },
  {
    id: 'director',
    name: 'DIRECTOR.EXE',
    description: 'Autonomous real estate marketing operating system',
    icon: 'Terminal',
    path: '/marketing/director',
    status: 'active',
    category: 'marketing',
    color: '#EC4899',
  },

  // — Learning & Compliance —————————————————————————————
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
    color: '#6366F1',
  },
  {
    id: 'prime-america-kb',
    name: 'Prime America KB',
    description: 'Prime America Real Estate knowledge base hub for admin and brokers',
    icon: 'BookOpen',
    path: '/learning/kb',
    externalUrl: 'https://prime-america-kb.lama-4db.workers.dev/hub/',
    status: 'active',
    category: 'learning',
    color: '#6366F1',
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
    color: '#6366F1',
  },

  // — HR & Compliance ———————————————————————————————————
  {
    id: 'hr-roster',
    name: 'HR & Roster',
    description: 'NY Department of State licensing registry & broker roster',
    icon: 'Building2',
    path: '/hr',
    status: 'active',
    category: 'hr',
    color: '#0EA5E9',
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
    id: 'operations',
    label: 'Operations',
    icon: 'BriefcaseBusiness',
    path: '/operations',
    color: '#0EA5E9',
    children: [
      { id: 'operations-projects', label: 'Projects', path: '/operations' },
      { id: 'deals', label: 'Deals', path: '/transactions/pipeline' },
      { id: 'cma', label: 'CMA', path: '/transactions/cma' },
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: 'ArrowLeftRight',
    path: '/transactions',
    color: '#3B82F6',
    children: [
      { id: 'transaction-desk', label: 'TransactionDesk', path: '/transactions/desk', externalUrl: 'https://pr.transactiondesk.com/' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'Building2',
    path: '/inventory/mls',
    color: '#10B981',
    children: [
      { id: 'mls', label: 'Listings', path: '/inventory/mls' },
      { id: 'inventory-admin', label: 'Inventory Admin', path: '/inventory/admin', externalUrl: 'https://inventory.primeamericarealestate.com' },
      { id: 'onekey-portal', label: 'OneKey MLS', path: '/inventory/onekey', externalUrl: 'https://onekey.clareity.net/layouts' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: 'Megaphone',
    path: '/marketing/crm',
    color: '#EC4899',
    children: [
      { id: 'crm', label: 'CRM', path: '/marketing/crm' },
      { id: 'openhouse-list', label: 'Open Houses', path: '/marketing/openhouses' },
      { id: 'openhouse-admin', label: 'Open House Admin', path: '/marketing/openhouse-admin', externalUrl: 'https://openhouse.primeamericarealestate.com' },
      { id: 'brand-marketing-hub', label: 'Brand & Marketing Hub', path: '/marketing/brand-marketing-hub', externalUrl: '/api/sso/redirect?app=brand-hub&return_to=%2Fdashboard' },
      { id: 'director', label: 'DIRECTOR.EXE', path: '/marketing/director' },
    ],
  },
  {
    id: 'learning',
    label: 'Learning & Compliance',
    icon: 'GraduationCap',
    path: '/learning/license-law',
    color: '#6366F1',
    children: [
      { id: 'academy', label: 'Academy', path: '/learning/academy', externalUrl: 'https://primeamerica.theceshop.com/real-estate/' },
      { id: 'license-law', label: 'License Law (NY 12-A)', path: '/learning/license-law' },
      { id: 'prime-america-kb', label: 'Prime America KB', path: '/learning/kb', externalUrl: 'https://prime-america-kb.lama-4db.workers.dev/hub/' },
      { id: 'broker-course', label: 'Broker License', path: '/learning/broker', status: 'coming_soon' },
    ],
  },
  {
    id: 'hr',
    label: 'HR & Compliance',
    icon: 'Building2',
    path: '/hr',
    color: '#0EA5E9',
    children: [
      { id: 'hr-roster', label: 'HR & NY DOS Roster', path: '/hr' },
    ],
  },
]

export function isSubitemVisible(childId: string, categoryId: string, user: any, can: (module: string, action: string) => boolean): boolean {
  if (!user) return false
  if (user.role === 'admin') return true

  if (['deals', 'cma', 'transaction-desk'].includes(childId)) return can('transactions', 'read')

  if (categoryId === 'operations' || childId === 'operations-projects') {
    return ['admin', 'broker', 'salesperson'].includes(user.role)
  }

  // Hide satellite admin tools from salesperson and assistant
  if (['inventory-admin', 'openhouse-admin', 'prime-america-kb'].includes(childId)) {
    return ['admin', 'broker'].includes(user.role)
  }

  // HR is broker and admin only
  if (categoryId === 'hr' || childId === 'hr-roster') {
    return ['admin', 'broker'].includes(user.role) || can('hr', 'read')
  }

  if (childId === 'crm') {
    return can('crm', 'read')
  }

  let catModule = categoryId
  if (categoryId === 'inventory') {
    catModule = 'listings'
  } else if (categoryId === 'transactions') {
    catModule = 'transactions'
  }

  return can(catModule, 'read')
}

export function isCategoryVisible(cat: { id: string; children?: { id: string }[] }, user: any, can: (module: string, action: string) => boolean): boolean {
  if (!user) return false
  if (user.role === 'admin') return true

  if (cat.id === 'operations') {
    return ['admin', 'broker', 'salesperson'].includes(user.role) ||
      !!cat.children?.some(child => isSubitemVisible(child.id, cat.id, user, can))
  }

  if (cat.id === 'hr') {
    return ['admin', 'broker'].includes(user.role) || can('hr', 'read')
  }

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

export function deduplicateAppModules<T extends { id?: string; name?: string; path?: string; externalUrl?: string }>(modules: T[]): T[] {
  const normalizeUrl = (url?: string) => (url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const seenKeys = new Set<string>()
  return modules.filter((m) => {
    const idKey = (m.id || '').toLowerCase().trim()
    const nameKey = (m.name || '').toLowerCase().trim()
    const urlKey = normalizeUrl(m.externalUrl || m.path)

    if (idKey && seenKeys.has(`id:${idKey}`)) return false
    if (nameKey && seenKeys.has(`name:${nameKey}`)) return false
    if (urlKey && seenKeys.has(`url:${urlKey}`)) return false

    if (idKey) seenKeys.add(`id:${idKey}`)
    if (nameKey) seenKeys.add(`name:${nameKey}`)
    if (urlKey) seenKeys.add(`url:${urlKey}`)
    return true
  })
}

export interface NavOverrideItem {
  id: string
  label: string
  path: string
  icon: string
  parentSection: string
  sortOrder: number
  active: boolean
  roleVisibility: 'all' | 'admin' | 'broker' | 'admin_broker' | 'salesperson' | 'assistant'
  externalUrl?: string
}

export const PROTECTED_NAV_IDS = new Set([
  'dashboard', 'network', 'deals', 'cma', 'transaction-desk',
  'mls', 'inventory-admin', 'onekey-portal',
  'crm', 'openhouse-list', 'openhouse-admin', 'brand-marketing-hub',
  'director', 'director-admin',
  'academy', 'license-law', 'prime-america-kb', 'broker-course',
  'hr-roster', 'settings',
])

export const DEFAULT_NAV_ITEMS: NavOverrideItem[] = [
  // Core Top-Level
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/',
    icon: 'LayoutDashboard',
    parentSection: 'core',
    sortOrder: 1,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'network',
    label: 'Real Estate Network',
    path: '/network',
    icon: 'Network',
    parentSection: 'core',
    sortOrder: 2,
    active: true,
    roleVisibility: 'all',
  },

  // Operations tools
  {
    id: 'deals',
    label: 'Deals',
    path: '/transactions/pipeline',
    icon: 'ArrowLeftRight',
    parentSection: 'operations',
    sortOrder: 10,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'cma',
    label: 'CMA',
    path: '/transactions/cma',
    icon: 'BarChart3',
    parentSection: 'operations',
    sortOrder: 11,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'transaction-desk',
    label: 'TransactionDesk',
    path: '/transactions/desk',
    icon: 'FileSignature',
    parentSection: 'transactions',
    sortOrder: 12,
    active: true,
    roleVisibility: 'all',
    externalUrl: 'https://pr.transactiondesk.com/',
  },

  // Inventory
  {
    id: 'mls',
    label: 'Listings',
    path: '/inventory/mls',
    icon: 'Map',
    parentSection: 'inventory',
    sortOrder: 20,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'inventory-admin',
    label: 'Inventory Admin',
    path: '/inventory/admin',
    icon: 'Building2',
    parentSection: 'inventory',
    sortOrder: 21,
    active: true,
    roleVisibility: 'admin_broker',
    externalUrl: 'https://inventory.primeamericarealestate.com',
  },
  {
    id: 'onekey-portal',
    label: 'OneKey MLS',
    path: '/inventory/onekey',
    icon: 'ExternalLink',
    parentSection: 'inventory',
    sortOrder: 22,
    active: true,
    roleVisibility: 'all',
    externalUrl: 'https://onekey.clareity.net/layouts',
  },

  // Marketing
  {
    id: 'crm',
    label: 'CRM',
    path: '/marketing/crm',
    icon: 'Users',
    parentSection: 'marketing',
    sortOrder: 30,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'openhouse-list',
    label: 'Open Houses',
    path: '/marketing/openhouses',
    icon: 'Home',
    parentSection: 'marketing',
    sortOrder: 31,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'openhouse-admin',
    label: 'Open House Admin',
    path: '/marketing/openhouse-admin',
    icon: 'ExternalLink',
    parentSection: 'marketing',
    sortOrder: 32,
    active: true,
    roleVisibility: 'admin_broker',
    externalUrl: 'https://openhouse.primeamericarealestate.com',
  },
  {
    id: 'brand-marketing-hub',
    label: 'Brand & Marketing Hub',
    path: '/marketing/brand-marketing-hub',
    icon: 'Sparkles',
    parentSection: 'marketing',
    sortOrder: 33,
    active: true,
    roleVisibility: 'all',
    externalUrl: '/api/sso/redirect?app=brand-hub&return_to=%2Fdashboard',
  },
  {
    id: 'director',
    label: 'DIRECTOR.EXE',
    path: '/marketing/director',
    icon: 'Terminal',
    parentSection: 'marketing',
    sortOrder: 34,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'director-admin',
    label: 'DIRECTOR Admin',
    path: '/admin/director',
    icon: 'Settings',
    parentSection: 'settings',
    sortOrder: 61,
    active: true,
    roleVisibility: 'admin_broker',
  },

  // Learning & Compliance
  {
    id: 'academy',
    label: 'Academy',
    path: '/learning/academy',
    icon: 'GraduationCap',
    parentSection: 'learning',
    sortOrder: 40,
    active: true,
    roleVisibility: 'all',
    externalUrl: 'https://primeamerica.theceshop.com/real-estate/',
  },
  {
    id: 'license-law',
    label: 'License Law (NY 12-A)',
    path: '/learning/license-law',
    icon: 'Scale',
    parentSection: 'learning',
    sortOrder: 41,
    active: true,
    roleVisibility: 'all',
  },
  {
    id: 'prime-america-kb',
    label: 'Prime America KB',
    path: '/learning/kb',
    icon: 'BookOpen',
    parentSection: 'learning',
    sortOrder: 42,
    active: true,
    roleVisibility: 'admin_broker',
    externalUrl: 'https://prime-america-kb.lama-4db.workers.dev/hub/',
  },
  {
    id: 'broker-course',
    label: 'Broker License',
    path: '/learning/broker',
    icon: 'Award',
    parentSection: 'learning',
    sortOrder: 43,
    active: true,
    roleVisibility: 'all',
    externalUrl: 'https://primeamerica.theceshop.com/real-estate/',
  },

  // HR & Compliance
  {
    id: 'hr-roster',
    label: 'HR & NY DOS Roster',
    path: '/hr',
    icon: 'Building2',
    parentSection: 'hr',
    sortOrder: 50,
    active: true,
    roleVisibility: 'admin_broker',
  },

  // Settings
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    icon: 'Settings',
    parentSection: 'settings',
    sortOrder: 60,
    active: true,
    roleVisibility: 'all',
  },
]
