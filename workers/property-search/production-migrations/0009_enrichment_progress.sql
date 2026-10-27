-- Distinguish an in-flight gallery from a provider cooldown during consumer polling.
ALTER TABLE listing_enrichment ADD COLUMN processing_until INTEGER NOT NULL DEFAULT 0;
