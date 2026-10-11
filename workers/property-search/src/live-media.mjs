import { photoManifest } from './replica.mjs';

const MAX_MEDIA_BYTES=15*1024*1024;
async function responseBytes(response,settle) {
  const chunks=[];let size=0;
  if(response.body) {
    const reader=response.body.getReader();
    try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_MEDIA_BYTES)throw Error('Media size');chunks.push(value);}}finally{await reader.cancel();}
  }
  // Only a completely consumed bounded response can release its unused reservation.
  // Keep the larger wire length for compressed responses; failed streams retain the maximum.
  if(typeof settle==='function')await settle(Math.max(size,Number(response.headers.get('Content-Length')) || 0));
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}
async function imageBytes(response,settle) {
  let bytes;
  try {bytes=await responseBytes(response,settle);}catch(error){
    // A failed error body must not hide credential rejection or provider throttling.
    if(!response.ok)throw Error(`Media HTTP ${response.status}`);
    throw error;
  }
  if(!response.ok)throw Error(`Media HTTP ${response.status}`);
  const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
  const type=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
  if(!type)throw Error('Unsupported media');return {bytes,type};
}
export async function downloadPhotos(rows,env,beforeRequest,{fetcher=fetch,maxDownloads=12,now=()=>Date.now(),deadline=Infinity}={}) {
  let attempted=0,ready=0,failed=0;
  const db=env.LIVE_DB,bucket=env.LIVE_MEDIA;
  if(!rows.length || maxDownloads<=0)return {attempted,ready,failed};
  // Do not hash media or perform per-photo D1 reads for discarded source listings.
  const candidates=await db.prepare('SELECT source,id,has_photos FROM listings WHERE source=? AND id IN (SELECT value FROM json_each(?))').bind('onekey2',JSON.stringify(rows.map(row=>row.ListingKey))).all();
  const eligible=new Map(candidates.results.map(row=>[JSON.stringify([row.source,row.id]),row.has_photos]));
  if(!eligible.size)return {attempted,ready,failed};
  const states=await db.prepare('SELECT source,listing_id,media_key,file,state,attempted_at FROM listing_media WHERE source=? AND listing_id IN (SELECT value FROM json_each(?))').bind('onekey2',JSON.stringify(candidates.results.map(row=>row.id))).all();
  const mediaStates=new Map(states.results.map(record=>[JSON.stringify([record.source,record.listing_id,record.media_key,record.file]),record]));
  const jobs=[];
  for(const row of rows) {
    const identity=JSON.stringify([row.OriginatingSystemName,row.ListingKey]);
    if(!eligible.has(identity))continue;
    const manifest=(await photoManifest(row)).sort((a,b)=>a.position-b.position || a.key.localeCompare(b.key));
    let round=0;
    for(const entry of manifest) {
      const record=mediaStates.get(JSON.stringify([row.OriginatingSystemName,row.ListingKey,entry.key,entry.file]));
      if(!record || !['pending','failed'].includes(record.state) || record.state==='failed' && record.attempted_at>now()-3600000)continue;
      jobs.push({row,entry,round:round++,hasPhotos:eligible.get(identity)});
    }
  }
  // Give every candidate its first missing photo before returning for another gallery image.
  // Within each round, listings without a usable cover go first.
  jobs.sort((a,b)=>a.round-b.round || a.hasPhotos-b.hasPhotos);
  for(const {row,entry} of jobs) {
      if(attempted>=maxDownloads || now()>=deadline)break;
      const source=row.OriginatingSystemName,id=row.ListingKey;
      const media=row.Media.find(m=>m.MediaKey===entry.key);
      const claimed=await db.prepare("UPDATE listing_media SET state='downloading',attempted_at=?,failure=NULL WHERE source=? AND listing_id=? AND media_key=? AND file=? AND state IN ('pending','failed') AND EXISTS (SELECT 1 FROM listings WHERE source=? AND id=?)").bind(now(),source,id,entry.key,entry.file,source,id).run();
      if(!claimed.meta.changes)continue;
      attempted++;
      try {
        // Signed vendor URLs exist only in this invocation, never in D1, R2 metadata, HTML, or logs.
        if(typeof media.MediaURL!=='string' || media.MediaURL.length>8192)throw Error('Media URL');
        const url=new URL(media.MediaURL);
        if(url.protocol!=='https:' || url.hostname!=='media.mlsgrid.com' || url.username || url.password || url.port || url.hash)throw Error('Media host');
        let settle=await beforeRequest(MAX_MEDIA_BYTES);
        let response=await fetcher(media.MediaURL,{headers:{'User-Agent':env.MLS_GRID_ACCESS_TOKEN},redirect:'manual',signal:AbortSignal.timeout(15000)});
        if([301,302,303,307,308].includes(response.status)) {
          const location=response.headers.get('Location');await responseBytes(response,settle);
          const target=new URL(location || '',url);
          if(!location || target.protocol!=='https:' || !/^mlsgrid\.[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(target.hostname) || target.username || target.password || target.port || target.hash)throw Error('Media redirect');
          settle=await beforeRequest(MAX_MEDIA_BYTES);
          response=await fetcher(target.href,{redirect:'manual',signal:AbortSignal.timeout(15000)});
        }
        const {bytes,type}=await imageBytes(response,settle);
        await bucket.put(entry.file,bytes,{httpMetadata:{contentType:type}});
        // A revoked/replaced manifest can never be resurrected by a finishing download.
        await db.batch([
          db.prepare("UPDATE listing_media SET state='ready',type=?,failure=NULL WHERE source=? AND listing_id=? AND media_key=? AND file=? AND state='downloading' AND EXISTS (SELECT 1 FROM listings WHERE source=? AND id=?)").bind(type,source,id,entry.key,entry.file,source,id),
          db.prepare("UPDATE listings SET has_photos=EXISTS(SELECT 1 FROM listing_media WHERE source=? AND listing_id=? AND state='ready') WHERE source=? AND id=?").bind(source,id,source,id),
        ]);
        ready++;
      } catch(error) {
        failed++;
        await db.prepare("UPDATE listing_media SET state='failed',failure='download_unavailable' WHERE source=? AND listing_id=? AND media_key=? AND file=? AND state='downloading'").bind(source,id,entry.key,entry.file).run();
        if(/HTTP (401|403|429)/.test(error.message) || /budget/.test(error.message))throw Error(error.message.includes('budget')?'Provider budget unavailable':`MLS Grid returned ${error.message.match(/HTTP \d{3}/)[0]}; checkpoint retained`);
      }
  }
  return {attempted,ready,failed};
}
