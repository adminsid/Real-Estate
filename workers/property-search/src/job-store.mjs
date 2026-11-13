export const jobId = (kind, source, id, revision, profile = '') => JSON.stringify([kind, source, id, revision, profile]);

// Used inside replica.batch: facts/checkpoint and their durable work commit together.
export function insertJob(db, {kind, source, id, revision, profile = '', now}, guard = '1=1', values = []) {
  return db.prepare(`INSERT INTO ingestion_jobs(id,kind,source,listing_id,revision,profile,requested_at)
    SELECT ?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET state='pending',not_before=0,
    published_until=0,finished_at=NULL,failure=NULL,attempts=0,requested_at=excluded.requested_at
    WHERE ingestion_jobs.kind='variant' AND ingestion_jobs.state='superseded'
    AND EXISTS(SELECT 1 FROM listing_media m JOIN listing_components c ON c.source=m.source AND c.listing_id=m.listing_id
      WHERE m.source=ingestion_jobs.source AND m.listing_id=ingestion_jobs.listing_id AND m.file=ingestion_jobs.revision
      AND m.state='ready' AND c.manifest_version=c.core_version)`)
    .bind(jobId(kind, source, id, revision, profile), kind, source, id, revision, profile, now, ...values);
}

export async function ingestionMode(db) {
  return (await db.prepare("SELECT mode FROM source_control WHERE source='onekey2'").first())?.mode;
}

export async function publishJobs(env, {now = Date.now(), limit = 24} = {}) {
  const db = env.LIVE_DB || env.SEARCH_DB;
  if (await ingestionMode(db) !== 'independent') return 0;
  // Reserve publication slots too: a deep warmup queue must never hide a newly
  // admitted gallery, and galleries must not prevent covers/variants publishing.
  const jobs=[];
  for(const [kind,share] of [['gallery',0.5],['cover',0.25],['variant',0.25]]){
    const room=Math.max(1,Math.floor(limit*share));
    let urgent=[];
    if(kind==='variant'){
      urgent=(await db.prepare(`SELECT j.id,j.kind FROM listing_enrichment q JOIN ingestion_jobs j
        ON j.source=q.source AND j.listing_id=q.listing_id WHERE j.kind='variant'
        AND q.requested_at>? AND (q.requested_at>q.completed_at OR q.completed_at>?)
        AND j.state IN ('pending','retry_wait','claimed') AND j.not_before<=? AND j.claim_until<=? AND j.published_until<=?
        ORDER BY q.requested_at,j.requested_at,j.id LIMIT ?`).bind(now-86400000,now-900000,now,now,now,Math.max(1,room-1)).all()).results;
    }
    const result=await db.prepare(`SELECT id,kind FROM ingestion_jobs WHERE kind=?
      AND state IN ('pending','retry_wait','claimed') AND not_before<=? AND claim_until<=?
      AND published_until<=? ORDER BY requested_at,id LIMIT ?`).bind(kind,now,now,now,room+urgent.length).all();
    const seen=new Set(urgent.map(job=>job.id));
    jobs.push(...[...urgent,...result.results.filter(job=>!seen.has(job.id))].slice(0,room));
  }
  let sent = 0;
  for (const job of jobs) {
    const queue = job.kind === 'gallery' ? env.GALLERY_JOBS : job.kind === 'cover' ? env.COVER_JOBS : env.VARIANT_JOBS;
    if (!queue) continue;
    const locked = await db.prepare(`UPDATE ingestion_jobs SET published_until=? WHERE id=?
      AND published_until<=? AND claim_until<=? AND state IN ('pending','retry_wait','claimed')
      AND (kind!='variant' OR (SELECT COUNT(*) FROM ingestion_jobs j WHERE j.kind='variant' AND j.state IN ('pending','retry_wait','claimed') AND j.published_until>? AND j.claim_until<=?)<4)`)
      .bind(now + 120000, job.id, now, now,now,now).run();
    if (!locked.meta.changes) continue;
    try {
      await queue.send({id: job.id}); sent++;
      await db.prepare(`UPDATE ingestion_jobs SET published_until=? WHERE id=? AND published_until=?
        AND claim_token IS NULL AND state IN ('pending','retry_wait','claimed')`).bind(now+86400000,job.id,now+120000).run();
    }
    catch {
      // Durable row remains recoverable by cron. Never report this as source failure.
      await db.prepare('UPDATE ingestion_jobs SET published_until=0 WHERE id=? AND published_until=?')
        .bind(job.id, now + 120000).run();
    }
  }
  return sent;
}

export async function claimJob(db, id, now = Date.now()) {
  const token = crypto.randomUUID();
  const result = await db.prepare(`UPDATE ingestion_jobs SET state='claimed',claim_token=?,
    claim_until=?,published_until=? WHERE id=? AND state IN ('pending','retry_wait','claimed')
    AND claim_until<=? AND not_before<=? AND attempts<8
    AND EXISTS(SELECT 1 FROM source_control WHERE source='onekey2' AND mode='independent')`)
    .bind(token, now + 180000, now + 180000, id, now, now).run();
  return result.meta.changes ? db.prepare('SELECT * FROM ingestion_jobs WHERE id=? AND claim_token=?').bind(id, token).first() : null;
}

export async function finishJob(db, job, {state = 'ready', retryAt = 0, failure = null, now = Date.now(),failedAttempt = false} = {}) {
  const statements=[];
  if(job.kind==='gallery')statements.push(db.prepare(`UPDATE listing_enrichment SET next_attempt_at=?,processing_until=0,
    completed_at=CASE WHEN ?='ready' AND EXISTS(SELECT 1 FROM listing_components c WHERE c.source=listing_enrichment.source
      AND c.listing_id=listing_enrichment.listing_id AND c.core_version=? AND c.manifest_version=c.core_version) THEN ? ELSE completed_at END
    WHERE source=? AND listing_id=? AND requested_at<=?
    AND EXISTS(SELECT 1 FROM listing_components c WHERE c.source=listing_enrichment.source AND c.listing_id=listing_enrichment.listing_id AND c.core_version=?)
    AND EXISTS(SELECT 1 FROM ingestion_jobs WHERE id=? AND claim_token=? AND claim_until>?)`)
    .bind(retryAt,state,job.revision,now,job.source,job.listing_id,job.requested_at,job.revision,job.id,job.claim_token,now));
  statements.push(db.prepare(`UPDATE ingestion_jobs SET state=?,not_before=?,failure=?,finished_at=?,attempts=attempts+?,
    claim_token=NULL,claim_until=0,published_until=0 WHERE id=? AND claim_token=? AND claim_until>?`)
    .bind(state, retryAt, failure, ['ready','superseded'].includes(state) ? now : null, failedAttempt?1:0, job.id, job.claim_token, now));
  await db.batch(statements);
}
