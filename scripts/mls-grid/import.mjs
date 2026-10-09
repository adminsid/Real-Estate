import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createClient, createRequestPacer, publicProjection } from './client.mjs';
import { openStore } from './store.mjs';
import { createMediaReplicator } from './media.mjs';

const path = resolve(process.env.MLS_GRID_DB || '.mls-grid-demo/listings.sqlite');
const source = process.env.MLS_GRID_SOURCE || 'onekey2';
const maxPages = Number(process.env.MLS_GRID_MAX_PAGES || '5');
let lock;
let store;
try {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('Max pages must be between 1 and 100');
  const beforeRequest = createRequestPacer();
  const client = createClient({ token: process.env.MLS_GRID_ACCESS_TOKEN, source, beforeRequest });
  const media = createMediaReplicator({ token: process.env.MLS_GRID_ACCESS_TOKEN, source, directory: join(dirname(path), 'media'), beforeRequest });
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  lock = await open(`${path}.lock`, 'wx', 0o600);
  store = openStore(path);
  const checkpoint = store.checkpoint(source);
  let next = checkpoint?.next_url || client.initial(checkpoint?.timestamp);
  const visited = new Set();
  let pages = 0;
  let received = 0;
  do {
    if (visited.has(next)) throw new Error('Pagination cycle detected');
    visited.add(next);
    const page = await client.page(next);
    // Revocations take effect even if a later image download fails; the feed cursor stays put.
    store.apply(source, { rows: page.rows.filter(row => !publicProjection(row)), next: null }, { checkpoint: false });
    page.media = new Map();
    for (const row of page.rows) page.media.set(row.ListingKey, await media.replicate(row));
    const result = store.apply(source, page);
    received += result.received;
    console.log(JSON.stringify({ environment: 'demo', source, page: ++pages, ...result, media: media.stats() }));
    next = page.next;
  } while (next && pages < maxPages);
  console.log(JSON.stringify({ complete: !next, pages, received, searchable: store.search({ source }).total, message: next ? 'Page budget reached. Rerun to resume.' : 'Import complete. Rerun for incremental changes.' }));
} catch (error) {
  // Never print upstream response bodies, headers, request objects, or stack traces.
  console.error(error?.code === 'EEXIST' ? 'Another importer holds the database lock. Check the process before removing a stale lock.' : (error instanceof TypeError ? 'Connection failed; checkpoint retained.' : error.message));
  process.exitCode = 1;
} finally {
  store?.close();
  if (lock) { await lock.close(); await unlink(`${path}.lock`); }
}
