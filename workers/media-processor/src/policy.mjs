// This is a lifetime benchmark allowance, not a monthly allowance or inventory queue.
export const MAX_ATTEMPTS = 4;
export const DEADLINE_MS = 180000;
export const MAX_INPUT = 12 * 1024 * 1024;
export const MAX_RESPONSE = 16 * 1024 * 1024;
export const PROFILES = {thumb: 'image/webp', card: 'image/webp', display: 'image/webp', poster: 'image/webp', preview: 'video/mp4', playlist: 'application/vnd.apple.mpegurl', segment: 'video/mp2t'};
export function jobFromPath(path) {
  if (path === '/benchmark/video') return {id: 'synthetic-video-v1', kind: 'video', file: null};
  const match = path.match(/^\/benchmark\/image\/([a-f0-9]{64})$/);
  return match ? {id: `image-v1-${match[1]}`, kind: 'image', file: match[1]} : null;
}
export function outputKey(id, profile) { return `native-benchmark/v1/${id}/${profile}`; }
export async function boundedBytes(body, limit) {
  if (!body) throw Error('Missing response');
  const reader = body.getReader(), chunks = []; let length = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      length += value.byteLength; if (length > limit) throw Error('Media size limit exceeded');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export function decodeOutputs(result, kind) {
  const names = kind === 'image' ? ['thumb', 'card', 'display'] : ['poster', 'preview', 'playlist', 'segment'];
  if (!Array.isArray(result?.outputs) || result.outputs.length !== names.length) throw Error('Invalid processor output');
  const seen = new Set(); let size = 0;
  return result.outputs.map(output => {
    if (!names.includes(output.profile) || seen.has(output.profile) || typeof output.data !== 'string') throw Error('Invalid processor output');
    seen.add(output.profile);
    const bytes = Uint8Array.from(atob(output.data), char => char.charCodeAt(0));
    size += bytes.length;
    if (!bytes.length || bytes.length > 5 * 1024 * 1024 || size > 10 * 1024 * 1024) throw Error('Processor output too large');
    if (PROFILES[output.profile] === 'image/webp' && (new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' || new TextDecoder().decode(bytes.slice(8, 12)) !== 'WEBP')) throw Error('Invalid WebP output');
    return {profile: output.profile, bytes, type: PROFILES[output.profile]};
  });
}
// Upper estimate using provisioned basic instance resources for the entire interval.
// Not a bill: excludes Worker/DO/R2/registry usage, account allowances and tax.
export const estimatedComputeUSD = ms => ms / 1000 * (0.25 * 0.000020 + 1 * 0.0000025 + 4 * 0.00000007);
