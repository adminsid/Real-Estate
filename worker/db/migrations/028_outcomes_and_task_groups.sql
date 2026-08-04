-- Add group_name and template_id to transaction_tasks
ALTER TABLE transaction_tasks ADD COLUMN template_id TEXT REFERENCES transaction_templates(id);
ALTER TABLE transaction_tasks ADD COLUMN group_name TEXT;

-- Create outcome_templates table
CREATE TABLE outcome_templates (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  transaction_type TEXT, 
  title           TEXT NOT NULL,
  message         TEXT NOT NULL,
  created_by      TEXT REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_outcome_templates_tenant ON outcome_templates(tenant_id);

-- Create transaction_outcomes table
CREATE TABLE transaction_outcomes (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  user_id         TEXT REFERENCES users(id),
  message         TEXT NOT NULL,
  is_broker_advice INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_transaction_outcomes_tx ON transaction_outcomes(transaction_id);
