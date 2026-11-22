import {describe, it, expect, vi, afterEach} from 'vitest';
import {databaseFixture} from './production-fixture';
import {searchCheckpoints} from '../src/search-checkpoints.mjs';
import {watchSearchUpdates} from '../../../scripts/mls-grid/search-updates.mjs';
import {searchStore} from '../src/store.mjs';

const a = 'a'.repeat(64), b = 'b'.repeat(64);
const response = (version = a) => Response.json({checkpoints: [{source: 'onekey2', version, updated_at: '2026-11-15T12:00:00Z'}]});
afterEach(() => {vi.useRealTimers();});
describe('lightweight search updates', () => {
  it('does not hide an arrival that commits between search statistics and result reads', async () => {
    const {db, sqlite, repo} = databaseFixture();
    try {
      const now = Date.parse('2026-11-15T12:00:00Z'), lease = await repo.acquire(now), prepare = db.prepare;
      let committed = false;
      vi.spyOn(db, 'prepare').mockImplementation(sql => {
        const statement = prepare(sql);
        if (!sql.startsWith('SELECT COUNT(*) AS total,')) return statement;
        return {...statement, async first() {
          const result = await statement.first();
          if (!committed) {
            committed = true;
            await repo.apply([{OriginatingSystemName: 'onekey2', ListingKey: 'NEW', ListingId: 'NEW', MlgCanView: true, MlgCanUse: ['IDX'], StateOrProvince: 'NY', CountyOrParish: 'Queens', StandardStatus: 'Active', PropertyType: 'Residential', ModificationTimestamp: '2026-11-15T11:59:00Z'}], null, lease, now, true, {projection: 'core'});
          }
          return result;
        }};
      });
      const old = await searchStore(db, {production: true}).search({borough: 'Queens'});
      expect(old.total).toBe(0);
      expect(old.checkpoints[0].version).not.toBe((await searchCheckpoints(db))[0].version);
      expect((await searchStore(db, {production: true}).search({borough: 'Queens'})).listings[0].id).toBe('NEW');
    } finally {sqlite.close();}
  });
  it('ignores empty poll timestamps but detects tied-timestamp pagination without exposing cursor URLs', async () => {
    const {db, sqlite} = databaseFixture();
    try {
      const initial = await searchCheckpoints(db);
      sqlite.exec("UPDATE feed_state SET last_complete='2026-11-15T12:00:00Z'");
      expect((await searchCheckpoints(db))[0].version).toBe(initial[0].version);
      sqlite.exec("UPDATE feed_state SET replay_watermark='2026-11-15T11:59:00.123456Z',next_url='https://api.mlsgrid.com/v2/Property?private_cursor=100'");
      const first = await searchCheckpoints(db);
      sqlite.exec("UPDATE feed_state SET next_url='https://api.mlsgrid.com/v2/Property?private_cursor=200'");
      const second = await searchCheckpoints(db);
      expect(second[0].version).not.toBe(first[0].version);
      expect(JSON.stringify(second)).not.toContain('private_cursor');
      expect(Object.keys(second[0]).sort()).toEqual(['complete', 'source', 'updated_at', 'version']);
    } finally {sqlite.close();}
  });
  it('detects separate open-house commits without exposing event identifiers',async()=>{const {db,sqlite}=databaseFixture();try{const before=await searchCheckpoints(db);sqlite.exec("INSERT INTO open_house_state(source,phase,timestamp) VALUES ('onekey2','delta','2026-11-16T12:00:00Z')");const after=await searchCheckpoints(db);expect(after[0].version).not.toBe(before[0].version);expect(Object.keys(after[0]).sort()).toEqual(['complete','source','updated_at','version']);}finally{sqlite.close();}});
  it('notifies once per changed checkpoint, without fetching results or mutating MLS data', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn(async () => response(b)), onUpdate = vi.fn();
    const stop = watchSearchUpdates({getCurrent: () => ({version: a, key: '?borough=Queens'}), visible: () => true, fetcher, onUpdate});
    await vi.advanceTimersByTimeAsync(30000);
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe('/api/search-updates');
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
    await vi.advanceTimersByTimeAsync(30000);
    expect(onUpdate).toHaveBeenCalledOnce(); stop();
    await vi.advanceTimersByTimeAsync(60000); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not request while hidden or before a search completes, and does not notify for unchanged data', async () => {
    vi.useFakeTimers(); let visible = false, ready = false;
    const fetcher = vi.fn(async () => response()), onUpdate = vi.fn();
    const stop = watchSearchUpdates({getCurrent: () => ready ? {version: a, key: 'q'} : null, visible: () => visible, fetcher, onUpdate});
    await vi.advanceTimersByTimeAsync(30000); visible = true;
    await vi.advanceTimersByTimeAsync(30000); expect(fetcher).not.toHaveBeenCalled(); ready = true;
    await vi.advanceTimersByTimeAsync(30000); expect(fetcher).toHaveBeenCalledOnce(); expect(onUpdate).not.toHaveBeenCalled(); stop();
  });
  it('discards a check that belongs to the previous filters', async () => {
    vi.useFakeTimers(); let key = 'Queens', resolve!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(done => {resolve = done;})), onUpdate = vi.fn();
    const stop = watchSearchUpdates({getCurrent: () => ({version: a, key}), visible: () => true, fetcher, onUpdate});
    await vi.advanceTimersByTimeAsync(30000); key = 'Brooklyn'; resolve(response(b));
    await vi.advanceTimersByTimeAsync(0); expect(onUpdate).not.toHaveBeenCalled(); stop();
  });
  it('backs off failures and stops on an expired authorization session', async () => {
    vi.useFakeTimers(); const fetcher = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(new Response(null, {status: 403}));
    const stop = watchSearchUpdates({getCurrent: () => ({version: a, key: 'q'}), visible: () => true, fetcher, onUpdate: vi.fn()});
    await vi.advanceTimersByTimeAsync(30000); expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(59000); expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000); expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300000); expect(fetcher).toHaveBeenCalledTimes(2); stop();
  });
});
