-- RE Workspace — Contacts (CRM) migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/002_contacts.sql --remote

CREATE TABLE IF NOT EXISTS contacts (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  assigned_to  TEXT REFERENCES users(id),
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  type         TEXT NOT NULL DEFAULT 'buyer',   -- buyer|seller|both|referral|vendor|other
  status       TEXT NOT NULL DEFAULT 'prospect', -- prospect|active|closed|inactive
  source       TEXT,
  notes        TEXT,
  tags         TEXT,                             -- JSON array of strings
  address      TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contacts_tenant   ON contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_status   ON contacts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_contacts_type     ON contacts(tenant_id, type);

-- Contact activity log (calls, emails, notes, meetings)
CREATE TABLE IF NOT EXISTS contact_activities (
  id           TEXT PRIMARY KEY,
  contact_id   TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  type         TEXT NOT NULL DEFAULT 'note',   -- note|call|email|meeting|showing
  title        TEXT NOT NULL,
  body         TEXT,
  occurred_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activities_contact ON contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_tenant  ON contact_activities(tenant_id);
