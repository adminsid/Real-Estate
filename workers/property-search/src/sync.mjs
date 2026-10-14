import { refreshLocationInventory, refreshNYCLocations, geocodeListings } from './location-sync.mjs';
import { createClient } from '../../../scripts/mls-grid/client.mjs';
import { replica } from './replica.mjs';
import { downloadPhotos } from './live-media.mjs';

export async function syncLive(env,{fetcher=fetch,pause,now=()=>Date.now(),maxPages=1,maxPhotos=env.MEDIA_BATCH_SIZE==='48'?48:12}={}) {
  if(env.LIVE_SYNC_ENABLED!=='true' || !env.MLS_GRID_ACCESS_TOKEN || !env.LIVE_DB || !env.LIVE_MEDIA)return {status:'disabled'};
  const repo=replica(env.LIVE_DB),lease=await repo.acquire(now());if(!lease)return {status:'busy_or_backoff'};
  const wait=pause || (ms=>new Promise(resolve=>setTimeout(resolve,ms)));
  const beforeRequest=async(bytes=32*1024*1024)=>{
    const requestedAt=now();
    await wait(Math.max(550,await repo.request(lease,requestedAt,bytes)));
    let settled=false;
    return async(actual)=>{
      if(settled)throw Error('Provider response already accounted');
      settled=true;
      await repo.settleBytes(lease,requestedAt,bytes,actual,now());
    };
  };
  const client=createClient({token:env.MLS_GRID_ACCESS_TOKEN,source:'onekey2',endpoint:'https://api.mlsgrid.com/v2',fetcher,beforeRequest,pageSize:100,maxResponseBytes:8*1024*1024});
  let pages=0,records=0,photos=0,locations,feedFailure,stage='locations';
  const start=now(),seen=new Set();
  const finish=async(result)=>{await env.LIVE_DB.prepare("UPDATE feed_state SET last_result=?,last_result_at=? WHERE source='onekey2' AND lease_id=? AND lease_until>?").bind(JSON.stringify(result),new Date(now()).toISOString(),lease,now()).run();return result;};
  try {
    const state=await repo.state();
    if(!state.initial_complete && state.bootstrap_started && now()-state.bootstrap_started>6*86400000)return await finish({status:'reconciliation_required'});
    if(state.last_complete && now()-Date.parse(state.last_complete)>6*86400000)return await finish({status:'reconciliation_required'});
    if(env.LOCATION_REFRESH_ENABLED==='true'){
      try{await refreshNYCLocations(env,repo,client,lease,{now});await refreshLocationInventory(env,repo,client,lease,{now,maxPages:1});}catch(error){await env.LIVE_DB.prepare("UPDATE location_refresh SET failure=? WHERE id=1 AND EXISTS(SELECT 1 FROM feed_state WHERE source='onekey2' AND lease_id=? AND lease_until>?)").bind('Refresh paused; will retry within feed budget',lease,now()).run();throw error;}
      locations=await geocodeListings(env,lease,{fetcher,now});
    }
    stage='primary_feed';
    try{if(state.next_url || !state.initial_complete || !state.last_complete || now()-Date.parse(state.last_complete)>=15*60000) {
      let next=state.next_url || client.initial(state.watermark,{viewOnly:state.phase==='initial',marketOnly:state.phase==='initial'});
      while(next && pages<maxPages && now()-start<150000) {
        if(seen.has(next))throw Error('Repeated feed page');seen.add(next);
        const page=await client.page(next);
        if(page.rows.length>100)throw Error('Feed page exceeds production processing bound');
        // facts and permission removals commit before any slow or failed photo downloads.
        await repo.apply(page.rows,page.next,lease,now());pages++;records+=page.rows.length;next=page.next;
        const result=await downloadPhotos(page.rows,env,beforeRequest,{fetcher,maxDownloads:Math.max(0,maxPhotos-photos),now,deadline:start+150000});photos+=result.attempted;
      }
    }
    }catch(error){if(/^MLS Grid returned HTTP (400|404|410)/.test(error.message))feedFailure=error;else throw error;}
    stage='photos';
    if(now()-start<150000 && photos<maxPhotos) {
      // Regenerate missing media URLs only after one hour. No signed URLs are persisted for retry.
      const missing=await env.LIVE_DB.prepare("SELECT DISTINCT l.provider_id FROM listing_media m JOIN listings l ON l.source=m.source AND l.id=m.listing_id WHERE m.state<>'ready' AND m.attempted_at<=? AND l.provider_id IS NOT NULL ORDER BY l.has_photos,CASE WHEN l.status='Active' THEN 0 ELSE 1 END,l.id LIMIT 12").bind(now()-3600000).all();
      const ids=missing.results.map(row=>row.provider_id).filter(id=>/^[A-Za-z0-9_-]+$/.test(id));
      if(ids.length) {
        await env.LIVE_DB.prepare("UPDATE listing_media SET state='failed' WHERE state='downloading' AND attempted_at<=?").bind(now()-3600000).run();
        const page=await client.page(client.properties(ids));
        // Backfill may reveal price/status/permission changes too; do not alter the replication watermark.
        await repo.apply(page.rows,null,lease,now(),false);
        const result=await downloadPhotos(page.rows,env,beforeRequest,{fetcher,maxDownloads:maxPhotos-photos,now,deadline:start+150000});photos+=result.attempted;
      }
    }
    if(feedFailure){stage='primary_feed';throw feedFailure;}
    return await finish({status:'ok',pages,records,photoAttempts:photos,locations,initialComplete:Boolean((await repo.state()).initial_complete)});
  } catch(error) {
    const reason=await repo.failure(lease,error,now());const messages=['MLS Grid connection failed','MLS Grid returned HTTP','Invalid MLS Grid JSON','Invalid MLS Grid page','Invalid MLS Grid record','Rejected unsafe','Invalid replication','Replication lease expired','Provider budget','Feed page exceeds','MLS Grid page exceeded'];
    const diagnostic=String(error.message).match(/^MLS Grid returned HTTP [0-9]{3}/)?.[0]||messages.find(message=>String(error.message).startsWith(message))||'internal_processing';
    return await finish({status:reason,diagnostic,providerReason:error.providerReason,stage,pages,records,photoAttempts:photos,locations});
  } finally {await repo.release(lease);}
}
export async function feedReady(db,now=Date.now()) {
  const state=await db.prepare('SELECT initial_complete,last_complete,failure FROM feed_state WHERE source=?').bind('onekey2').first();
  const time=Date.parse(state?.last_complete);
  return Boolean(state?.initial_complete && Number.isFinite(time) && time<=now+60000 && now-time<=12*3600000 && state.failure!=='credentials');
}
