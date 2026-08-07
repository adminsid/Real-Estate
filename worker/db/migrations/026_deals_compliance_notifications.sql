-- RE Workspace — Deals, Compliance, Notifications Migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/026_deals_compliance_notifications.sql --remote

-- 1. transaction_team
CREATE TABLE IF NOT EXISTS transaction_team (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  role           TEXT NOT NULL, -- co-list, co-sell
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transaction_team_txn ON transaction_team(transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_team_user ON transaction_team(user_id);

-- 2. transaction_tasks updates for compliance
ALTER TABLE transaction_tasks ADD COLUMN attachment_required INTEGER DEFAULT 0;
ALTER TABLE transaction_tasks ADD COLUMN broker_approval_required INTEGER DEFAULT 0;
ALTER TABLE transaction_tasks ADD COLUMN broker_approval_status TEXT; -- 'pending', 'approved', 'rejected'
ALTER TABLE transaction_tasks ADD COLUMN broker_comment TEXT;
ALTER TABLE transaction_tasks ADD COLUMN due_anchor_event TEXT;
ALTER TABLE transaction_tasks ADD COLUMN due_offset_days INTEGER;

-- 3. notifications updates
ALTER TABLE notifications ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE notifications ADD COLUMN is_read INTEGER DEFAULT 0;
ALTER TABLE notifications ADD COLUMN type TEXT;
ALTER TABLE notifications ADD COLUMN action_url TEXT;
ALTER TABLE notifications ADD COLUMN related_entity_id TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
