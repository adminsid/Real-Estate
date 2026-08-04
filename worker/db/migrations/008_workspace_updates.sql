-- RE Workspace — Multi-Module Updates (Phase 10)
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/008_workspace_updates.sql --remote

-- Add license expiration tracking to users
ALTER TABLE users ADD COLUMN license_expiration_date TEXT;

-- Add private visibility and business card support to network connections
ALTER TABLE network_connections ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0;
ALTER TABLE network_connections ADD COLUMN business_card_key TEXT;

-- Create B2B referrals exchange table
CREATE TABLE IF NOT EXISTS network_referrals (
  id                     TEXT PRIMARY KEY,
  tenant_id              TEXT NOT NULL REFERENCES tenants(id),
  sender_id              TEXT NOT NULL REFERENCES users(id),
  recipient_connection_id TEXT NOT NULL REFERENCES network_connections(id) ON DELETE CASCADE,
  client_name            TEXT NOT NULL,
  client_email           TEXT,
  client_phone           TEXT,
  referral_type          TEXT NOT NULL DEFAULT 'buy', -- buy, sell
  status                 TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, completed, rejected
  notes                  TEXT,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referrals_tenant ON network_referrals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_referrals_sender ON network_referrals(sender_id);
CREATE INDEX IF NOT EXISTS idx_referrals_conn   ON network_referrals(recipient_connection_id);

-- Add commission rate, agreements, and expiration dates to transactions
ALTER TABLE transactions ADD COLUMN commission_rate REAL;
ALTER TABLE transactions ADD COLUMN agreement_type TEXT;
ALTER TABLE transactions ADD COLUMN agreement_expiration_date TEXT;
ALTER TABLE transactions ADD COLUMN parties_involved TEXT;

-- Add compliance document tracking and approvals to transaction tasks
ALTER TABLE transaction_tasks ADD COLUMN document_key TEXT;
ALTER TABLE transaction_tasks ADD COLUMN approval_status TEXT DEFAULT 'pending'; -- pending, approved, rejected
ALTER TABLE transaction_tasks ADD COLUMN approval_notes TEXT;
ALTER TABLE transaction_tasks ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE transaction_tasks ADD COLUMN approved_at TEXT;
