import {describe, it, expect, vi} from 'vitest';
import {databaseFixture} from './production-fixture';
import {searchStore} from '../src/store.mjs';
import {publishJobs} from '../src/job-store.mjs';

const now = Date.parse('2026-11-15T12:00:00Z');
const row = (id: string, date: string) => ({OriginatingSystemName: 'onekey2', ListingKey: id, ListingId: id, MlgCanView: true, MlgCanUse: ['IDX'], StateOrProvince: 'NY', CountyOrParish: 'Queens', StandardStatus: 'Active', PropertyType: 'Residential', ListPrice: 500000, OnMarketDate: date, ModificationTimestamp: '2026-11-15T11:59:00Z'});
describe('new listing delivery', () => {
  it('makes fresh core records searchable immediately without waiting for media', async () => {
    const {db, sqlite, repo} = databaseFixture();
    try {
      const lease = await repo.acquire(now);
      await repo.apply([row('NEW', '2026-11-15')], null, lease, now, false, {projection: 'core'});
      const result = await searchStore(db, {production: true}).search({borough: 'Queens', sort: 'newest'});
      expect(result.listings[0].id).toBe('NEW');
      expect(result.listings[0].media).toHaveLength(0);
      expect(typeof result.checkpoints[0].version).toBe('string');
      expect(result.checkpoints[0]).not.toHaveProperty('next_url');
    } finally {sqlite.close();}
  });
  it('publishes newly listed covers ahead of old warmup work while reserving an old-work slot', async () => {
    const {db, sqlite, repo} = databaseFixture(), send = vi.fn(async () => {});
    try {
      sqlite.exec("UPDATE source_control SET mode='independent'");
      let lease = await repo.acquire(now - 100000);
      await repo.apply(Array.from({length: 10}, (_,i) => row('OLD' + i, '2025-01-01')), null, lease, now - 100000, false, {projection: 'core'});
      await repo.release(lease); lease = await repo.acquire(now);
      await repo.apply([row('NEW', '2026-11-15')], null, lease, now, false, {projection: 'core'});
      await publishJobs({LIVE_DB: db, COVER_JOBS: {send}, IMAGE_TRANSFORM_LIMIT: '0'}, {now, limit: 12});
      const ids = send.mock.calls.map(call => call[0].id);
      expect(ids).toHaveLength(3);
      expect(ids[0]).toContain('NEW');
      expect(ids.some(id => id.includes('OLD'))).toBe(true);
    } finally {sqlite.close();}
  });
  it('puts an intraday arrival on the first page instead of an older listing with a newer price edit', async () => {
    const {db, sqlite, repo} = databaseFixture();
    try {
      const lease = await repo.acquire(now);
      const existing = Array.from({length: 30}, (_,i) => ({...row('ZOLD' + i, '2026-11-15'), OriginalEntryTimestamp: '2026-11-15T09:00:00Z', ModificationTimestamp: '2026-11-15T12:00:00Z'}));
      await repo.apply([...existing, {...row('ANEW', '2026-11-15'), OriginalEntryTimestamp: '2026-11-15T11:59:00Z'}], null, lease, now, false, {projection: 'core'});
      const result = await searchStore(db, {production: true}).search({borough: 'Queens', sort: 'newest', limit: '24'});
      expect(result.listings).toHaveLength(24);
      expect(result.listings[0].id).toBe('ANEW');
    } finally {sqlite.close();}
  });
});
