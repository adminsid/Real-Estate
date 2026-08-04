-- RE Workspace — Notifications Module Migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/006_notifications.sql --remote

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant ON notifications(tenant_id);
