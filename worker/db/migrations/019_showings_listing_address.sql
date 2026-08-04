-- ============================================================
-- RE Workspace — D1 Schema Migration 019
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/019_showings_listing_address.sql --remote
-- ============================================================

ALTER TABLE showings ADD COLUMN listing_address TEXT;
