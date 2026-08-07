-- RE Workspace — CRM mailing list manager
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/011_crm_mailing_lists.sql --remote

CREATE TABLE IF NOT EXISTS mailing_lists (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  description TEXT,
  channel     TEXT NOT NULL DEFAULT 'email',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mailing_lists_tenant ON mailing_lists(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS mailing_list_members (
  id         TEXT PRIMARY KEY,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  list_id    TEXT NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_by   TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(list_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_mailing_members_list ON mailing_list_members(tenant_id, list_id);
CREATE INDEX IF NOT EXISTS idx_mailing_members_contact ON mailing_list_members(tenant_id, contact_id);
