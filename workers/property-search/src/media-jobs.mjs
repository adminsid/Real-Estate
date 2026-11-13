import { createClient } from '../../../scripts/mls-grid/client.mjs';
import { replica } from './replica.mjs';
import { downloadPhotos } from './live-media.mjs';
import { sourceFetcher } from './source-dispatch.mjs';
import { claimJob, finishJob, insertJob, publishJobs, ingestionMode } from './job-store.mjs';
import { prepareVariant } from './image-variants.mjs';

const HOUR = 3600000;

async function recoverRetainedOriginals(env,job,now,checked=new Set()){
  const db=env.LIVE_DB;
  const pending=await db.prepare(`SELECT media_key,file FROM listing_media m WHERE source=? AND listing_id=? AND state!='ready'
    AND EXISTS(SELECT 1 FROM listing_components c WHERE c.source=m.source AND c.listing_id=m.listing_id AND c.manifest_version=c.core_version)
    ORDER BY position,media_key LIMIT ?`).bind(job.source,job.listing_id,job.kind==='cover'?1:200).all();
  const unchecked=pending.results.filter(media=>!checked.has(media.file));
  for(let offset=0;offset<unchecked.length;offset+=4){
   const outcomes=await Promise.allSettled(unchecked.slice(offset,offset+4).map(async media=>{
    checked.add(media.file);
    const object=await env.LIVE_MEDIA.head(media.file),type=object?.httpMetadata?.contentType;
    if(!object||object.size>15*1024*1024||!['image/jpeg','image/png','image/webp'].includes(type))return;
    await db.batch([
      db.prepare(`UPDATE listing_media SET state='ready',type=?,failure=NULL WHERE source=? AND listing_id=? AND media_key=? AND file=?
        AND EXISTS(SELECT 1 FROM listing_components c WHERE c.source=listing_media.source AND c.listing_id=listing_media.listing_id AND c.manifest_version=c.core_version)
        AND EXISTS(SELECT 1 FROM ingestion_jobs WHERE id=? AND claim_token=? AND claim_until>?)`)
        .bind(type,job.source,job.listing_id,media.media_key,media.file,job.id,job.claim_token,now),
      db.prepare(`UPDATE listings SET has_photos=EXISTS(SELECT 1 FROM listing_media m WHERE m.source=listings.source AND m.listing_id=listings.id AND m.state='ready')
        WHERE source=? AND id=? AND EXISTS(SELECT 1 FROM listing_components c WHERE c.source=listings.source AND c.listing_id=listings.id AND c.manifest_version=c.core_version)`)
        .bind(job.source,job.listing_id),
    ]);
   }));
   const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason;
  }
}

export async function seedJobs(env, now = Date.now()) {
  const db = env.LIVE_DB;
  if (await ingestionMode(db) !== 'independent') return;
  await db.prepare('DELETE FROM listing_enrichment WHERE requested_at<? OR (completed_at>=requested_at AND completed_at<=?)').bind(now-86400000,now-900000).run();
  // Seed only covers that are missing or whose manifest has not been verified.
  // The indexed has_photos flag avoids scanning a million-photo backlog per pass.
  const covers = await db.prepare(`SELECT l.source,l.id,c.core_version FROM listings l JOIN listing_components c
    ON c.source=l.source AND c.listing_id=l.id WHERE l.has_photos=0
    AND NOT EXISTS(SELECT 1 FROM ingestion_jobs j WHERE j.kind='cover' AND j.source=l.source AND j.listing_id=l.id AND j.revision=c.core_version)
    ORDER BY CASE WHEN l.status='Active' AND l.borough IS NOT NULL THEN 0 WHEN l.status='Active' THEN 1 ELSE 2 END,l.id LIMIT 24`).all();
  if (covers.results.length) await db.batch(covers.results.map(row => insertJob(db, {kind:'cover', source:row.source, id:row.id, revision:row.core_version, now})));
  // Warm just one current cover per listing. Gallery derivatives are demand work.
  const seed=await db.prepare("SELECT variant_seed_after,variant_seed_complete FROM source_control WHERE source='onekey2'").first();
  if(!seed.variant_seed_complete){
    const originals = await db.prepare(`SELECT l.source,l.id AS listing_id,(SELECT file FROM listing_media m
      WHERE m.source=l.source AND m.listing_id=l.id AND m.state='ready' ORDER BY position,media_key LIMIT 1) AS file
      FROM listings l JOIN listing_components c ON c.source=l.source AND c.listing_id=l.id AND c.manifest_version=c.core_version
      WHERE l.source='onekey2' AND l.id>? AND l.has_photos=1 ORDER BY l.id LIMIT 96`).bind(seed.variant_seed_after).all();
    const jobs=originals.results.filter(row=>row.file).flatMap(row=>['cardSmall','cardLarge'].map(profile=>insertJob(db,{kind:'variant',source:row.source,id:row.listing_id,revision:row.file,profile,now})));
    jobs.push(db.prepare("UPDATE source_control SET variant_seed_after=?,variant_seed_complete=? WHERE source='onekey2' AND variant_seed_after=?")
      .bind(originals.results.at(-1)?.listing_id||seed.variant_seed_after,originals.results.length<96?1:0,seed.variant_seed_after));
    await db.batch(jobs);
  }
  // Recover demand admitted just before cutover or a failed queue publication.
  const demands = await db.prepare(`SELECT q.source,q.listing_id,c.core_version FROM listing_enrichment q JOIN listing_components c
    ON c.source=q.source AND c.listing_id=q.listing_id WHERE q.requested_at>q.completed_at AND q.requested_at>? LIMIT 24`).bind(now - 86400000).all();
  if (demands.results.length) await db.batch(demands.results.map(row => insertJob(db, {kind:'gallery', source:row.source, id:row.listing_id, revision:row.core_version, now})));
  // Retain bounded operational history. No MLS facts or R2 originals are deleted.
  await db.prepare('DELETE FROM source_attempts WHERE id IN (SELECT id FROM source_attempts WHERE created_at<? LIMIT 500)').bind(now - 30 * 86400000).run();
  await db.prepare("UPDATE ingestion_jobs SET state='dead_letter',failure='attempt_limit',claim_token=NULL,claim_until=0 WHERE attempts>=8 AND state IN ('pending','retry_wait','claimed') AND claim_until<=?").bind(now).run();
}

async function variantsForReady(db, job, now) {
  const media = await db.prepare("SELECT file FROM listing_media WHERE source=? AND listing_id=? AND state='ready' ORDER BY position,media_key LIMIT 200").bind(job.source, job.listing_id).all();
  const selected = job.kind === 'cover' ? media.results.slice(0,1) : media.results;
  const profiles = job.kind === 'cover' ? ['cardSmall','cardLarge'] : ['cardSmall','display'];
  if (selected.length) await db.batch(selected.flatMap(row => profiles.map(profile => insertJob(db, {kind:'variant', source:job.source, id:job.listing_id, revision:row.file, profile, now}))));
}

export async function runMediaJob(env, id, {now = () => Date.now(), fetcher,schedule=work=>work} = {}) {
  const db = env.LIVE_DB, job = await claimJob(db, id, now());
  if (!job) return {status:'duplicate_or_deferred'};
  let result;
  try {
    const current = await db.prepare(`SELECT l.provider_id,c.core_version,c.manifest_version FROM listings l JOIN listing_components c
      ON c.source=l.source AND c.listing_id=l.id WHERE l.source=? AND l.id=?`).bind(job.source, job.listing_id).first();
    if (!current || (job.kind !== 'variant' && current.core_version !== job.revision)) {
      await finishJob(db, job, {state:'superseded', now:now()}); return {status:'superseded'};
    }
    if (job.kind === 'variant') {
      const prepared = await prepareVariant({...env, SEARCH_DB:db, SEARCH_MEDIA:env.LIVE_MEDIA}, job.revision, job.profile, {now:now()});
      if (prepared === 'budget') {
        const date = new Date(now());
        await finishJob(db, job, {state:'retry_wait', retryAt:Date.UTC(date.getUTCFullYear(), date.getUTCMonth()+1, 1), failure:'transform_budget', now:now()});
      } else await finishJob(db, job, {state:prepared === 'unavailable' ? 'superseded' : 'ready', now:now()});
      return {status:prepared};
    }
    const checkedOriginals=new Set();
    await recoverRetainedOriginals(env,job,now(),checkedOriginals);
    const pending = await db.prepare("SELECT COUNT(*) AS n,MAX(attempted_at) AS last FROM listing_media WHERE source=? AND listing_id=? AND state!='ready'").bind(job.source, job.listing_id).first();
    // Keep the conservative parent URL-regeneration protection until MLS GRID
    // clarifies never-downloaded siblings. A click cannot override the clock.
    if (pending.n && pending.last + HOUR > now()) {
      await finishJob(db, job, {state:'retry_wait', retryAt:pending.last + HOUR, failure:'source_cooldown', now:now()});
      return {status:'source_cooldown'};
    }
    const cover = await db.prepare("SELECT COUNT(*) AS n FROM listing_media WHERE source=? AND listing_id=? AND state='ready'").bind(job.source, job.listing_id).first();
    if (current.manifest_version === current.core_version && (job.kind === 'cover' && cover.n || job.kind === 'gallery' && !pending.n)) {
      await variantsForReady(db, job, now()); await finishJob(db, job, {now:now()});
      return {status:'already_ready'};
    }
    if (!/^[A-Za-z0-9_-]+$/.test(current.provider_id || '')) throw Error('Source listing identifier unavailable');
    const sourceFetch = fetcher || sourceFetcher(env, job.kind, job);
    const client = createClient({token:env.MLS_GRID_ACCESS_TOKEN, source:'onekey2', endpoint:'https://api.mlsgrid.com/v2',
      fetcher:sourceFetch, beforeRequest:async () => {}, pageSize:100, maxResponseBytes:8*1024*1024});
    await updateDemand(db, job, now() + HOUR, false, now(), now() + 180000);
    await db.prepare("UPDATE listing_media SET state='failed',failure='previous_outcome_uncertain' WHERE source=? AND listing_id=? AND state='downloading' AND attempted_at<=?").bind(job.source,job.listing_id,now()-HOUR).run();
    const page = await client.page(client.properties([current.provider_id]));
    if(page.next)throw Error('Hydration continuation unexpected');
    if (page.rows.length > 1 || page.rows.some(row => row.OriginatingSystemName !== job.source || row.ListingKey !== job.listing_id || row.ListingId !== current.provider_id)) throw Error('Hydration identity mismatch');
    if (!page.rows.length) {
      await finishJob(db, job, {state:'retry_wait', retryAt:now() + HOUR, failure:'source_record_absent', now:now()});
      return {status:'source_record_absent'};
    }
    await replica(db).apply(page.rows, null, null, now(), false, {job});
    await recoverRetainedOriginals(env,job,now(),checkedOriginals);
    // A new core version or tombstone can supersede this hydration while it was
    // in flight. Downloads also recheck the exact permitted manifest below.
    result = await downloadPhotos(page.rows, env, async () => {}, {
      fetcher:sourceFetch, maxDownloads:96, concurrency:1, now, deadline:now()+120000, coversOnly:job.kind==='cover', job,
      onReady:async photo=>{
        const profiles=job.kind==='cover'?['cardSmall','cardLarge']:['cardSmall','display'];
        await db.batch(profiles.map(profile=>insertJob(db,{kind:'variant',source:photo.source,id:photo.id,revision:photo.file,profile,now:now()})));
        // Queue publication is tracked by the queue invocation, but need not hold
        // the next original transfer. Durable outbox rows survive interrupted sends.
        await schedule(publishJobs(env,{now:now(),limit:8}));
      },
    });
    await variantsForReady(db, job, now());
    const remaining = await db.prepare("SELECT COUNT(*) AS n FROM listing_media WHERE source=? AND listing_id=? AND state!='ready'").bind(job.source, job.listing_id).first();
    const total = await db.prepare('SELECT COUNT(*) AS n FROM listing_media WHERE source=? AND listing_id=?').bind(job.source,job.listing_id).first();
    const complete = !total.n || (job.kind === 'cover' ? Boolean((await db.prepare('SELECT has_photos FROM listings WHERE source=? AND id=?').bind(job.source, job.listing_id).first())?.has_photos) : !remaining.n);
    await finishJob(db, job, {state:complete?'ready':'retry_wait', retryAt:complete?0:now()+HOUR, failure:!total.n?'source_has_no_public_photo':complete?null:'source_cooldown', now:now()});
    return {status:complete?'ready':'source_cooldown', ...result};
  } catch (error) {
    const deferred=error.sourceFailure&&/budget unavailable|backoff active|coordinator is paused|claim expired/.test(error.message);
    const retryAt = deferred?Math.max(now()+60000,error.retryAt||0):Math.max(now() + HOUR, error.retryAt || 0);
    const failure = /budget/.test(error.message)?'source_budget':/429/.test(error.message)?'source_throttled':error.message==='Hydration continuation unexpected'?'hydration_continuation':error.message==='Hydration identity mismatch'?'hydration_identity':job.kind==='variant'?'transform_unavailable':'source_or_storage_unavailable';
    await finishJob(db, job, {state:!deferred&&job.attempts>=7?'dead_letter':'retry_wait', retryAt, failure, failedAttempt:!deferred, now:now()});
    return {status:failure};
  } finally {
    await publishJobs(env, {now:now()});
  }
}

async function updateDemand(db, job, retryAt, complete, now, processing = 0) {
  if (job.kind !== 'gallery') return;
  await db.prepare(`UPDATE listing_enrichment SET next_attempt_at=?,processing_until=?,
    completed_at=CASE WHEN ? THEN ? ELSE completed_at END WHERE source=? AND listing_id=? AND requested_at<=?
    AND EXISTS(SELECT 1 FROM ingestion_jobs WHERE id=? AND claim_token=? AND claim_until>?)
    AND EXISTS(SELECT 1 FROM listing_components c WHERE c.source=listing_enrichment.source AND c.listing_id=listing_enrichment.listing_id AND c.core_version=?)`)
    .bind(retryAt, processing, complete?1:0, now, job.source, job.listing_id,job.requested_at,job.id,job.claim_token,now,job.revision).run();
}

export async function consumeMediaJobs(batch, env,{schedule=work=>work}={}) {
  for (const message of batch.messages) {
    if (!message.body || typeof message.body.id !== 'string' || message.body.id.length > 512) { message.ack(); continue; }
    if(batch.queue==='prime-search-media-dlq'){
      try{
        await env.LIVE_DB.prepare("UPDATE ingestion_jobs SET state='dead_letter',failure='queue_delivery_exhausted',claim_token=NULL,claim_until=0 WHERE id=? AND state NOT IN ('ready','superseded') AND claim_until<=?").bind(message.body.id,Date.now()).run();
        message.ack();
      }catch{message.retry({delaySeconds:60});}
      continue;
    }
    try { await runMediaJob(env, message.body.id,{schedule}); message.ack(); }
    catch { message.retry({delaySeconds:60}); }
  }
}
