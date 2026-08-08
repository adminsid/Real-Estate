-- RE Workspace — Assistant Assignments & Delegated Access Audit
-- Migration 041: Run after 040_add_mfa_enabled.sql
-- wrangler d1 execute re-workspace-db --file=worker/db/migrations/041_assistant_assignments.sql --remote

-- assistant_assignments
CREATE TABLE IF NOT EXISTS assistant_assignments (
  id                      TEXT PRIMARY KEY,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  assistant_id            TEXT NOT NULL REFERENCES users(id),
  principal_id            TEXT NOT NULL REFERENCES users(id),
  
  -- Explicit deny-by-default scope fields (Phase 1: transactions, contacts only)
  can_access_transactions INTEGER NOT NULL DEFAULT 0,
  can_access_contacts     INTEGER NOT NULL DEFAULT 0,
  
  -- Assignment lifecycle (single active principal per assistant)
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','revoked','expired')),
  expires_at              TEXT,  -- ISO datetime; NULL = no expiration
  
  -- Audit trail
  created_by              TEXT NOT NULL REFERENCES users(id),
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
  
  UNIQUE(assistant_id, principal_id)
);

-- Enforce: one active assignment per assistant
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_assignment_per_assistant
ON assistant_assignments(assistant_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_asst_assign_tenant ON assistant_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asst_assign_principal ON assistant_assignments(principal_id);
CREATE INDEX IF NOT EXISTS idx_asst_assign_status ON assistant_assignments(status);
CREATE INDEX IF NOT EXISTS idx_asst_assign_expires ON assistant_assignments(expires_at);

-- transaction_outcomes audit extension (delegated transaction mutations)
ALTER TABLE transaction_outcomes ADD COLUMN acted_as_assistant_for TEXT REFERENCES users(id);
ALTER TABLE transaction_outcomes ADD COLUMN assistant_assignment_id TEXT REFERENCES assistant_assignments(id);

-- transactions audit extension
ALTER TABLE transactions ADD COLUMN created_by_assistant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN updated_by_assistant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN assistant_assignment_id TEXT REFERENCES assistant_assignments(id);

-- contacts audit extension
ALTER TABLE contacts ADD COLUMN created_by_assistant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN updated_by_assistant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN assistant_assignment_id TEXT REFERENCES assistant_assignments(id);

-- contact_audit_log: dedicated table for CRM contact mutations
CREATE TABLE IF NOT EXISTS contact_audit_log (
  id                      TEXT PRIMARY KEY,
  contact_id              TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id               TEXT NOT NULL REFERENCES tenants(id),
  user_id                 TEXT NOT NULL REFERENCES users(id),  -- assistant actor
  acted_as_assistant_for  TEXT NOT NULL REFERENCES users(id),  -- principal
  assistant_assignment_id TEXT NOT NULL REFERENCES assistant_assignments(id),
  action                  TEXT NOT NULL CHECK (action IN ('create','update')),
  field_changes           TEXT,  -- JSON: {field: {old, new}}
  created_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_contact_audit_contact ON contact_audit_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_audit_assistant ON contact_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_audit_assignment ON contact_audit_log(assistant_assignment_id);

-- transaction_tasks audit extension
ALTER TABLE transaction_tasks ADD COLUMN completed_by_assistant INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transaction_tasks ADD COLUMN assistant_assignment_id TEXT REFERENCES assistant_assignments(id);