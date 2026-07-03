import { createContext, useState, useCallback, type ReactNode } from 'react'
import type { User, WorkspaceBranding } from '@/types'
import { DEFAULT_BRANDING } from '@/utils/constants'

interface AuthContextValue {
  user: User | null
  branding: WorkspaceBranding
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (data: SignupData) => Promise<void>
  logout: () => void
  updateBranding: (b: Partial<WorkspaceBranding>) => void
}

export interface SignupData {
  name: string
  email: string
  password: string
  role: User['role']
  licenseNumber?: string
  companyName?: string
}

export const AuthContext = createContext<AuthContextValue | null>(null)

// ── Persisted helpers ───────────────────────────────────────────────────────
const STORAGE_KEY = 're_workspace_user'

function persistUser(u: User | null) {
  if (u) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(u))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

// ── Provider ────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => loadUser())
  const [isLoading, setIsLoading] = useState(false)
  const [branding, setBranding] = useState<WorkspaceBranding>(
    () => loadUser()?.branding ?? DEFAULT_BRANDING,
  )

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true)
    try {
      // In production, replace this with an actual Cloudflare Worker API call:
      // const res = await fetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      await new Promise((r) => setTimeout(r, 600)) // simulate network
      if (!email || !password) throw new Error('Invalid credentials')

      const mockUser: User = {
        id: 'usr_' + Math.random().toString(36).slice(2),
        email,
        name: email.split('@')[0],
        role: 'salesperson',
        createdAt: new Date().toISOString(),
        branding: DEFAULT_BRANDING,
      }
      setUser(mockUser)
      setBranding(mockUser.branding ?? DEFAULT_BRANDING)
      persistUser(mockUser)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signup = useCallback(async (data: SignupData) => {
    setIsLoading(true)
    try {
      // In production, replace this with an actual Cloudflare Worker API call:
      // const res = await fetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) })
      await new Promise((r) => setTimeout(r, 800))

      const brd: WorkspaceBranding = {
        ...DEFAULT_BRANDING,
        companyName: data.companyName ?? DEFAULT_BRANDING.companyName,
      }
      const newUser: User = {
        id: 'usr_' + Math.random().toString(36).slice(2),
        email: data.email,
        name: data.name,
        role: data.role,
        licenseNumber: data.licenseNumber,
        createdAt: new Date().toISOString(),
        branding: brd,
      }
      setUser(newUser)
      setBranding(brd)
      persistUser(newUser)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setBranding(DEFAULT_BRANDING)
    persistUser(null)
  }, [])

  const updateBranding = useCallback((partial: Partial<WorkspaceBranding>) => {
    setBranding((prev) => {
      const next = { ...prev, ...partial }
      if (user) {
        const updated: User = { ...user, branding: next }
        setUser(updated)
        persistUser(updated)
      }
      return next
    })
  }, [user])

  return (
    <AuthContext.Provider
      value={{ user, branding, isAuthenticated: !!user, isLoading, login, signup, logout, updateBranding }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook (re-exported from hooks/useAuth for backward compatibility) ────────
export { useAuth } from '@/hooks/useAuth'
