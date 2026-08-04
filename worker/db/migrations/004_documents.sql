-- RE Workspace — Documents Module Migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/004_documents.sql --remote

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  entity_type  TEXT NOT NULL, -- 'transaction', 'contact', 'user'
  entity_id    TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_key     TEXT NOT NULL, -- R2 object key
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  uploaded_by  TEXT REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
