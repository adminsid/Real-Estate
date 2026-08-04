import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { User, WorkspaceBranding } from '@/types'
import { DEFAULT_BRANDING } from '@/utils/constants'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SignupData {
  name: string
  email: string
  password: string
  role: User['role']
  licenseNumber?: string
  companyName?: string
}

interface AuthContextValue {
  user: User | null
  branding: WorkspaceBranding
  isAuthenticated: boolean
  isLoading: boolean
  permissions: Record<string, boolean>
  impersonating: { impersonatedBy: string; logId: string } | null
  can: (module: string, action: string) => boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupData) => Promise<{ message: string }>
  logout: () => Promise<void>
  stopImpersonating: () => Promise<void>
  updateBranding: (b: Partial<WorkspaceBranding>) => Promise<void>
  updateProfile: (partial: { name?: string; phone?: string; title?: string; licenseNumber?: string }) => Promise<void>
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Request failed')
  return data
}

function normalizeUser(raw: any): User {
  const avatarRaw = raw?.avatar_url ?? raw?.avatarUrl
  const avatarUrl = typeof avatarRaw === 'string' && avatarRaw.length > 0
    ? (avatarRaw.startsWith('/') ? avatarRaw : `/api/auth/avatar/${encodeURIComponent(avatarRaw)}`)
    : undefined
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    role: raw.role,
    licenseNumber: raw.license_number ?? raw.licenseNumber ?? undefined,
    licenseState: raw.license_state ?? raw.licenseState ?? undefined,
    license_expiration_date: raw.license_expiration_date ?? raw.licenseExpirationDate ?? null,
    tenantId: raw.tenant_id ?? raw.tenantId ?? undefined,
    avatarUrl,
    phone: raw.phone ?? undefined,
    title: raw.title ?? undefined,
    createdAt: raw.created_at ?? raw.createdAt ?? new Date().toISOString(),
  }
}

function mapTenantToBranding(tenant: any): WorkspaceBranding {
  return {
    companyName: tenant.name,
    companyAddress: tenant.company_address ?? undefined,
    companyTelephone: tenant.company_telephone ?? undefined,
    companyFax: tenant.company_fax ?? undefined,
    logoUrl: tenant.logo_url ?? undefined,
    primaryColor: tenant.primary_color ?? '#0F2040',
    accentColor: tenant.accent_color ?? '#C9A84C',
    tagline: tenant.tagline ?? 'Your Real Estate Command Center',
    websiteUrl: tenant.website_url ?? 'https://primeamericany.com',
    dashboardSettings: tenant.dashboard_settings ?? undefined,
    companyLicenseNumber: tenant.company_license_number ?? undefined,
    companyLicenseHolderName: tenant.company_license_holder_name ?? undefined,
    companyLicenseType: tenant.company_license_type ?? undefined,
    companyLicenseExpirationDate: tenant.company_license_expiration_date ?? null,
    companyLicenseSyncedAt: tenant.company_license_synced_at ?? null,
    companyAgentsData: tenant.company_agents_json ?? undefined,
    leadAppDomain: tenant.lead_app_domain ?? undefined,
    customWorkspaceDomain: tenant.custom_workspace_domain ?? undefined,
  }
}
// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const cachedBranding = (() => {
    try {
      const raw = localStorage.getItem('workspace_branding')
      return raw ? { ...DEFAULT_BRANDING, ...JSON.parse(raw) } : DEFAULT_BRANDING
    } catch { return DEFAULT_BRANDING }
  })()
  const [user, setUser] = useState<User | null>(null)
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [impersonating, setImpersonating] = useState<{ impersonatedBy: string; logId: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true) // starts loading while we check session
  const [branding, setBranding] = useState<WorkspaceBranding>(cachedBranding)


  useEffect(() => {
    const faviconHref = branding.logoUrl || '/favicon.svg'
    const touchIconHref = branding.logoUrl || '/icons/icon-192.png'

    let faviconEl = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null
    if (!faviconEl) {
      faviconEl = document.createElement('link')
      faviconEl.rel = 'icon'
      document.head.appendChild(faviconEl)
    }
    faviconEl.href = faviconHref

    let appleTouchEl = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null
    if (!appleTouchEl) {
      appleTouchEl = document.createElement('link')
      appleTouchEl.rel = 'apple-touch-icon'
      document.head.appendChild(appleTouchEl)
    }
    appleTouchEl.href = touchIconHref
  }, [branding.logoUrl])

  // ── Permission check helper ──────────────────────────────────────────────
  const can = useCallback((module: string, action: string): boolean => {
    if (!user) return false
    if (user.role === 'admin') return true
    // Check wildcard
    if (permissions['*'] === true) return true
    // Explicit deny wins
    const key = `${module}:${action}`
    const val = permissions[key]
    return val === true
  }, [user, permissions])

  // ── Load session on mount ────────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch('/api/auth/me')
      const { user: u, permissions: p, impersonating: imp, tenant } = data.data
      setUser(normalizeUser(u))
      setPermissions(p ?? {})
      setImpersonating(imp)
      if (tenant) {
        const brandObj = mapTenantToBranding(tenant)
        setBranding(brandObj)
        localStorage.setItem('workspace_branding', JSON.stringify(brandObj))
      }
    } catch {
      setUser(null)
      setPermissions({})
      setImpersonating(null)
      try {
        const publicBranding = await apiFetch('/api/public/tenant/branding')
        if (publicBranding?.data?.tenant) {
          const brandObj = mapTenantToBranding(publicBranding.data.tenant)
          setBranding(brandObj)
          localStorage.setItem('workspace_branding', JSON.stringify(brandObj))
        }
      } catch (e) {
        console.warn('Failed to load public branding:', e)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { refreshUser() }, [refreshUser])

  // ── Auth actions ─────────────────────────────────────────────────────────
  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    try {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setUser(normalizeUser(data.data.user))
      setPermissions(data.data.permissions ?? {})
      setImpersonating(null)
      // Fetch and cache tenant branding immediately after login
      try {
        const meData = await apiFetch('/api/auth/me')
        if (meData?.data?.tenant) {
          const brandObj = mapTenantToBranding(meData.data.tenant)
          setBranding(brandObj)
          localStorage.setItem('workspace_branding', JSON.stringify(brandObj))
        }
      } catch { /* use cached */ }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signup = useCallback(async (signupData: SignupData): Promise<{ message: string }> => {
    setIsLoading(true)
    try {
      const data = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(signupData),
      })
      return { message: data.message ?? 'Account created. Please verify your email.' }
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' })
    } catch (e) {
      console.warn('Logout API failed:', e)
    }
    setUser(null)
    setPermissions({})
    setImpersonating(null)
  }, [])

  const stopImpersonating = useCallback(async () => {
    await apiFetch('/api/hr/impersonate/stop', { method: 'POST' })
    await refreshUser()
  }, [refreshUser])

  const updateBranding = useCallback(async (partial: Partial<WorkspaceBranding>) => {
    setBranding((prev) => {
      const nextObj = { ...prev, ...partial }
      localStorage.setItem('workspace_branding', JSON.stringify(nextObj))
      return nextObj
    })
    try {
      const data = await apiFetch('/api/tenant/branding', {
        method: 'PUT',
        body: JSON.stringify(partial),
      })
      if (data?.data?.tenant) {
        const next = mapTenantToBranding(data.data.tenant)
        setBranding(next)
        localStorage.setItem('workspace_branding', JSON.stringify(next))
      }
    } catch (e) {
      console.error('Failed to update branding settings:', e)
      throw e
    }
  }, [])

  const updateProfile = useCallback(async (partial: { name?: string; phone?: string; title?: string; licenseNumber?: string }) => {
    await apiFetch('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(partial),
    })
    await refreshUser()
  }, [refreshUser])

  return (
    <AuthContext.Provider
      value={{
        user,
        branding,
        isAuthenticated: !!user,
        isLoading,
        permissions,
        impersonating,
        can,
        login,
        signup,
        logout,
        stopImpersonating,
        updateBranding,
        updateProfile,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export { useAuth } from '@/hooks/useAuth'
