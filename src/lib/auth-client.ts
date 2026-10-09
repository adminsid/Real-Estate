import { createAuthClient } from 'better-auth/react'
import { adminClient, organizationClient, multiSessionClient } from 'better-auth/client/plugins'

const getAuthBaseUrl = () => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8787'
    }
  }
  return 'https://auth.primeamericarealestate.com'
}

export const authClient = createAuthClient({
  baseURL: getAuthBaseUrl(),
  plugins: [
    adminClient(),
    organizationClient(),
    multiSessionClient(),
  ],
})

export const {
  signIn,
  signOut,
  signUp,
  useSession,
} = authClient
