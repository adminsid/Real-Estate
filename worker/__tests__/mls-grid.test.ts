import { describe, expect, it } from 'vitest'
import { createClient, publicProjection } from '../../scripts/mls-grid/client.mjs'
import { openStore } from '../../scripts/mls-grid/store.mjs'

const token = 'test-credential'
const source = 'onekey2'
const row = (overrides = {}) => ({ ListingKey: 'KEY1', ListingId: 'KEY123', OriginatingSystemName: source, ModificationTimestamp: '2026-10-01T12:00:00.000Z', MlgCanView: true, MlgCanUse: ['IDX'], StandardStatus: 'Active', ListPrice: 500000, City: 'New York', PublicRemarks: 'Sample description', ...overrides })

describe('MLS Grid replication boundaries', () => {
  it('uses viewability only for initial import and includes removal records in updates', () => {
    const client = createClient({ token, source })
    expect(new URL(client.initial()).searchParams.get('$filter')).toContain('MlgCanView eq true')
    const incremental = new URL(client.initial('2026-10-01T12:00:00.000Z')).searchParams.get('$filter')
    expect(incremental).toContain('ModificationTimestamp gt')
    expect(incremental).not.toContain('MlgCanView')
  })
  it('does not send credentials to a foreign pagination host or follow redirects', async () => {
    let calls = 0
    const client = createClient({ token, source, pause: async () => {}, fetcher: async (_url, options) => {
      calls++
      expect(options.redirect).toBe('error')
      return Response.json({ value: [row()], '@odata.nextLink': 'https://attacker.example/v2/Property' })
    } })
    await expect(client.page(client.initial())).rejects.toThrow('unsafe')
    expect(calls).toBe(1)
    await expect(client.page('https://attacker.example/v2/Property')).rejects.toThrow('unsafe')
    expect(calls).toBe(1)
  })
  it('rejects malformed or wrong-source pages and does not include upstream error text', async () => {
    for (const value of [[row({ OriginatingSystemName: 'other' })], [row({ ModificationTimestamp: 'invalid' })], [row({ MlgCanView: undefined })]]) {
      const client = createClient({ token, source, pause: async () => {}, fetcher: async () => Response.json({ value }) })
      await expect(client.page(client.initial())).rejects.toThrow('Invalid MLS Grid record')
    }
    const client = createClient({ token, source, pause: async () => {}, fetcher: async () => new Response(token, { status: 429 }) })
    await expect(client.page(client.initial())).rejects.toThrow('HTTP 429')
  })
  it('redacts malformed response bodies and connection exceptions', async () => {
    const malformed = createClient({ token, source, pause: async () => {}, fetcher: async () => new Response('credential-containing invalid JSON') })
    await expect(malformed.page(malformed.initial())).rejects.toThrow('Invalid MLS Grid JSON; checkpoint retained')
    const failed = createClient({ token, source, pause: async () => {}, fetcher: async () => { throw new Error(token) } })
    await expect(failed.page(failed.initial())).rejects.toThrow('MLS Grid connection failed; checkpoint retained')
  })
  it('omits private fields, withheld addresses, and remote media URLs from consumer records', () => {
    const projected = publicProjection(row({ InternetAddressDisplayYN: false, StreetName: 'Secret Street', Latitude: 40, OwnerName: 'Private Owner', ShowingInstructions: 'Access code', Media: [{ MediaURL: 'https://remote.example/photo' }] }))
    expect(projected.ListingId).toBe('123')
    expect(projected.id).toBe('KEY1')
    for (const field of ['OwnerName', 'ShowingInstructions', 'Media', 'StreetName', 'Latitude']) expect(projected).not.toHaveProperty(field)
    expect(publicProjection(row({ InternetEntireListingDisplayYN: false }))).toBeNull()
    expect(publicProjection(row({ MlgCanUse: ['VOW'] }))).toBeNull()
  })
})

describe('MLS Grid staging database', () => {
  it('retains records with equal timestamps across pages and makes page replay idempotent', () => {
    const store = openStore(':memory:')
    try {
      const first = { rows: [row()], next: 'page-two' }
      store.apply(source, first)
      store.apply(source, first)
      store.apply(source, { rows: [row({ ListingKey: 'KEY2' })], next: null })
      expect(store.search().total).toBe(2)
      expect(store.checkpoint(source).timestamp).toBe(row().ModificationTimestamp)
    } finally { store.close() }
  })
  it('persists page and resume checkpoint atomically, removing records that lose eligibility', () => {
    const store = openStore(':memory:')
    try {
      store.apply(source, { rows: [row()], next: 'next-page' })
      expect(store.checkpoint(source).next_url).toBe('next-page')
      expect(store.search({ status: 'Active', maxPrice: 600000 }).total).toBe(1)
      expect(() => store.apply(source, { rows: [row({ ListingKey: 'KEY2' }), row({ OriginatingSystemName: 'other' })], next: null })).toThrow('Source mismatch')
      expect(store.search().total).toBe(1)
      expect(store.checkpoint(source).next_url).toBe('next-page')
      store.apply(source, { rows: [row({ MlgCanView: false, ModificationTimestamp: '2026-10-02T12:00:00.000Z' })], next: null })
      expect(store.search().total).toBe(0)
      expect(store.checkpoint(source).timestamp).toBe('2026-10-02T12:00:00.000Z')
      expect(store.checkpoint(source).complete).toBe(1)
    } finally { store.close() }
  })
  it('tracks timestamps even for suppressed records and keeps unknown price out of price filters', () => {
    const store = openStore(':memory:')
    try {
      store.apply(source, { rows: [row({ ListPrice: undefined }), row({ ListingKey: 'KEY2', MlgCanUse: [], ModificationTimestamp: '2026-10-03T12:00:00.000Z' })], next: null })
      expect(store.search().total).toBe(1)
      expect(store.search({ minPrice: 0 }).total).toBe(0)
      expect(store.checkpoint(source).timestamp).toBe('2026-10-03T12:00:00.000Z')
      expect(() => store.search({ maxPrice: 'bad' })).toThrow('Invalid maxPrice')
      expect(store.search({ q: '%' }).total).toBe(0)
    } finally { store.close() }
  })
})
