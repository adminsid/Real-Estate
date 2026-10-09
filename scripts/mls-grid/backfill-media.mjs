import { open, unlink } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createClient, createRequestPacer } from './client.mjs';
import { createMediaReplicator } from './media.mjs';
import { openStore } from './store.mjs';

const path = resolve(process.env.MLS_GRID_DB || '.mls-grid-demo/listings.sqlite');
const source = process.env.MLS_GRID_SOURCE || 'onekey2';
const limit = Number(process.env.MLS_GRID_MEDIA_LISTINGS || 12);
const offset = Number(process.env.MLS_GRID_MEDIA_OFFSET || 0);
const type = process.env.MLS_GRID_MEDIA_TYPE || 'Residential';
let lock, store;
try {
  if (!['Residential','Residential Lease','Residential Income','Commercial Sale','Commercial Lease','Land'].includes(type)) throw new Error('Unsupported property type');
  if (source !== 'onekey2' || !Number.isSafeInteger(limit) || limit < 1 || limit > 24 || !Number.isSafeInteger(offset) || offset < 0) throw new Error('Backfill supports 1–24 OneKey demo listings and a nonnegative offset');
  const beforeRequest = createRequestPacer();
  const client = createClient({ token: process.env.MLS_GRID_ACCESS_TOKEN, source, beforeRequest });
  const media = createMediaReplicator({ token: process.env.MLS_GRID_ACCESS_TOKEN, source, directory: join(dirname(path), 'media'), beforeRequest });
  lock = await open(`${path}.lock`, 'wx', 0o600);
  store = openStore(path);
  const listings = store.search({ source, status: 'Active', type, borough: 'NYC', offset }).listings.slice(0, limit);
  if (!listings.length) throw new Error('No matching demo listings to backfill');
  let next = client.properties(listings.map(listing => `KEY${listing.ListingId}`));
  const seen = new Set();
  let received = 0;
  do {
    if (seen.has(next)) throw new Error('Pagination cycle detected');
    seen.add(next);
    const page = await client.page(next);
    // Process immediately: signed URLs must not be persisted or queued for later use.
    for (const row of page.rows) {
      received++;
      const files = await media.replicate(row);
      store.apply(source, { rows: [row], next: null, media: new Map([[row.ListingKey, files]]) }, { checkpoint: false });
      console.log(JSON.stringify({ environment: 'demo', listing: row.ListingKey, photos: files.length, ...media.stats() }));
    }
    next = page.next;
  } while (next);
  if (!received) throw new Error('No matching demo records were returned by the feed');
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'An importer holds the database lock.' : error.message);
  process.exitCode = 1;
} finally {
  store?.close();
  if (lock) { await lock.close(); await unlink(`${path}.lock`); }
}
