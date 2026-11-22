import {describe, it, expect} from 'vitest';
import {databaseFixture} from './production-fixture';
import {searchStore} from '../src/store.mjs';
import {photoCountLabel} from '../../../scripts/mls-grid/consumer.mjs';
import {publicProjection} from '../../../scripts/mls-grid/client.mjs';
import {renderPage} from '../../../scripts/mls-grid/pages.mjs';
import {DEFAULT_BRAND} from '../../../scripts/mls-grid/brand.mjs';

const time = Date.parse('2026-11-15T12:00:00Z');
const listing = (extra = {}) => ({OriginatingSystemName: 'onekey2', ListingKey: 'COUNT1', ListingId: 'COUNT1', MlgCanView: true, MlgCanUse: ['IDX'], StandardStatus: 'Active', PropertyType: 'Residential', StateOrProvince: 'NY', CountyOrParish: 'Queens', ListPrice: 500000, ModificationTimestamp: '2026-11-15T11:00:00Z', Media: Array.from({length: 24}, (_,i) => ({MediaKey: `PHOTO${i}`, Order: i, Permission: ['Public']})), ...extra});

describe('listing photo totals', () => {
  it('shows all public listing photos on the card with only one imported cover', async () => {
    const {db, sqlite, repo} = databaseFixture();
    try {
      const lease = await repo.acquire(time);
      await repo.apply([listing()], null, lease, time, false);
      sqlite.exec("UPDATE listing_media SET state='ready' WHERE position=0; UPDATE listings SET has_photos=1");
      const result = await searchStore(db, {production: true}).search({borough: 'Queens'});
      expect(result.listings[0].media).toHaveLength(1);
      expect(result.listings[0].photoCount).toBe(24);
      sqlite.exec("UPDATE listing_media SET state='ready' WHERE position<8; UPDATE listing_media SET state='failed' WHERE position=12");
      expect((await searchStore(db, {production: true}).search({borough: 'Queens'})).listings[0].photoCount).toBe(24);
    } finally { sqlite.close(); }
  });
  it('counts the current public manifest before any downloads, excluding private and duplicate entries', async () => {
    const {db, sqlite, repo} = databaseFixture();
    try {
      const lease = await repo.acquire(time), row = listing();
      row.Media.push({...row.Media[0]}, {MediaKey: 'PRIVATE', Order: 25, Permission: ['Private']}, {MediaKey: 'MIXED', Order: 26, Permission: ['Public', 'Private']});
      await repo.apply([{...row, PhotosCount: 99}], null, lease, time, false);
      const result = (await searchStore(db, {production: true}).search({borough: 'Queens'})).listings[0];
      expect(result.media).toHaveLength(0);
      expect(result.photoCount).toBe(24);
      expect(result).not.toHaveProperty('PhotosCount');
      const detail = await searchStore(db, {production: true}).listing('onekey2', 'COUNT1');
      expect(detail.photoCount).toBe(24); expect(detail).not.toHaveProperty('PhotosCount');
      expect(photoCountLabel(result)).toBe('24 photos');
    } finally { sqlite.close(); }
  });
  it('uses a fresh MLS total while a new manifest is pending and updates after photo removal', async () => {
    const {db, sqlite, repo} = databaseFixture();
    try {
      const lease = await repo.acquire(time), store = searchStore(db, {production: true});
      await repo.apply([listing()], null, lease, time, false);
      const updated = listing({Media: undefined, PhotosCount: 6, ModificationTimestamp: '2026-11-15T11:01:00Z'});
      await repo.apply([updated], null, lease, time, false, {projection: 'core'});
      let result = (await store.search({borough: 'Queens'})).listings[0];
      expect(result.media).toHaveLength(0); expect(result.photoCount).toBe(6);
      await repo.apply([{...updated, Media: listing().Media.slice(0, 2)}], null, lease, time, false);
      result = (await store.search({borough: 'Queens'})).listings[0];
      expect(result.photoCount).toBe(2);
      expect((await store.listing('onekey2', 'COUNT1')).photoCount).toBe(2);
    } finally { sqlite.close(); }
  });
  it('keeps an unknown total distinct from zero or a stale manifest', async () => {
    const {db, sqlite, repo} = databaseFixture();
    try {
      const lease = await repo.acquire(time), store = searchStore(db, {production: true});
      await repo.apply([listing()], null, lease, time, false);
      const updated = listing({Media: undefined, ModificationTimestamp: '2026-11-15T11:01:00Z'});
      await repo.apply([updated], null, lease, time, false, {projection: 'core'});
      let result = (await store.search({borough: 'Queens'})).listings[0];
      expect(result.photoCount).toBeNull(); expect(photoCountLabel(result)).toBe('Photos');
      await repo.apply([{...updated, Media: []}], null, lease, time, false);
      result = (await store.search({borough: 'Queens'})).listings[0];
      expect(result.photoCount).toBe(0); expect(photoCountLabel(result)).toBe('0 photos');
    } finally { sqlite.close(); }
  });
  it('accepts only valid source totals and never derives the badge from the loaded array', () => {
    expect(publicProjection(listing({PhotosCount: 24})).PhotosCount).toBe(24);
    for (const count of [null, -1, 1.5, '24', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(publicProjection(listing({PhotosCount: count})).PhotosCount).toBeUndefined();
    expect(photoCountLabel({photoCount: 24, media: [{}]})).toBe('24 photos');
    expect(photoCountLabel({PhotosCount: 1, media: []})).toBe('1 photo');
    expect(photoCountLabel({photoCount: 0, PhotosCount: 24})).toBe('0 photos');
    expect(photoCountLabel({media: [{}, {}]})).toBe('Photos');
  });
  it('renders the total in initial and embedded HTML, even before the cover is downloaded', () => {
    const template = '<title>Search</title><body><section id="results" data-view="grid"></section></body>';
    for (const embedded of [false, true]) {
      for (const media of [[], [{url: '/media/' + 'a'.repeat(64)}]]) {
        const html = renderPage(template, {brand: DEFAULT_BRAND, origin: 'https://search.example', embedded, results: {listings: [{source: 'onekey2', id: 'COUNT1', photoCount: 24, media}]}});
        expect(html).toContain('<span class="photo-tag">24 photos</span>');
        expect(html).not.toContain('1 / 1');
      }
    }
  });
});
