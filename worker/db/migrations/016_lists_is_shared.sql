-- ============================================================
-- RE Workspace — D1 Schema Migration 016
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/016_lists_is_shared.sql --remote
-- ============================================================

ALTER TABLE mailing_lists ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 0;
