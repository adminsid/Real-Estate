-- Additive cutover. Leave legacy ownership intact until the old pass has drained.
CREATE TABLE source_control (
 source TEXT PRIMARY KEY, mode TEXT NOT NULL DEFAULT 'legacy'
 CHECK(mode IN ('legacy','draining','independent')),
 poll_started_at INTEGER NOT NULL DEFAULT 0, poll_result TEXT,
 source_backoff_until INTEGER NOT NULL DEFAULT 0,
 media_backoff_until INTEGER NOT NULL DEFAULT 0,
 media_failure TEXT, source_failure TEXT, last_dispatch_at INTEGER NOT NULL DEFAULT 0,
 variant_seed_after TEXT NOT NULL DEFAULT '', variant_seed_complete INTEGER NOT NULL DEFAULT 0,
 location_token TEXT, location_until INTEGER NOT NULL DEFAULT 0, location_result TEXT
);
INSERT INTO source_control(source,last_dispatch_at,source_backoff_until,source_failure)
 SELECT source,last_request_at,retry_after,CASE WHEN failure='credentials' THEN failure ELSE NULL END FROM feed_state;

CREATE TABLE listing_components (
 source TEXT NOT NULL, listing_id TEXT NOT NULL, core_version TEXT NOT NULL,
 details_version TEXT, manifest_version TEXT, core_committed_at INTEGER NOT NULL,
 PRIMARY KEY(source,listing_id)
);
-- The old importer always requested expanded Media. Only retained entries prove a
-- reusable manifest; empty/missing historical manifests remain unvalidated.
INSERT INTO listing_components
 SELECT l.source,l.id,v.modified,NULL,
 CASE WHEN EXISTS(SELECT 1 FROM listing_media m WHERE m.source=l.source AND m.listing_id=l.id)
 THEN v.modified ELSE NULL END,0
 FROM listings l JOIN listing_versions v ON v.source=l.source AND v.id=l.id;

-- Job rows are also the transactional outbox. A send lease expires if publication
-- or acknowledgement is lost. Delivery is at least once; claims are fenced.
CREATE TABLE ingestion_jobs (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('cover','gallery','variant')),
 source TEXT NOT NULL, listing_id TEXT NOT NULL, revision TEXT NOT NULL,
 profile TEXT NOT NULL DEFAULT '', state TEXT NOT NULL DEFAULT 'pending',
 requested_at INTEGER NOT NULL, not_before INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, claim_token TEXT,
 claim_until INTEGER NOT NULL DEFAULT 0, published_until INTEGER NOT NULL DEFAULT 0,
 finished_at INTEGER, failure TEXT,
 UNIQUE(kind,source,listing_id,revision,profile)
);
CREATE INDEX jobs_due ON ingestion_jobs(state,not_before,published_until,requested_at);
CREATE INDEX jobs_parent ON ingestion_jobs(source,listing_id,kind,state);
CREATE TABLE source_attempts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, job_id TEXT, media_key TEXT, media_revision TEXT,
 created_at INTEGER NOT NULL, reserved_bytes INTEGER NOT NULL,
 completed_at INTEGER, actual_bytes INTEGER, status INTEGER,
 outcome TEXT NOT NULL DEFAULT 'may_have_dispatched'
);
CREATE INDEX attempts_time ON source_attempts(created_at);
CREATE TRIGGER components_listing_delete AFTER DELETE ON listings BEGIN
 DELETE FROM listing_components WHERE source=old.source AND listing_id=old.id;
 DELETE FROM ingestion_jobs WHERE source=old.source AND listing_id=old.id;
END;
