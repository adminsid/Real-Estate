-- RE Workspace — Network Module Migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/005_network.sql --remote

CREATE TABLE IF NOT EXISTS network_connections (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  created_by   TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  title        TEXT,
  company      TEXT,
  email        TEXT,
  phone        TEXT,
  type         TEXT NOT NULL DEFAULT 'colleague',
  avatar_url   TEXT,
  notes        TEXT,
  connected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_network_tenant ON network_connections(tenant_id);
