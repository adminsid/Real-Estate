import { photoManifest } from './replica.mjs';

async function imageBytes(response) {
  if(!response.ok || !response.body)throw Error(`Media HTTP ${response.status}`);
  const reader=response.body.getReader(),chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>15*1024*1024)throw Error('Media size');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
  const type=bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'?'image/png':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null;
  if(!type)throw Error('Unsupported media');return {bytes,type};
}
export async function downloadPhotos(rows,env,beforeRequest,{fetcher=fetch,maxDownloads=12,now=()=>Date.now()}={}) {
  let attempted=0,ready=0,failed=0;
  const db=env.LIVE_DB,bucket=env.LIVE_MEDIA;
  for(const row of rows) {
    const source=row.OriginatingSystemName,id=row.ListingKey,manifest=await photoManifest(row);
    for(const entry of manifest) {
      if(attempted>=maxDownloads)return {attempted,ready,failed};
      const record=await db.prepare("SELECT m.state,m.attempted_at FROM listing_media m JOIN listings l ON l.source=m.source AND l.id=m.listing_id WHERE m.source=? AND m.listing_id=? AND m.media_key=? AND m.file=?").bind(source,id,entry.key,entry.file).first();
      if(!record || record.state==='ready' || record.state==='failed' && record.attempted_at>now()-3600000)continue;
      const media=row.Media.find(m=>m.MediaKey===entry.key);
      const claimed=await db.prepare("UPDATE listing_media SET state='downloading',attempted_at=?,failure=NULL WHERE source=? AND listing_id=? AND media_key=? AND file=? AND state IN ('pending','failed') AND EXISTS (SELECT 1 FROM listings WHERE source=? AND id=?)").bind(now(),source,id,entry.key,entry.file,source,id).run();
      if(!claimed.meta.changes)continue;
      attempted++;
      try {
        // Signed vendor URLs exist only in this invocation, never in D1, R2 metadata, HTML, or logs.
        if(typeof media.MediaURL!=='string' || media.MediaURL.length>8192)throw Error('Media URL');
        const url=new URL(media.MediaURL);
        if(url.protocol!=='https:' || url.hostname!=='media.mlsgrid.com' || url.username || url.password || url.port || url.hash)throw Error('Media host');
        await beforeRequest(15*1024*1024);
        let response=await fetcher(media.MediaURL,{headers:{'User-Agent':env.MLS_GRID_ACCESS_TOKEN},redirect:'manual',signal:AbortSignal.timeout(15000)});
        if([301,302,303,307,308].includes(response.status)) {
          const location=response.headers.get('Location');await response.body?.cancel();
          const target=new URL(location || '',url);
          if(!location || target.protocol!=='https:' || !/^mlsgrid\.[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(target.hostname) || target.username || target.password || target.port || target.hash)throw Error('Media redirect');
          await beforeRequest(15*1024*1024);
          response=await fetcher(target.href,{redirect:'manual',signal:AbortSignal.timeout(15000)});
        }
        const {bytes,type}=await imageBytes(response);
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
  }
  return {attempted,ready,failed};
}
