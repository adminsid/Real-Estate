import { createServer } from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateInquiry } from './consumer.mjs';
import { DEFAULT_BRAND, validateBrand, brandCSS } from './brand.mjs';
import { publicOrigin, renderPage, embedDemo } from './pages.mjs';
export function createPreviewServer(store, databasePath, options = {}) {
  const assets = { '/listing-enrichment.mjs': ['listing-enrichment.mjs', 'text/javascript; charset=utf-8'], '/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'], '/consumer.mjs': ['consumer.mjs', 'text/javascript; charset=utf-8'], '/brand.mjs': ['brand.mjs', 'text/javascript; charset=utf-8'], '/brand-editor.mjs': ['brand-editor.mjs', 'text/javascript; charset=utf-8'], '/embed.mjs': ['embed.mjs', 'text/javascript; charset=utf-8'], '/embed-loader.js': ['embed-loader.js', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };
  for(const name of ['location-model.mjs', 'vendor/maplibre-4.7.1.js', 'vendor/maplibre-worker-4.7.1.js', 'vendor/maplibre-4.7.1.css', 'vendor/MAPLIBRE-LICENSE.txt','bottom-dock.mjs','bottom-dock.css','search-filters.mjs','discovery.mjs','search-map.mjs','nyc-boroughs.json','discovery.css','search-icon.svg'])assets['/'+name]=[name,(name.endsWith('.mjs')||name.endsWith('.js'))?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.txt')?'text/plain; charset=utf-8':'application/json'];
  const configuredOrigin = options.publicURL ? publicOrigin(options.publicURL) : null;
  const embedOrigins = (options.embedOrigins || []).map(publicOrigin);
  const brandPath = join(dirname(databasePath), 'brand.json');
  let brand = { ...DEFAULT_BRAND }, saveQueue = Promise.resolve();
  const ready = readFile(brandPath, 'utf8').then(value => { brand = validateBrand(JSON.parse(value)); }).catch(() => { /* First run or invalid local kit uses the readable default. */ });
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body)); };
    const url = new URL(request.url, 'http://127.0.0.1');
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(request.headers.host || '')) { send(403, { error: 'Local preview only' }); return; }
    const localOrigin = `http://${request.headers.host}`, origin = configuredOrigin || localOrigin;
    const frames = url.pathname === '/embed' ? ["'self'", ...embedOrigins].join(' ') : "'none'";
    response.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tiles.openfreemap.org; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; frame-src 'self'; object-src 'none'; frame-ancestors ${frames}; base-uri 'none'; form-action 'self'`);
    try {
      await ready;
      if (request.method === 'POST' && url.pathname === '/api/brand') {
        // This endpoint exists only on the loopback preview. Production needs an authenticated operator API.
        if (request.headers.origin !== localOrigin || request.headers['content-type']?.split(';')[0] !== 'application/json') { send(403, { error: 'Request origin or content type rejected' }); return; }
        let body = '', size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > 4096) { send(413, { error: 'Brand kit too large' }); return; } body += chunk; }
        let next;
        try { next = validateBrand(JSON.parse(body)); } catch (error) { send(400, { error: error.message }); return; }
        const save = saveQueue.then(async () => { await writeFile(brandPath + '.tmp', JSON.stringify(next, null, 2) + '\n'); await rename(brandPath + '.tmp', brandPath); brand = next; });
        saveQueue = save.catch(() => {});
        try { await save; send(200, { brand: next, demo: true }); } catch { send(500, { error: 'Could not save the brand kit. Your preview is still available.' }); }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/inquiries') {
        if (request.headers.origin !== `http://${request.headers.host}` || request.headers['content-type']?.split(';')[0] !== 'application/json') { send(403, { error: 'Request origin or content type rejected' }); return; }
        let body = '', size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > 16384) { send(413, { error: 'Message too large' }); return; } body += chunk; }
        let data; try { data = JSON.parse(body); } catch { send(400, { error: 'Invalid request' }); return; }
        const listing = store.listing(String(data.source || ''), String(data.id || ''));
        if (!listing) { send(404, { error: 'This listing is no longer available.' }); return; }
        if (data.kind === 'tour' && !['Active', 'Coming Soon', 'Active Under Contract'].includes(listing.StandardStatus)) { send(400, { error: 'Tour requests are unavailable for this listing status.' }); return; }
        let inquiry;
        try { inquiry = validateInquiry(data); }
        catch (error) { send(400, { error: error.message }); return; }
        const id = randomUUID();
        store.saveInquiry(id, listing.source, listing.id, inquiry);
        send(201, { id, demo: true, message: 'Demo request saved locally. No appointment has been scheduled and no message or email has been sent.' }); return;
      }
      if (request.method !== 'GET') { send(405, { error: 'Method not allowed' }); return; }
      if (url.pathname === '/api/brand') { send(200, { brand, demo: true }); return; }
      if (url.pathname === '/theme.css') {
        const draft = url.search ? validateBrand({ ...brand, ...Object.fromEntries(url.searchParams) }) : brand;
        response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' }); response.end(brandCSS(draft)); return;
      }
      if (url.pathname === '/embed-demo') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(embedDemo(brand, origin)); return; }
      const listingRoute = url.pathname.match(/^\/listing\/([^/]+)\/([^/]+)$/);
      if (url.pathname === '/' || url.pathname === '/embed' || listingRoute) {
        const template = await readFile(new URL('preview.html', import.meta.url), 'utf8');
        // Read eligibility after asynchronous file I/O, immediately before rendering the response.
        const listing = listingRoute ? store.listing(decodeURIComponent(listingRoute[1]), decodeURIComponent(listingRoute[2])) : null;
        const unavailable = Boolean(listingRoute && !listing);
        const results = listingRoute ? null : store.search({ borough: 'NYC', type: 'Residential', status: 'Active', ...Object.fromEntries(url.searchParams) });
        response.writeHead(unavailable ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(renderPage(template, { brand, origin, listing, unavailable, embedded: url.pathname === '/embed', results, embedOrigins: [localOrigin, ...embedOrigins] })); return;
      }
      const asset = assets[url.pathname];
      if (asset) { response.writeHead(200, { 'Content-Type': asset[1] }); response.end(await readFile(new URL(asset[0], import.meta.url))); return; }
      const mediaMatch = url.pathname.match(/^\/media\/([a-f0-9]{64})$/);
      if (mediaMatch) {
        const media = store.mediaFile(mediaMatch[1]);
        if (!media) { send(404, { error: 'Photo unavailable' }); return; }
        try {
          const variant = url.searchParams.get('variant');
          if (variant && !['card', 'thumb', 'display'].includes(variant)) { send(400, { error: 'Unknown image size' }); return; }
          let bytes, type = media.type, representation = 'original';
          if (variant) {
            try { bytes = await readFile(join(dirname(databasePath), 'media', 'optimized', `${media.file}-${variant}.webp`)); type = 'image/webp'; representation = variant; }
            catch { /* A newly imported photo can use its original until derivatives are built. */ }
          }
          bytes ??= await readFile(join(dirname(databasePath), 'media', media.file));
          if (!store.mediaFile(media.file)) { send(404, { error: 'Photo unavailable' }); return; }
          const etag = `"${media.file}-${representation}"`;
          response.setHeader('Cache-Control', 'private, no-cache'); response.setHeader('ETag', etag);
          if (request.headers['if-none-match'] === etag) { response.writeHead(304); response.end(); return; }
          response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.byteLength }); response.end(bytes);
        } catch { send(404, { error: 'Photo unavailable' }); }
        return;
      }
      if (url.pathname === '/api/search') { send(200, store.search(Object.fromEntries(url.searchParams))); return; }
      if (url.pathname === '/api/discovery') { send(200, store.discovery(Object.fromEntries(url.searchParams))); return; }
      const match = url.pathname.match(/^\/api\/listing\/([^/]+)\/([^/]+)$/);
      if (match) {
        const listing = store.listing(decodeURIComponent(match[1]), decodeURIComponent(match[2]));
        send(listing ? 200 : 404, listing ? { environment: 'demo', listing } : { error: 'This listing is no longer available.' }); return;
      }
      send(404, { error: 'Not found' });
    } catch { send(400, { error: 'Check your request and try again.' }); }
  });
}
