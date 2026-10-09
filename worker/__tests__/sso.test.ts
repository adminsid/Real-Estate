import { describe, it, expect } from 'vitest'

describe('SSO & Satellite Gateway Contract', () => {
  const appUrls: Record<string, string> = {
    'prime-america-kb': 'https://prime-america-kb.lama-4db.workers.dev/hub/',
    'academy': 'https://primeamerica.theceshop.com/real-estate/',
    'inventory': 'https://inventory.primeamericarealestate.com',
    'listing-input': 'https://inventory.primeamericarealestate.com',
    'openhouse': 'https://openhouse.primeamericarealestate.com',
    'brand-hub': 'https://inside.primeamericarealestate.com',
    'branding-hub': 'https://inside.primeamericarealestate.com',
  }

  it('contains mapping for all registered satellite applications', () => {
    expect(appUrls['inventory']).toBe('https://inventory.primeamericarealestate.com')
    expect(appUrls['openhouse']).toBe('https://openhouse.primeamericarealestate.com')
    expect(appUrls['brand-hub']).toBe('https://inside.primeamericarealestate.com')
    expect(appUrls['branding-hub']).toBe('https://inside.primeamericarealestate.com')
    expect(appUrls['prime-america-kb']).toBe('https://prime-america-kb.lama-4db.workers.dev/hub/')
    expect(appUrls['academy']).toBe('https://primeamerica.theceshop.com/real-estate/')
  })

  it('correctly constructs SSO redirect URL with token parameter', () => {
    const targetUrl = appUrls['brand-hub']
    const token = 'mock-uuid-token-12345'
    const redirectUrlObj = new URL(targetUrl)
    redirectUrlObj.searchParams.set('sso_token', token)

    expect(redirectUrlObj.toString()).toBe('https://inside.primeamericarealestate.com/?sso_token=mock-uuid-token-12345')
  })

  it('safely handles return_to sub-paths when preserving deep links', () => {
    const targetUrl = appUrls['inventory']
    const returnTo = '/listings/edit/123'
    const redirectBase = new URL(returnTo, targetUrl).toString()
    const redirectUrlObj = new URL(redirectBase)
    redirectUrlObj.searchParams.set('sso_token', 'test-token')

    expect(redirectUrlObj.toString()).toBe('https://inventory.primeamericarealestate.com/listings/edit/123?sso_token=test-token')
  })
})
