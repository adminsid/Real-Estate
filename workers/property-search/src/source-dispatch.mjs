// All provider traffic (including redirects and diagnostics) uses one subscription
// authority. Consumers never receive a stub or the credential.
export function sourceFetcher(env, kind, job = null) {
  if (!env.SOURCE_GATEWAY) throw Error('Source coordinator unavailable');
  const stub = env.SOURCE_GATEWAY.getByName('onekey2');
  return async (input, options = {}) => {
    const result = await stub.dispatch({url: String(input), kind, jobId: job?.id, token: job?.claim_token,
      mediaKey:options.sourceMedia?.key, mediaRevision:options.sourceMedia?.revision});
    if (result.error) {
      const error = Error(result.error);
      error.retryAt = result.retryAt;
      error.sourceFailure = true;
      throw error;
    }
    return new Response(result.body, {status: result.status, headers: result.headers});
  };
}

export const SOURCE_LIMITS = {hourRequests: 6000, dayRequests: 35000, hourBytes: 3000000000, dayBytes: 50000000000};
// More than a minute-by-minute 100-row poll, including recovery allowance. Never
// borrow these reserves for photos, even while the core queue happens to be idle.
export const CORE_RESERVE = {hourRequests: 600, dayRequests: 4000, hourBytes: 300000000, dayBytes: 4000000000};

export function approvedRequest(input, kind) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) throw Error('Rejected unsafe source URL');
  const rest = url.hostname === 'api.mlsgrid.com';
  if (rest) {
    if (!['/v2/Property', '/v2/Member'].includes(url.pathname) || !url.searchParams.get('$filter')?.includes("OriginatingSystemName eq 'onekey2'")) throw Error('Rejected unsafe source URL');
    if (!['core', 'gallery', 'cover', 'diagnostic'].includes(kind)) throw Error('Invalid source request class');
  } else if (!['gallery', 'cover'].includes(kind) || !(url.hostname === 'media.mlsgrid.com' || /^mlsgrid\.[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(url.hostname))) throw Error('Rejected unsafe source URL');
  return {url, rest, maximum: rest ? 8 * 1024 * 1024 : 15 * 1024 * 1024};
}

// Kept separate from the runtime class so real SQLite/stream/crash behavior is
// exercised without mocking Cloudflare's DurableObject base class.
export async function dispatchSource(env, input, {now = () => Date.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)), fetcher = fetch} = {}) {
  const {url, rest, maximum} = approvedRequest(input.url, input.kind), db = env.LIVE_DB;
  let control = await db.prepare("SELECT * FROM source_control WHERE source='onekey2'").first();
  if (control?.mode !== 'independent'||env.LIVE_SYNC_ENABLED==='false') return {error: 'Source coordinator is paused', retryAt: now() + 60000};
  const legacy=await db.prepare("SELECT retry_after FROM feed_state WHERE source='onekey2'").first();
  const backoff = Math.max(control.source_backoff_until,legacy?.retry_after||0,input.kind === 'core' ? 0 : control.media_backoff_until);
  if (backoff > now()) return {error: 'Source backoff active', retryAt: backoff};
  if (input.jobId) {
    const job = await db.prepare("SELECT id FROM ingestion_jobs WHERE id=? AND claim_token=? AND claim_until>? AND state='claimed'").bind(input.jobId, input.token, now()).first();
    if (!job) return {error: 'Source job claim expired', retryAt: now() + 60000};
  } else if (input.kind !== 'core' && input.kind !== 'diagnostic') throw Error('Source job claim required');
  if (!rest) {
    if (!input.mediaKey || !input.mediaRevision) throw Error('Media dispatch intent required');
    const media = await db.prepare(`SELECT m.file FROM listing_media m JOIN ingestion_jobs j ON j.source=m.source AND j.listing_id=m.listing_id
      JOIN listing_components c ON c.source=m.source AND c.listing_id=m.listing_id AND c.manifest_version=c.core_version
      WHERE j.id=? AND j.claim_token=? AND m.media_key=? AND m.file=? AND m.state='downloading'`)
      .bind(input.jobId, input.token, input.mediaKey, input.mediaRevision).first();
    if (!media) return {error:'Media revision no longer eligible', retryAt:now()+3600000};
  }
  // The DO calls this under a single network mutex. Record the actual next start
  // after sleeping, not a future permit which another caller could use too late.
  const unfinished = await db.prepare("SELECT MAX(created_at) AS last FROM source_attempts WHERE outcome='may_have_dispatched' AND created_at>?").bind(now() - 31000).first();
  await pause(Math.max(0, control.last_dispatch_at + 550 - now(), unfinished?.last ? unfinished.last + 31000 - now() : 0));
  const started = now(), hour = Math.floor(started / 3600000), id = crypto.randomUUID();
  const core = input.kind === 'core', reserve = core ? {hourRequests: 0, dayRequests: 0, hourBytes: 0, dayBytes: 0} : CORE_RESERVE;
  const allowed = `EXISTS(SELECT 1 FROM source_control WHERE source='onekey2' AND mode='independent'
    AND source_backoff_until<=? AND (?='core' OR media_backoff_until<=?))
    AND EXISTS(SELECT 1 FROM feed_state WHERE source='onekey2' AND retry_after<=?)
    ${input.jobId?"AND EXISTS(SELECT 1 FROM ingestion_jobs WHERE id=? AND claim_token=? AND claim_until>? AND state='claimed')":''}
    ${!rest?`AND EXISTS(SELECT 1 FROM listing_media m JOIN ingestion_jobs j ON j.source=m.source AND j.listing_id=m.listing_id
      JOIN listing_components c ON c.source=m.source AND c.listing_id=m.listing_id AND c.manifest_version=c.core_version
      WHERE j.id=? AND j.claim_token=? AND m.media_key=? AND m.file=? AND m.state='downloading')`:''}
    AND COALESCE((SELECT SUM(requests) FROM feed_budget WHERE hour>=?),0)<?
    AND COALESCE((SELECT SUM(requests) FROM feed_budget WHERE hour>=?),0)<?
    AND COALESCE((SELECT SUM(bytes) FROM feed_budget WHERE hour>=?),0)+?<=?
    AND COALESCE((SELECT SUM(bytes) FROM feed_budget WHERE hour>=?),0)+?<=?`;
  const limits = [started,input.kind,started,started,...(input.jobId?[input.jobId,input.token,started]:[]),...(!rest?[input.jobId,input.token,input.mediaKey,input.mediaRevision]:[]),hour - 1, SOURCE_LIMITS.hourRequests - reserve.hourRequests, hour - 24, SOURCE_LIMITS.dayRequests - reserve.dayRequests,
    hour - 1, maximum, SOURCE_LIMITS.hourBytes - reserve.hourBytes, hour - 24, maximum, SOURCE_LIMITS.dayBytes - reserve.dayBytes];
  const result = await db.batch([
    db.prepare(`INSERT INTO source_attempts(id,kind,job_id,media_key,media_revision,created_at,reserved_bytes) SELECT ?,?,?,?,?,?,? WHERE ${allowed}`).bind(id, input.kind, input.jobId || null, input.mediaKey || null, input.mediaRevision || null, started, maximum, ...limits),
    db.prepare(`INSERT INTO feed_budget(hour,requests,bytes) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM source_attempts WHERE id=?)
      ON CONFLICT(hour) DO UPDATE SET requests=requests+1,bytes=feed_budget.bytes+excluded.bytes`).bind(hour, maximum, id),
    db.prepare("UPDATE source_control SET last_dispatch_at=? WHERE source='onekey2' AND EXISTS(SELECT 1 FROM source_attempts WHERE id=?)").bind(started, id),
  ]);
  if (!result[0].meta.changes) return {error: 'Provider budget unavailable', retryAt: started + 60000};
  const headers = rest ? {Authorization: `Bearer ${env.MLS_GRID_ACCESS_TOKEN}`, Accept: 'application/json', 'Accept-Encoding': 'gzip,deflate'} : url.hostname === 'media.mlsgrid.com' ? {'User-Agent': env.MLS_GRID_ACCESS_TOKEN} : {};
  try {
    const response = await fetcher(url.href, {headers, redirect: 'manual', signal: AbortSignal.timeout(rest ? 30000 : 15000)});
    const reader = response.body?.getReader(), chunks = []; let size = 0;
    try {
      if (reader) while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength; if (size > maximum) throw Error('Source response exceeded size limit');
        chunks.push(value);
      }
    } finally { await reader?.cancel(); }
    const actual = Math.max(size, Number(response.headers.get('Content-Length')) || 0);
    if (actual > maximum) throw Error('Source response exceeded size limit');
    await db.batch([
      db.prepare("UPDATE source_attempts SET completed_at=?,actual_bytes=?,status=?,outcome='completed' WHERE id=? AND outcome='may_have_dispatched'").bind(now(), actual, response.status, id),
      db.prepare('UPDATE feed_budget SET bytes=bytes-? WHERE hour=? AND bytes>=?').bind(maximum - actual, hour, maximum - actual),
    ]);
    if (rest && [401,403].includes(response.status)) await db.prepare("UPDATE source_control SET source_backoff_until=?,source_failure='credentials' WHERE source='onekey2'").bind(now() + 3600000).run();
    else if(rest&&response.ok)await db.prepare("UPDATE source_control SET source_failure=NULL WHERE source='onekey2'").run();
    // Unknown 429 scope is conservatively source-wide. A single media 403 is not
    // a REST credential rejection and cannot change feed_state.failure.
    const retryHeader = response.headers.get('Retry-After');
    const retryAt = retryHeader && /^\d+$/.test(retryHeader) ? now() + Number(retryHeader) * 1000 : Date.parse(retryHeader || '') || 0;
    if (response.status === 429) await db.prepare("UPDATE source_control SET source_backoff_until=?,media_failure='rate_limit_scope_unconfirmed' WHERE source='onekey2'").bind(Math.max(now() + 900000, retryAt)).run();
    else if (!rest && !response.ok && ![301,302,303,307,308].includes(response.status)) await db.prepare("UPDATE source_control SET media_failure=? WHERE source='onekey2'").bind('media_http_' + response.status).run();
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return {status: response.status, headers: Object.fromEntries([...response.headers].filter(([key]) => ['content-type','location'].includes(key))), body: bytes.buffer};
  } catch {
    // Retain the reservation and unknown intent on incomplete network outcomes.
    return {error: 'Source transfer outcome uncertain', retryAt: now() + 3600000};
  }
}
