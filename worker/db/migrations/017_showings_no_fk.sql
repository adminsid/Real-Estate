-- ============================================================
-- RE Workspace — D1 Schema Migration 017
-- Remove foreign key constraints from showings table
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/017_showings_no_fk.sql --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS showings_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  shown_at TEXT NOT NULL,
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO showings_new SELECT * FROM showings;
DROP TABLE showings;
ALTER TABLE showings_new RENAME TO showings;
CREATE INDEX IF NOT EXISTS idx_showings_listing ON showings(tenant_id, listing_id);
CREATE INDEX IF NOT EXISTS idx_showings_agent ON showings(tenant_id, agent_id);
