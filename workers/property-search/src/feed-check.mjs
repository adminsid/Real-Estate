// A bounded operator check, not an importer. No listing payloads or media URLs are retained.
const endpoint = 'https://api.mlsgrid.com/v2';
const source = 'onekey2';

async function readJSON(response) {
  if (!response.body) throw Error('Empty response');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw Error('Response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function checkFeed(env, fetcher = fetch) {
  const base = {endpoint, source, checkedAt: new Date().toISOString(), synchronizationEnabled: env.LIVE_SYNC_ENABLED==='true', publication: env.DATASET==='live'?'private_live_review':'synthetic'};
  const result = (state, message, extra = {}) => ({...base, state, message, ...extra});
  const token = env.MLS_GRID_ACCESS_TOKEN;
  if (typeof token !== 'string' || !token.trim()) return result('not_configured', 'The MLS GRID secret is not configured.');
  const url = new URL(`${endpoint}/Property`);
  url.searchParams.set('$filter', `OriginatingSystemName eq '${source}' and MlgCanView eq true`);
  url.searchParams.set('$select', 'OriginatingSystemName,MlgCanView,MlgCanUse');
  url.searchParams.set('$top', '1');
  let response;
  try {
    response = await fetcher(url.href, {
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/json', 'Accept-Encoding': 'gzip,deflate'},
      redirect: 'manual', signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
  } catch { return result('connection_failed', 'The production API could not be reached. No retry was attempted.'); }
  if (!response.ok) {
    try { await response.body?.cancel(); } catch { /* Discard the upstream error body. */ }
    if (response.status === 401) return result('authentication_failed', 'MLS GRID rejected the token.', {upstreamStatus: 401});
    if (response.status === 403) return result('access_denied', 'MLS GRID denied this OneKey request. Check the subscription and source permissions.', {upstreamStatus: 403});
    if (response.status === 429) return result('rate_limited', 'MLS GRID has rate-limited this request. Check provider usage before trying again.', {upstreamStatus: 429});
    return result('upstream_error', 'The production API returned an unexpected status. No redirect or retry was followed.', {upstreamStatus: response.status});
  }
  let data;
  try { data = await readJSON(response); } catch { return result('invalid_response', 'The API response was empty, oversized, or invalid JSON.'); }
  if (!data || !Array.isArray(data.value) || data.value.length > 1 || data.value.some(row => !row || row.OriginatingSystemName !== source || row.MlgCanView !== true || !Array.isArray(row.MlgCanUse) || row.MlgCanUse.some(use => typeof use !== 'string'))) {
    return result('invalid_response', 'The API response did not match the requested OneKey permission fields.');
  }
  if (!data.value.length) return result('connected_empty', 'The production request was accepted, but no viewable OneKey record was returned. Inventory and IDX permission are not confirmed.', {upstreamStatus: response.status, sampledRecords: 0});
  const sampleAllowsIdx = data.value[0].MlgCanUse.some(use => use.toLowerCase() === 'idx');
  return result('connected', sampleAllowsIdx ? 'Production access verified. The sampled OneKey record permits IDX use.' : 'Production access verified. The sampled OneKey record does not permit IDX use.', {upstreamStatus: response.status, sampledRecords: 1, sampleAllowsIdx});
}

const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export async function checkMemberFeed(env,fetcher=fetch){
  const base={endpoint,source,resource:'Member',checkedAt:new Date().toISOString()};
  const result=(state,message,extra={})=>({...base,state,message,...extra});
  if(typeof env.MLS_GRID_ACCESS_TOKEN!=='string'||!env.MLS_GRID_ACCESS_TOKEN.trim())return result('not_configured','The MLS GRID secret is not configured.');
  const url=new URL(endpoint+'/Member');
  url.searchParams.set('$filter',`OriginatingSystemName eq '${source}' and MlgCanView eq true`);
  url.searchParams.set('$expand','Media');url.searchParams.set('$top','10');
  let response;
  try{response=await fetcher(url.href,{headers:{Authorization:`Bearer ${env.MLS_GRID_ACCESS_TOKEN}`,Accept:'application/json','Accept-Encoding':'gzip,deflate'},redirect:'manual',signal:AbortSignal.timeout(15000),cache:'no-store'});}catch{return result('connection_failed','The Member API could not be reached.');}
  if(!response.ok){
    let providerFlags;
    if(response.status===400){try{const body=await readJSON(response),message=typeof body?.error?.message==='string'?body.error.message.toLowerCase():'';providerFlags={mentionsSelect:message.includes('select'),mentionsExpand:message.includes('expand'),mentionsMember:message.includes('member'),mentionsPermission:message.includes('permission')||message.includes('access'),mentionsUnsupported:message.includes('not support')||message.includes('not available')};}catch{/* Never echo upstream details. */}}
    else{try{await response.body?.cancel();}catch{/* Discard upstream details. */}}
    return result(response.status===401?'authentication_failed':response.status===403?'access_denied':response.status===429?'rate_limited':'upstream_error','Member request returned HTTP '+response.status+'. No retry or redirect was followed.',{upstreamStatus:response.status,...(providerFlags?{providerFlags}: {})});
  }
  let data;try{data=await readJSON(response);}catch{return result('invalid_response','Member response was empty, oversized or invalid JSON.');}
  if(!data||!Array.isArray(data.value)||data.value.length>10||data.value.some(row=>!row||row.OriginatingSystemName!==source||row.MlgCanView!==true||(row.Media!==undefined&&!Array.isArray(row.Media))))return result('invalid_response','Member response did not match the bounded OneKey sample.');
  const rows=data.value;let membersWithMedia=0,publicMediaEntries=0,membersWithPublicMedia=0,membersAllowingIdx=0,membersWithIdentifiers=0;
  for(const row of rows){
    if(typeof row.MemberKey==='string'||typeof row.MemberMlsId==='string')membersWithIdentifiers++;
    const idx=Array.isArray(row.MlgCanUse)&&row.MlgCanUse.some(value=>typeof value==='string'&&value.toLowerCase()==='idx');if(idx)membersAllowingIdx++;
    const media=row.Media||[];if(media.length)membersWithMedia++;
    let permitted=0;
    for(const entry of media){
      const permissions=Array.isArray(entry?.Permission)?entry.Permission:[entry?.Permission];
      if(!idx||!permissions.some(value=>['public','idx'].includes(String(value).toLowerCase()))||permissions.some(value=>String(value).toLowerCase()==='private')||typeof entry?.MediaURL!=='string')continue;
      try{const url=new URL(entry.MediaURL);if(url.protocol==='https:'&&url.hostname==='media.mlsgrid.com'&&!url.username&&!url.password&&!url.port&&!url.hash)permitted++;}catch{/* Count only well-formed source media links. */}
    }
    publicMediaEntries+=permitted;if(permitted)membersWithPublicMedia++;
  }
  return result(rows.length?'connected':'connected_empty',rows.length?'OneKey Member access verified. Counts describe this sample only; image files were not downloaded.':'Member request accepted, but the sample was empty.',{upstreamStatus:response.status,sampledMembers:rows.length,membersWithIdentifiers,membersAllowingIdx,membersWithMedia,membersWithPublicMedia,publicMediaEntries});
}
export function memberFeedPage(env,result=null){
  const fields=['state','checkedAt','upstreamStatus','sampledMembers','membersWithIdentifiers','membersAllowingIdx','membersWithMedia','membersWithPublicMedia','publicMediaEntries'];
  const summary=result?'<section><h2>Member check result</h2><p>'+escapeHTML(result.message)+'</p><dl>'+fields.filter(key=>result[key]!==undefined).map(key=>'<dt>'+escapeHTML(key)+'</dt><dd>'+escapeHTML(result[key])+'</dd>').join('')+'</dl>'+(result.providerFlags?'<p>Provider diagnostic flags: '+escapeHTML(JSON.stringify(result.providerFlags))+'</p>':'')+'</section>':'';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OneKey Member feed check</title><link rel="stylesheet" href="/style.css"></head><body><main class="search-page"><p><a href="/ops/mls-sync">Import admin</a></p><h1>OneKey Member feed check</h1><p>Owner-only diagnostic. One request, up to 10 viewable members, with expanded media metadata. No names, contact details, identifiers or signed media links are shown or retained. An empty photo sample does not establish that the whole feed has no photos.</p>'+summary+'<form method="post" action="/ops/mls-members"><button type="submit" '+(!env.MLS_GRID_ACCESS_TOKEN?'disabled':'')+'>Check Member feed</button></form></main></body></html>';
}
export function feedPage(env, result = null) {
  const configured = typeof env.MLS_GRID_ACCESS_TOKEN === 'string' && Boolean(env.MLS_GRID_ACCESS_TOKEN.trim());
  const status = result ? `<section aria-live="polite"><h2>Connection result</h2><p><strong>${escapeHTML(result.message)}</strong></p><p>State: ${escapeHTML(result.state)} · Checked: ${escapeHTML(result.checkedAt)}</p>${result.upstreamStatus ? `<p>API status: ${result.upstreamStatus}</p>` : ''}</section>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>OneKey feed connection · Private operations</title><link rel="stylesheet" href="/style.css"></head><body><main class="search-page"><p><a href="/">Back to search</a></p><h1>OneKey feed connection</h1><p>Private operations · Owner access only</p><dl><dt>Credential</dt><dd>${configured ? 'Stored in Cloudflare as a secret' : 'Not configured'}</dd><dt>Production API</dt><dd>${endpoint}</dd><dt>Source</dt><dd>OneKey MLS (${source})</dd><dt>Search inventory</dt><dd>${env.DATASET==='live'?'Live OneKey inventory · private review':'Fictional staging listings'}</dd><dt>Live synchronization</dt><dd>${env.LIVE_SYNC_ENABLED==='true'?'Enabled':'Not enabled'}</dd></dl>${status}<form method="post" action="/ops/mls-grid"><button type="submit" ${configured ? '' : 'disabled'}>Check production connection</button></form><p>This sends one request for one record’s permission fields. It does not follow pagination, download pictures, store listings, or change search results. A sampled IDX permission does not establish complete inventory coverage or public display approval.</p><h2>Synchronization status</h2><p>Enabled means the schedule is configured. It does not mean inventory reconciliation is complete or the public site is ready.</p><p><a href="/ops/mls-sync">View live import progress and health</a> · <a href="/ops/mls-members">Check Member feed</a></p></main></body></html>`;
}
