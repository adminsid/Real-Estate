import { describe, it, expect, vi } from 'vitest'
import { databaseFixture } from './production-fixture'
import { syncLive } from '../src/sync.mjs'
import { searchStore } from '../src/store.mjs'

const time = Date.parse('2026-11-13T12:00:00Z')
const row = (extra: Record<string, unknown> = {}) => ({
  OriginatingSystemName: 'onekey2', ListingKey: 'KEY1', ListingId: 'MLS1',
  MlgCanView: true, MlgCanUse: ['IDX'], StateOrProvince: 'NY',
  StandardStatus: 'Active', PropertyType: 'Residential', CountyOrParish: 'Queens',
  ModificationTimestamp: '2026-11-13T11:00:00.123456Z', ListPrice: 100000,
  Media: [{ MediaKey: 'PHOTO1', Order: 0, Permission: ['Public'] }], ...extra,
})

describe('Independent facts and media ingestion', () => {
  it('checks due facts without fetching media or holding a gallery lease', async () => {
    const { db, sqlite, repo } = databaseFixture()
    try {
      sqlite.exec("UPDATE source_control SET mode='independent'")
      const fetcher = vi.fn(async (url: string) => {
        expect(new URL(url).searchParams.has('$expand')).toBe(false)
        return Response.json({ value: [row({ Media: undefined })] })
      })
      const result = await syncLive({ LIVE_SYNC_ENABLED: 'true', MLS_GRID_ACCESS_TOKEN: 'test', LIVE_DB: db, LIVE_MEDIA: {}, SOURCE_GATEWAY: {} }, { now: () => time, fetcher, pause: async () => {}, maxPages: 1 })
      expect(result.status).toBe('ok')
      expect(fetcher).toHaveBeenCalledTimes(1)
      expect((await repo.state()).lease_until).toBe(0)
      expect(sqlite.prepare('SELECT kind,state FROM ingestion_jobs').all()).toEqual([{ kind: 'cover', state: 'pending' }])
    } finally { sqlite.close() }
  })

  it('does not erase an omitted manifest and fills the same version after facts-only arrival', async () => {
    const { db, sqlite, repo } = databaseFixture(), lease = await repo.acquire(time)
    try {
      const full = row()
      await repo.apply([full], null, lease, time, false)
      sqlite.exec("UPDATE listing_media SET state='ready',type='image/jpeg'; UPDATE listings SET has_photos=1")
      const changed = row({ Media: undefined, ListPrice: 110000, ModificationTimestamp: '2026-11-13T11:01:00.123456Z' })
      await repo.apply([changed], null, lease, time, false, { projection: 'core' })
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_media').get()?.n).toBe(1)
      expect((await searchStore(db, { production: true }).listing('onekey2', 'KEY1')).media).toEqual([])
      await repo.apply([{ ...changed, Media: full.Media }], null, lease, time, false)
      expect((await searchStore(db, { production: true }).listing('onekey2', 'KEY1')).media).toHaveLength(1)
      expect(sqlite.prepare('SELECT price FROM listings').get()?.price).toBe(110000)
    } finally { sqlite.close() }
  })

  it('treats an explicitly requested empty expansion as replacement and rejects stale hydration', async () => {
    const { db, sqlite, repo } = databaseFixture(), lease = await repo.acquire(time)
    try {
      await repo.apply([row()], null, lease, time, false)
      const newer = row({ ModificationTimestamp: '2026-11-13T11:02:00Z', Media: undefined })
      await repo.apply([newer], null, lease, time, false, { projection: 'core' })
      await repo.apply([row()], null, lease, time, false)
      expect(sqlite.prepare('SELECT manifest_version FROM listing_components').get()?.manifest_version).toBeNull()
      await repo.apply([newer], null, lease, time, false)
      expect(sqlite.prepare('SELECT COUNT(*) AS n FROM listing_media').get()?.n).toBe(0)
    } finally { sqlite.close() }
  })
  it('does not skip a minute because cron starts slightly earlier than the previous attempt',async()=>{
    const {db,sqlite,repo}=databaseFixture(),lease=await repo.acquire(time-60000)
    try{
      await repo.apply([],null,lease,time-60000);await repo.apply([],null,lease,time-60000);await repo.release(lease)
      sqlite.prepare("UPDATE source_control SET mode='independent',poll_started_at=?").run(time-59900)
      const fetcher=vi.fn(async()=>Response.json({value:[]}))
      await syncLive({LIVE_SYNC_ENABLED:'true',MLS_GRID_ACCESS_TOKEN:'test',LIVE_DB:db,LIVE_MEDIA:{}},{now:()=>time,fetcher,maxPages:1})
      expect(fetcher).toHaveBeenCalledOnce()
    }finally{sqlite.close()}
  })
  it('returns bounded card summaries while full details and galleries remain available locally',async()=>{
    const {db,sqlite,repo}=databaseFixture(),lease=await repo.acquire(time)
    try{
      const rows=Array.from({length:24},(_,i)=>row({ListingKey:'CARD'+i,ListingId:'MLS'+i,PublicRemarks:'Description '.repeat(1000),
        Media:Array.from({length:20},(_,p)=>({MediaKey:`CARD${i}-P${p}`,Permission:['Public'],Order:p,ShortDescription:'Photo supplied by brokerage.'}))}))
      await repo.apply(rows,null,lease,time,false)
      sqlite.exec("UPDATE listing_media SET state='ready';UPDATE listings SET has_photos=1")
      const store=searchStore(db,{production:true}),result=await store.search({borough:'Queens',limit:'24'})
      expect(result.listings).toHaveLength(24)
      expect(result.listings.every(listing=>listing.media.length===1&&listing.photoCount===20&&listing.PublicRemarks===undefined)).toBe(true)
      expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(150*1024)
      const full=await store.listing('onekey2','CARD1')
      expect(full.PublicRemarks).toBe(rows[1].PublicRemarks);expect(full.media).toHaveLength(20)
    }finally{sqlite.close()}
  })
})
