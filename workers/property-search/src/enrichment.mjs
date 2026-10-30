const HOUR=3600000,DAY=24*HOUR;

export async function enrichmentStatus(db,source,id,now=Date.now()) {
 const counts=await db.prepare("SELECT COUNT(*) AS known,COALESCE(SUM(state='ready'),0) AS ready FROM listing_media WHERE source=? AND listing_id=?").bind(source,id).first();
 const demand=await db.prepare('SELECT requested_at,completed_at,next_attempt_at,processing_until FROM listing_enrichment WHERE source=? AND listing_id=?').bind(source,id).first();
 const pending=Boolean(demand&&demand.requested_at>demand.completed_at&&demand.requested_at>now-DAY);
 const loading=pending&&demand.processing_until>now;
 return {state:pending?(loading?'loading':demand.next_attempt_at>now?'waiting':'queued'):'available',readyPhotos:counts.ready,knownPhotos:counts.known,retryAt:pending&&!loading&&demand.next_attempt_at>now?new Date(demand.next_attempt_at).toISOString():null};
}

export async function requestEnrichment(db,source,id,now=Date.now()) {
 // One row per retained listing, bounded globally as well as by consumer request rate.
 // Revisits do not move an existing request ahead of anyone else or reset its cooldown.
 await db.prepare(`INSERT INTO listing_enrichment(source,listing_id,requested_at)
 SELECT source,id,? FROM listings WHERE source=? AND id=? AND provider_id IS NOT NULL
 AND ((SELECT COUNT(*) FROM listing_enrichment)<500 OR EXISTS(SELECT 1 FROM listing_enrichment WHERE source=? AND listing_id=?))
 ON CONFLICT(source,listing_id) DO UPDATE SET requested_at=excluded.requested_at,next_attempt_at=0
 WHERE listing_enrichment.requested_at<=listing_enrichment.completed_at AND listing_enrichment.completed_at<=?-900000`)
 .bind(now,source,id,source,id,now).run();
 return enrichmentStatus(db,source,id,now);
}

export async function processEnrichment(env,repo,client,lease,download,{now=()=>Date.now(),deadline=Infinity,available=()=>true}={}) {
 const db=env.LIVE_DB,guard="EXISTS(SELECT 1 FROM feed_state WHERE source='onekey2' AND lease_id=? AND lease_until>?)";
 await db.prepare(`DELETE FROM listing_enrichment WHERE (requested_at<? OR (completed_at>=requested_at AND completed_at<=?)) AND ${guard}`).bind(now()-DAY,now()-900000,lease,now()).run();
 let processed=0;
 for(let i=0;i<3&&now()<deadline&&available();i++) {
  const demand=await db.prepare(`SELECT q.source,q.listing_id,l.provider_id FROM listing_enrichment q JOIN listings l ON l.source=q.source AND l.id=q.listing_id WHERE q.source='onekey2' AND q.requested_at>q.completed_at AND q.next_attempt_at<=? ORDER BY q.next_attempt_at,q.requested_at,q.listing_id LIMIT 1`).bind(now()).first();
  if(!demand)break;
  const pending=await db.prepare("SELECT COUNT(*) AS n,MAX(attempted_at) AS last FROM listing_media WHERE source=? AND listing_id=? AND state!='ready'").bind(demand.source,demand.listing_id).first();
  // Source media URLs may only be regenerated after one hour; clicks cannot bypass it.
  const retryAt=pending.n?Math.max(now(),(pending.last||0)+HOUR):now();
  await db.prepare(`UPDATE listing_enrichment SET next_attempt_at=?,processing_until=? WHERE source=? AND listing_id=? AND ${guard}`).bind(Math.max(retryAt,now()+HOUR),retryAt>now()?0:now()+180000,demand.source,demand.listing_id,lease,now()).run();
  if(retryAt>now())continue;
  if(!/^[A-Za-z0-9_-]+$/.test(demand.provider_id))continue;
  try{
  const page=await client.page(client.properties([demand.provider_id]));
  if(page.next||page.rows.length>1||page.rows.some(row=>row.OriginatingSystemName!==demand.source||row.ListingId!==demand.provider_id||row.ListingKey!==demand.listing_id))throw Error('Invalid on-demand listing response');
  // This lookup refreshes facts and display permissions, never the global replication cursor.
  await repo.apply(page.rows,null,lease,now(),false);
  await download(page.rows);
  const remaining=await db.prepare("SELECT COUNT(*) AS n FROM listing_media WHERE source=? AND listing_id=? AND state!='ready'").bind(demand.source,demand.listing_id).first();
  if(!remaining.n||!page.rows.length)await db.prepare(`UPDATE listing_enrichment SET completed_at=? WHERE source=? AND listing_id=? AND ${guard}`).bind(now(),demand.source,demand.listing_id,lease,now()).run();
  processed++;
  }finally{
   await db.prepare(`UPDATE listing_enrichment SET processing_until=0 WHERE source=? AND listing_id=? AND ${guard}`).bind(demand.source,demand.listing_id,lease,now()).run();
  }
 }
 return processed;
}
