import { betterAuth } from 'better-auth'
import { admin, bearer, organization, multiSession } from 'better-auth/plugins'
import { Kysely } from 'kysely'
import { D1Dialect } from 'kysely-d1'

export interface AuthEnv {
  DB: any // D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  COOKIE_DOMAIN?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

export function createAuth(env: AuthEnv) {
  const db = new Kysely({ dialect: new D1Dialect({ database: env.DB }) })

  return betterAuth({
    database: {
      db,
      type: 'sqlite',
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || 'https://auth.primeamericarealestate.com',
    basePath: '/api/auth',

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
    },

    socialProviders: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      }
    } : undefined,

    user: {
      additionalFields: {
        phone: { type: 'string', required: false, defaultValue: null },
        company: { type: 'string', required: false, defaultValue: 'Prime America Real Estate' },
        designation: { type: 'string', required: false, defaultValue: 'Licensed Real Estate Salesperson' },
        license_number: { type: 'string', required: false, defaultValue: null },
        role: { type: 'string', required: false, defaultValue: 'salesperson' },
        headshot_url: { type: 'string', required: false, defaultValue: null },
      },
    },

    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: env.COOKIE_DOMAIN || '.primeamericarealestate.com',
      },
    },

    plugins: [
      admin({
        defaultRole: 'salesperson',
        adminRole: 'admin',
      }),
      bearer(),
      organization(),
      multiSession(),
    ],

    trustedOrigins: [
      'https://auth.primeamericarealestate.com',
      'https://app.primeamericarealestate.com',
      'https://workspace.primeamericany.com',
      'https://inventory.primeamericarealestate.com',
      'https://openhouse.primeamericarealestate.com',
      'https://inside.primeamericarealestate.com',
      'https://primeamericarealestate.com',
      'http://localhost:5173',
      'http://localhost:8787',
      'http://localhost:3000',
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
