-- RE Workspace — Transactions Module Migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/003_transactions.sql --remote

CREATE TABLE IF NOT EXISTS transactions (
  id                   TEXT PRIMARY KEY,
  tenant_id            TEXT NOT NULL REFERENCES tenants(id),
  assigned_to          TEXT REFERENCES users(id),
  inventory_listing_id TEXT, -- References external inventory app ID
  name                 TEXT NOT NULL, -- e.g. "123 Main St - Sale"
  type                 TEXT NOT NULL DEFAULT 'sale', -- sale, lease
  status               TEXT NOT NULL DEFAULT 'lead', -- lead, active, under_contract, closed, fallen_through, etc.
  price                REAL,
  commission_amount    REAL,
  target_close_date    TEXT,
  actual_close_date    TEXT,
  notes                TEXT,
  is_active            INTEGER NOT NULL DEFAULT 1,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant   ON transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_assigned ON transactions(assigned_to);
CREATE INDEX IF NOT EXISTS idx_transactions_status   ON transactions(tenant_id, status);

CREATE TABLE IF NOT EXISTS transaction_parties (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  contact_id     TEXT NOT NULL REFERENCES contacts(id),
  role           TEXT NOT NULL, -- buyer, seller, landlord, tenant, buyer_agent, etc.
  is_primary     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_txn_parties_txn ON transaction_parties(transaction_id);
CREATE INDEX IF NOT EXISTS idx_txn_parties_contact ON transaction_parties(contact_id);

CREATE TABLE IF NOT EXISTS transaction_tasks (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  title          TEXT NOT NULL,
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'pending', -- pending, completed, skipped
  due_date       TEXT,
  completed_at   TEXT,
  completed_by   TEXT REFERENCES users(id),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_txn_tasks_txn ON transaction_tasks(transaction_id);

-- Checklists templates for settings
CREATE TABLE IF NOT EXISTS transaction_templates (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL, -- sale, lease
  tasks_json  TEXT NOT NULL, -- Array of default tasks
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
