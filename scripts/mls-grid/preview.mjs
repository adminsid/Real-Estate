import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openStore } from './store.mjs';
import { createPreviewServer } from './preview-server.mjs';
const path = resolve(process.env.MLS_GRID_DB || '.mls-grid-demo/listings.sqlite');
await readFile(path);
const store = openStore(path);
const server = createPreviewServer(store, path, {
  publicURL: process.env.MLS_GRID_PUBLIC_URL,
  embedOrigins: process.env.MLS_GRID_EMBED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean),
});
server.listen(8137, '127.0.0.1', () => console.log('Prime America demo: http://127.0.0.1:8137'));
process.on('SIGINT', () => server.close(() => { store.close(); process.exit(0); }));
process.on('SIGTERM', () => server.close(() => { store.close(); process.exit(0); }));
