import { refreshLocationInventory, refreshNYCLocations, geocodeListings } from './location-sync.mjs';
import { createClient } from '../../../scripts/mls-grid/client.mjs';
import { replica } from './replica.mjs';
import { downloadPhotos } from './live-media.mjs';
import { processEnrichment } from './enrichment.mjs';

export async function syncLive(env,{fetcher=fetch,pause,now=()=>Date.now(),maxPages=Math.min(6,Math.max(1,Number.parseInt(env.FEED_BATCH_PAGES,10)||1)),maxPhotos=Math.min(96,Math.max(1,Number.parseInt(env.MEDIA_BATCH_SIZE,10)||12))}={}) {
  if(env.LIVE_SYNC_ENABLED!=='true' || !env.MLS_GRID_ACCESS_TOKEN || !env.LIVE_DB || !env.LIVE_MEDIA)return {status:'disabled'};
  const repo=replica(env.LIVE_DB),lease=await repo.acquire(now());if(!lease)return {status:'busy_or_backoff'};
  const wait=pause || (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  let requestTurn=Promise.resolve();
  const beforeRequest=(bytes=32*1024*1024)=>{
   // Pipeline network/storage I/O, but serialize the shared source budget and dispatch slots.
   const reservation=requestTurn.then(async()=>{
    const requestedAt=now();
    await wait(Math.max(550,await repo.request(lease,requestedAt,bytes)));
    let settled=false;
    return async(actual)=>{
      if(settled)throw Error('Provider response already accounted');
      settled=true;
      await repo.settleBytes(lease,requestedAt,bytes,actual,now());
    };
   });
   requestTurn=reservation.then(()=>{},()=>{});
   return reservation;
  };
  const client=createClient({token:env.MLS_GRID_ACCESS_TOKEN,source:'onekey2',endpoint:'https://api.mlsgrid.com/v2',fetcher,beforeRequest,pageSize:100,maxResponseBytes:8*1024*1024});
  const onDemand=env.PHOTO_IMPORT_MODE==='on-demand',freshRows=[];
  let pages=0,records=0,photos=0,photoReady=0,photoBytes=0,demandProcessed=0,locations,feedFailure,cursorRecovered=false,stage='primary_feed';
  const start=now(),seen=new Set();
  const collect=result=>{photos+=result.attempted;photoReady+=result.ready;photoBytes+=result.bytes||0;};
  const photoOptions=limit=>({fetcher,maxDownloads:Math.max(0,Math.min(maxPhotos-photos,limit)),concurrency:Math.min(3,Math.max(1,Number.parseInt(env.MEDIA_CONCURRENCY,10)||1)),now,deadline:start+150000});
  const download=async(rows,limit=96,{coversOnly=false}={})=>{try{collect(await downloadPhotos(rows,env,beforeRequest,{...photoOptions(limit),coversOnly}));}catch(error){if(error.photoResult)collect(error.photoResult);throw error;}};
  const finish=async(result)=>{await env.LIVE_DB.prepare("UPDATE feed_state SET last_result=?,last_result_at=? WHERE source='onekey2' AND lease_id=? AND lease_until>?").bind(JSON.stringify(result),new Date(now()).toISOString(),lease,now()).run();return result;};
  try {
    let state=await repo.state();
    if((!state.initial_complete&&state.bootstrap_started&&now()-state.bootstrap_started>6*86400000)||(state.last_complete&&now()-Date.parse(state.last_complete)>6*86400000)){
      await repo.beginReconciliation(lease,now());state=await repo.state();
    }
    if(state.phase==='reconcile')return await finish({status:'reconciling',...await repo.pruneReconciliation(lease,now())});
    if(!onDemand&&env.LOCATION_REFRESH_ENABLED==='true'){
      try{await refreshNYCLocations(env,repo,client,lease,{now});await refreshLocationInventory(env,repo,client,lease,{now,maxPages:1});}catch(error){await env.LIVE_DB.prepare("UPDATE location_refresh SET failure=? WHERE id=1 AND EXISTS(SELECT 1 FROM feed_state WHERE source='onekey2' AND lease_id=? AND lease_until>?)").bind('Refresh paused; will retry within feed budget',lease,now()).run();throw error;}
      locations=await geocodeListings(env,lease,{fetcher,now});
    }
    stage='primary_feed';
    try{if(state.next_url || !state.initial_complete || !state.last_complete || now()-Date.parse(state.last_complete)>=(onDemand?60000:15*60000)) {
      let next=state.next_url || client.initial(state.watermark,{viewOnly:state.phase==='initial',marketOnly:state.phase==='initial'});
      while(next && pages<maxPages && now()-start<150000) {
        if(seen.has(next))throw Error('Repeated feed page');seen.add(next);
        let page;
        try{page=await client.page(next);}catch(error){
          const current=await repo.state(),progress=current.replay_watermark || current.watermark;
          if(error.providerReason!=='pagination_offset'||cursorRecovered||!progress||!new URL(next).searchParams.has('$skip'))throw error;
          // Replay one whole second before committed progress. This includes tied/sub-ms versions;
          // idempotent apply preserves facts/removals and the exact source watermark.
          const overlap=new Date(Math.floor(Date.parse(progress)/1000)*1000-1000).toISOString();
          page=await client.page(client.initial(overlap,{viewOnly:state.phase==='initial',marketOnly:state.phase==='initial'}));
          cursorRecovered=true;
        }
        if(page.rows.length>100)throw Error('Feed page exceeds production processing bound');
        // facts and permission removals commit before any slow or failed photo downloads.
        await repo.apply(page.rows,page.next,lease,now());pages++;records+=page.rows.length;next=page.next;
        if(onDemand)freshRows.push(...page.rows.slice(0,Math.max(0,100-freshRows.length)));
        else await download(page.rows,12);
      }
    }
    }catch(error){if(/^MLS Grid returned HTTP (400|404|410)/.test(error.message))feedFailure=error;else throw error;}
    if(onDemand&&maxPhotos>0){
      stage='requested_listing';
      // Reserve part of each pass for missing covers so demand cannot starve search thumbnails.
      const demandAllowance=()=>Math.max(0,maxPhotos-photos-Math.min(24,Math.floor(maxPhotos/4)));
      demandProcessed=await processEnrichment(env,repo,client,lease,rows=>download(rows,demandAllowance()),{now,deadline:start+120000,available:()=>demandAllowance()>0});
      stage='covers';await download(freshRows,maxPhotos,{coversOnly:true});
    }
    stage=onDemand?'covers':'photos';
    for(let batch=0;batch<8&&now()-start<150000&&photos<maxPhotos;batch++) {
      // Regenerate missing media URLs only after one hour. No signed URLs are persisted for retry.
      const missing=await env.LIVE_DB.prepare(`SELECT l.provider_id FROM listings l WHERE l.provider_id IS NOT NULL ${onDemand?'AND l.has_photos=0':''} AND EXISTS(SELECT 1 FROM listing_media m WHERE m.source=l.source AND m.listing_id=l.id AND m.state IN ('pending','failed','downloading') AND m.attempted_at<=?) ORDER BY CASE WHEN l.status='Active' AND l.borough IS NOT NULL THEN 0 WHEN l.status IN ('Active','Coming Soon','Active Under Contract') THEN 1 ELSE 2 END,l.has_photos,l.missing_date,l.on_market_date DESC,l.id LIMIT ?`).bind(now()-3600000,Math.min(50,maxPhotos-photos)).all();
      const ids=missing.results.map(row=>row.provider_id).filter(id=>/^[A-Za-z0-9_-]+$/.test(id));
      if(ids.length) {
        await env.LIVE_DB.prepare("UPDATE listing_media SET state='failed' WHERE state='downloading' AND attempted_at<=?").bind(now()-3600000).run();
        const page=await client.page(client.properties(ids));
        // Cool down missing source IDs too; stale/removed identifiers must not monopolize the queue.
        const absent=ids.filter(id=>!page.rows.some(row=>row.ListingId===id));
        if(absent.length)await env.LIVE_DB.prepare("UPDATE listing_media SET attempted_at=? WHERE source='onekey2' AND state IN ('pending','failed') AND listing_id IN (SELECT id FROM listings WHERE source='onekey2' AND provider_id IN (SELECT value FROM json_each(?))) AND EXISTS(SELECT 1 FROM feed_state WHERE source='onekey2' AND lease_id=? AND lease_until>?)").bind(now(),JSON.stringify(absent),lease,now()).run();
        // Backfill may reveal price/status/permission changes too; do not alter the replication watermark.
        await repo.apply(page.rows,null,lease,now(),false);
        await download(page.rows,maxPhotos,{coversOnly:onDemand});
      }else break;
    }
    if(feedFailure){stage='primary_feed';throw feedFailure;}
    if(onDemand&&env.LOCATION_REFRESH_ENABLED==='true'&&state.initial_complete&&now()-start<100000){
      stage='locations';
      await refreshNYCLocations(env,repo,client,lease,{now});await refreshLocationInventory(env,repo,client,lease,{now,maxPages:1});
      locations=await geocodeListings(env,lease,{fetcher,now});
    }
    return await finish({status:'ok',pages,records,photoAttempts:photos,photoReady,photoBytes,demandProcessed,cursorRecovered,locations,initialComplete:Boolean((await repo.state()).initial_complete)});
  } catch(error) {
    const reason=await repo.failure(lease,error,now());const messages=['MLS Grid connection failed','MLS Grid returned HTTP','Invalid MLS Grid JSON','Invalid MLS Grid page','Invalid MLS Grid record','Rejected unsafe','Invalid replication','Replication lease expired','Provider budget','Feed page exceeds','MLS Grid page exceeded'];
    const diagnostic=String(error.message).match(/^MLS Grid returned HTTP [0-9]{3}/)?.[0]||messages.find(message=>String(error.message).startsWith(message))||'internal_processing';
    return await finish({status:reason,diagnostic,providerReason:error.providerReason,stage,pages,records,photoAttempts:photos,photoReady,photoBytes,cursorRecovered,locations});
  } finally {await repo.release(lease);}
}
export async function feedReady(db,now=Date.now()) {
  const state=await db.prepare('SELECT initial_complete,last_complete,failure FROM feed_state WHERE source=?').bind('onekey2').first();
  const time=Date.parse(state?.last_complete);
  return Boolean(state?.initial_complete && Number.isFinite(time) && time<=now+60000 && now-time<=12*3600000 && state.failure!=='credentials');
}
