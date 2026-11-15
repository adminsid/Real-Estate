import {escapeHTML} from '../../../scripts/mls-grid/pages.mjs';
export async function mediaProcessing(request, env) {
  if (!env.MEDIA_PROCESSOR) return new Response('Private media processor is not configured.', {status: 503});
  const url = new URL(request.url), base = '/ops/media-processing';
  const route = url.pathname.slice(base.length) || '/';
  if (route !== '/') {
    if (!(/^\/result\/[a-z0-9-]+\/(thumb|card|display|poster|preview|playlist|segment)$/.test(route) && request.method === 'GET') && !(route === '/status' && request.method === 'GET')) return new Response('Not found', {status: 404});
    return env.MEDIA_PROCESSOR.fetch(new Request('https://processor' + route));
  }
  let result = null;
  if (request.method === 'POST') {
    const kind = url.searchParams.get('kind'), file = url.searchParams.get('file');
    if (kind !== 'video' && !(kind === 'image' && /^[a-f0-9]{64}$/.test(file || ''))) return Response.json({error: 'Choose a valid benchmark'}, {status: 400});
    const response = await env.MEDIA_PROCESSOR.fetch('https://processor/benchmark/' + (kind === 'video' ? 'video' : 'image/' + file), {method: 'POST'});
    result = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : {error: 'Benchmark could not start. The source may no longer be available.', status: response.status};
  }
  const response = await env.MEDIA_PROCESSOR.fetch('https://processor/status');
  if (!response.ok) return new Response('Processor status unavailable', {status: 503});
  const snapshot = await response.json();
  const sample = await env.LIVE_DB.prepare("SELECT m.file FROM listing_media m JOIN listings l ON l.source=m.source AND l.id=m.listing_id JOIN listing_components c ON c.source=l.source AND c.listing_id=l.id WHERE m.state='ready' AND c.manifest_version=c.core_version AND l.status='Active' LIMIT 1").first();
  const jobs = snapshot.jobs.map(job => `<article><h2>${job.kind === 'image' ? 'Listing photo' : 'Generated video'} · ${escapeHTML(job.state)}</h2><p>${job.elapsed ?? 0} ms · ${job.input_bytes ?? 0} bytes in · ${job.output_bytes ?? 0} bytes saved</p>${job.state === 'ready' ? (job.kind === 'image' ? `<img alt="Processed listing photo" src="${base}/result/${job.id}/display" width="720">` : `<video controls preload="metadata" poster="${base}/result/${job.id}/poster" src="${base}/result/${job.id}/preview"></video><p><a href="${base}/result/${job.id}/playlist">HLS playlist</a></p>`) : ''}</article>`).join('');
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private media benchmark</title><link rel="stylesheet" href="/ops/mls-sync.css"><main><h1>Media processing test</h1><p>Private Cloudflare container · imgproxy + FFmpeg · saved in R2</p><p>Paid Images and Stream stay off. Inventory processing stays off.</p><p>${snapshot.jobs.length} of ${snapshot.maximumAttempts} lifetime attempts used. One container, ${snapshot.deadlineSeconds} seconds maximum per attempt. Failed attempts count. No automatic retries or monthly reset.</p>${snapshot.paused ? '<p>Benchmark paused after an interruption. Engineering must investigate before more processing can run.</p>' : ''}<p>Maximum estimated container compute for all attempts: $${snapshot.computeUpperEstimateUSD.toFixed(4)} before allowances. Other Worker, database, storage, build and registry costs are separate. This is an estimate, not a bill.</p>${sample ? `<form method="post" action="${base}?kind=image&amp;file=${sample.file}"><button>Test one listing photo</button></form>` : '<p>No eligible photo available.</p>'}<form method="post" action="${base}?kind=video"><button>Test a generated 3-second video</button></form><p><a href="${base}">Refresh results</a> · <a href="/ops/mls-sync">Import progress</a></p>${result ? `<pre>${escapeHTML(JSON.stringify(result, null, 2))}</pre>` : ''}${jobs}</main></html>`, {headers: {'Content-Type': 'text/html; charset=utf-8'}});
}
