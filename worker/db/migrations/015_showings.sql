-- ============================================================
-- RE Workspace — D1 Schema Migration 015
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/015_showings.sql --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS showings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  buyer_name TEXT NOT NULL,
  shown_at TEXT NOT NULL,
  feedback TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (agent_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_showings_listing ON showings(tenant_id, listing_id);
CREATE INDEX IF NOT EXISTS idx_showings_agent ON showings(tenant_id, agent_id);
