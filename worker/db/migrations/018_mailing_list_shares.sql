-- ============================================================
-- RE Workspace — D1 Schema Migration 018
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/018_mailing_list_shares.sql --remote
-- ============================================================

CREATE TABLE IF NOT EXISTS mailing_list_shares (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(tenant_id, list_id, user_id)
);
CREATE INDEX idx_ml_shares_list ON mailing_list_shares(tenant_id, list_id);
CREATE INDEX idx_ml_shares_user ON mailing_list_shares(tenant_id, user_id);
