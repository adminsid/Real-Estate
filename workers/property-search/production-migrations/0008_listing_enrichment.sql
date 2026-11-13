-- Durable, coalesced consumer demand. Never store signed provider URLs here.
CREATE TABLE listing_enrichment (
 source TEXT NOT NULL, listing_id TEXT NOT NULL,
 requested_at INTEGER NOT NULL, completed_at INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(source,listing_id)
);
CREATE INDEX enrichment_due ON listing_enrichment(next_attempt_at,requested_at)
 WHERE requested_at>completed_at;
CREATE TRIGGER enrichment_listing_delete AFTER DELETE ON listings BEGIN
 DELETE FROM listing_enrichment WHERE source=old.source AND listing_id=old.id;
END;
