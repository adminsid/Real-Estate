-- RE Workspace — Lead Qualification, Audit Logs & Workspace Preferences migration
-- Migration 035

-- 1. Extend contacts table with lead qualification fields
ALTER TABLE contacts ADD COLUMN timeline TEXT;
ALTER TABLE contacts ADD COLUMN budget_min REAL;
ALTER TABLE contacts ADD COLUMN budget_max REAL;
ALTER TABLE contacts ADD COLUMN financing_readiness TEXT;
ALTER TABLE contacts ADD COLUMN move_date TEXT;
ALTER TABLE contacts ADD COLUMN seller_motivation TEXT;
ALTER TABLE contacts ADD COLUMN representation_status TEXT;
ALTER TABLE contacts ADD COLUMN urgency TEXT;
ALTER TABLE contacts ADD COLUMN preferred_contact_method TEXT;
ALTER TABLE contacts ADD COLUMN language TEXT;
ALTER TABLE contacts ADD COLUMN next_follow_up_date TEXT;
ALTER TABLE contacts ADD COLUMN next_action TEXT;
ALTER TABLE contacts ADD COLUMN lead_stage TEXT DEFAULT 'new'; -- new | needs_follow_up | overdue | qualified | nurture | converted | closed_lost

-- 2. Audit logs table for data integrity & output validation history
CREATE TABLE IF NOT EXISTS audit_logs (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL REFERENCES tenants(id),
  user_id      TEXT NOT NULL REFERENCES users(id),
  entity_type  TEXT NOT NULL, -- contact | transaction | document | network
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL, -- create | update | merge | document_generated | stage_changed
  details      TEXT,          -- JSON details
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- 3. Operational mode preference per user/tenant & notification enhancements
ALTER TABLE users ADD COLUMN operational_mode TEXT DEFAULT 'prospecting';
ALTER TABLE notifications ADD COLUMN priority TEXT DEFAULT 'informational'; -- urgent | today | informational
ALTER TABLE notifications ADD COLUMN snoozed_until TEXT;
