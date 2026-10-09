import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { publicProjection, createRequestPacer } from './client.mjs';

export function mediaIdentity(source, media) {
  return createHash('sha256').update(JSON.stringify([source, media.MediaKey, media.MediaModificationTimestamp || null])).digest('hex');
}

function imageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export function createMediaReplicator({ token, directory, source, fetcher = fetch, pause, beforeRequest = createRequestPacer(pause), maxDownloads = 400, maxBytes = 256 * 1024 * 1024 }) {
  if (!token || !directory || !source) throw new Error('Missing media replication configuration');
  if (!Number.isSafeInteger(maxDownloads) || maxDownloads < 1 || !Number.isSafeInteger(maxBytes) || maxBytes < 15 * 1024 * 1024) throw new Error('Invalid media download budget');
  let downloaded = 0;
  let reused = 0;
  let skipped = 0;
  let downloadedBytes = 0;
  return {
    stats: () => ({ downloaded, reused, skipped, downloadedBytes }),
    async replicate(row) {
      if (!publicProjection(row)) return [];
      if (row.OriginatingSystemName !== source) throw new Error('Media source mismatch');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const result = [];
      const seen = new Set();
      const entries = Array.isArray(row.Media) ? row.Media : [];
      for (const media of entries) {
        // Only explicitly public media may enter the anonymous gallery.
        const permissions = Array.isArray(media?.Permission) ? media.Permission : [media?.Permission];
        if (!media || typeof media.MediaKey !== 'string' || !media.MediaKey || !permissions.some(p => typeof p === 'string' && p.toLowerCase() === 'public') || permissions.some(p => typeof p === 'string' && p.toLowerCase() === 'private')) { skipped++; continue; }
        const file = mediaIdentity(source, media);
        if (seen.has(file)) continue;
        seen.add(file);
        let type;
        try {
          const bytes = await readFile(join(directory, file));
          type = imageType(bytes);
          if (!type) throw new Error('Stored media is not a supported image');
          reused++;
        } catch (error) {
          if (error.code !== 'ENOENT') throw new Error('Unable to read stored media');
          if (downloaded >= maxDownloads || downloadedBytes > maxBytes - 15 * 1024 * 1024) throw new Error('Media development budget reached; stored images retained for resume');
          let url;
          try { url = new URL(media.MediaURL); } catch { throw new Error('Invalid media URL'); }
          if (url.protocol !== 'https:' || url.hostname !== 'media-demo.mlsgrid.com' || url.username || url.password || url.port || url.hash) throw new Error('Rejected unsafe media host');
          // Never normalize the signed URL before transmitting it.
          await beforeRequest();
          let response;
          try {
            response = await fetcher(media.MediaURL, { headers: { 'User-Agent': token }, redirect: 'manual', signal: AbortSignal.timeout(30_000) });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
              const location = response.headers.get('location');
              await response.body?.cancel();
              const target = new URL(location || '', media.MediaURL);
              // Observed MLS Grid demo storage destination. Credentials never follow the redirect.
              if (!location || target.protocol !== 'https:' || target.hostname !== 'mlsgrid.f9ebe9654c02ab185d2bc1491ca042a5.r2.cloudflarestorage.com' || target.username || target.password || target.port || target.hash) throw new Error('Unsafe media redirect');
              response = await fetcher(location, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
            }
          }
          catch { throw new Error('Media connection failed; rerun to resume'); }
          if (!response.ok) throw new Error(`Media returned HTTP ${response.status}; rerun to resume`);
          if (!response.body) throw new Error('Empty media response');
          const reader = response.body.getReader();
          let size = 0;
          const chunks = [];
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 15 * 1024 * 1024) throw new Error('Media exceeds 15 MiB development limit');
              chunks.push(Buffer.from(value));
            }
          } finally { await reader.cancel(); }
          const bytes = Buffer.concat(chunks);
          downloadedBytes += bytes.byteLength;
          type = imageType(bytes);
          if (!type) { skipped++; continue; }
          await writeFile(join(directory, `${file}.pending`), bytes, { mode: 0o600 });
          await rename(join(directory, `${file}.pending`), join(directory, file));
          downloaded++;
        }
        result.push({ key: media.MediaKey, revision: media.MediaModificationTimestamp || null, file, type, order: Number.isFinite(media.Order) ? media.Order : result.length, caption: row.InternetAddressDisplayYN !== false && typeof media.ShortDescription === 'string' ? media.ShortDescription.slice(0, 500) : '' });
      }
      return result.sort((a, b) => a.order - b.order);
    },
  };
}
