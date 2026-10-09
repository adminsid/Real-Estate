import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMediaReplicator, mediaIdentity } from '../../scripts/mls-grid/media.mjs'
import { openStore } from '../../scripts/mls-grid/store.mjs'

const token = 'server-only-test-token'
const source = 'onekey2'
const jpeg = Buffer.from([255, 216, 255, 217])
const media = (overrides = {}) => ({ MediaKey: 'photo1', Permission: ['Public'], MediaModificationTimestamp: '2026-10-01T12:00:00Z', MediaURL: 'https://media-demo.mlsgrid.com/signed-photo', Order: 0, ...overrides })
const row = (overrides = {}) => ({ ListingKey: 'KEY1', ListingId: 'KEY123', OriginatingSystemName: source, MlgCanView: true, MlgCanUse: ['IDX'], ModificationTimestamp: '2026-10-01T12:00:00Z', Media: [media()], ...overrides })

describe('MLS Grid media replication', () => {
  it('stores photos once, reuses across signed URL changes, and downloads revised media', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mls-media-'))
    let calls = 0
    const downloader = createMediaReplicator({ token, source, directory, pause: async () => {}, fetcher: async (_url, options) => {
      expect(options.headers['User-Agent']).toBe(token)
      calls++
      return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } })
    } })
    try {
      const first = await downloader.replicate(row())
      expect(first[0].file).toMatch(/^[a-f0-9]{64}$/)
      await downloader.replicate(row({ Media: [media({ MediaURL: 'https://media-demo.mlsgrid.com/new-signed-token' })] }))
      expect(calls).toBe(1)
      await downloader.replicate(row({ Media: [media({ MediaModificationTimestamp: '2026-10-02T12:00:00Z' })] }))
      expect(calls).toBe(2)
      expect(downloader.stats()).toEqual({ downloaded: 2, reused: 1, skipped: 0, downloadedBytes: 8 })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('follows only the verified storage destination, with no credentials on its request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mls-media-'))
    const destination = 'https://mlsgrid.f9ebe9654c02ab185d2bc1491ca042a5.r2.cloudflarestorage.com/bucket/signed.jpg'
    let calls = 0
    const downloader = createMediaReplicator({ token, source, directory, pause: async () => {}, fetcher: async (url, options) => {
      calls++
      if (calls === 1) {
        expect(options.headers['User-Agent']).toBe(token)
        return new Response(null, { status: 307, headers: { Location: destination } })
      }
      expect(url).toBe(destination)
      expect(options).not.toHaveProperty('headers')
      expect(options.redirect).toBe('error')
      return new Response(jpeg)
    } })
    try { expect(await downloader.replicate(row())).toHaveLength(1); expect(calls).toBe(2) }
    finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('rejects untrusted initial hosts and redirects, and never downloads private media', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mls-media-'))
    let calls = 0
    const downloader = createMediaReplicator({ token, source, directory, pause: async () => {}, fetcher: async () => {
      calls++
      return new Response(null, { status: 307, headers: { Location: 'https://attacker.example/image' } })
    } })
    try {
      expect(await downloader.replicate(row({ MlgCanView: false }))).toEqual([])
      expect(await downloader.replicate(row({ Media: [media({ Permission: ['Private'] })] }))).toEqual([])
      expect(calls).toBe(0)
      await expect(downloader.replicate(row({ Media: [media({ MediaURL: 'https://attacker.example/image' })] }))).rejects.toThrow('unsafe media host')
      expect(calls).toBe(0)
      await expect(downloader.replicate(row())).rejects.toThrow('Media connection failed')
      expect(calls).toBe(1)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('stops on HTTP 429 without retrying and does not expose an upstream body', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mls-media-'))
    let calls = 0
    const downloader = createMediaReplicator({ token, source, directory, pause: async () => {}, fetcher: async () => { calls++; return new Response(token, { status: 429 }) } })
    try { await expect(downloader.replicate(row())).rejects.toThrow('HTTP 429'); expect(calls).toBe(1) }
    finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('stops before consuming another signed URL when its download budget is reached', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mls-media-'))
    let calls = 0
    const downloader = createMediaReplicator({ token, source, directory, maxDownloads: 1, pause: async () => {}, fetcher: async () => { calls++; return new Response(jpeg) } })
    try {
      await expect(downloader.replicate(row({ Media: [media(), media({ MediaKey: 'photo2' })] }))).rejects.toThrow('budget reached')
      expect(calls).toBe(1)
      expect(await downloader.replicate(row())).toHaveLength(1)
      expect(calls).toBe(1)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('skips active or non-image documents instead of serving them as gallery images', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mls-media-'))
    const downloader = createMediaReplicator({ token, source, directory, pause: async () => {}, fetcher: async () => new Response('<svg onload="alert(1)"></svg>') })
    try { expect(await downloader.replicate(row())).toEqual([]) }
    finally { await rm(directory, { recursive: true, force: true }) }
  })
})

describe('MLS Grid media visibility and checkpoints', () => {
  it('serves only current listing relations and does not advance the feed checkpoint during backfill', () => {
    const store = openStore(':memory:')
    const file = mediaIdentity(source, media())
    const files = [{ key: 'photo1', revision: null, file, type: 'image/jpeg', order: 0, caption: '' }]
    try {
      store.apply(source, { rows: [row()], next: 'page2' })
      store.apply(source, { rows: [row()], next: null, media: new Map([['KEY1', files]]) }, { checkpoint: false })
      expect(store.checkpoint(source).next_url).toBe('page2')
      expect(store.mediaFile(file)).toBeTruthy()
      const result = store.search().listings[0]
      expect(result.media).toEqual([{ url: `/media/${file}`, caption: '' }])
      expect(JSON.stringify(result)).not.toContain('media-demo.mlsgrid.com')
      store.apply(source, { rows: [row({ MlgCanView: false })], next: null })
      expect(store.mediaFile(file)).toBeUndefined()
      expect(store.mediaFor(source, 'KEY1')).toEqual([])
    } finally { store.close() }
  })
})
