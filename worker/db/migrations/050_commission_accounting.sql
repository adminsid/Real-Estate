-- Commission accounting: effective-dated plans, immutable ledger entries, and W-9 readiness.

CREATE TABLE IF NOT EXISTS commission_plans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  agent_id TEXT NOT NULL REFERENCES users(id),
  plan_type TEXT NOT NULL CHECK (plan_type IN ('percentage', 'flat_payout')),
  agent_percent REAL,
  flat_payout_cents INTEGER,
  brokerage_fee_cents INTEGER NOT NULL DEFAULT 0,
  franchise_fee_percent REAL NOT NULL DEFAULT 0,
  cap_cents INTEGER,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (agent_percent IS NULL OR (agent_percent >= 0 AND agent_percent <= 100)),
  CHECK (franchise_fee_percent >= 0 AND franchise_fee_percent <= 100)
);
CREATE INDEX IF NOT EXISTS idx_commission_plans_agent_date
  ON commission_plans (tenant_id, agent_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS commission_ledger_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  agent_id TEXT NOT NULL REFERENCES users(id),
  transaction_id TEXT REFERENCES transactions(id),
  commission_plan_id TEXT REFERENCES commission_plans(id),
  entry_type TEXT NOT NULL CHECK (entry_type IN ('earned', 'payment', 'advance', 'adjustment', 'repayment', 'chargeback')),
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('pending', 'posted', 'void')),
  amount_cents INTEGER NOT NULL,
  taxable_amount_cents INTEGER NOT NULL DEFAULT 0,
  effective_date TEXT NOT NULL,
  paid_at TEXT,
  source_key TEXT,
  memo TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_agent_date
  ON commission_ledger_entries (tenant_id, agent_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_transaction
  ON commission_ledger_entries (tenant_id, transaction_id);
CREATE INDEX IF NOT EXISTS idx_commission_ledger_paid
  ON commission_ledger_entries (tenant_id, agent_id, paid_at, status);

CREATE TABLE IF NOT EXISTS contractor_tax_profiles (
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  legal_name TEXT,
  business_name TEXT,
  tax_classification TEXT,
  tin_last_four TEXT,
  w9_status TEXT NOT NULL DEFAULT 'missing' CHECK (w9_status IN ('missing', 'requested', 'received', 'needs_update')),
  w9_received_at TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS tenant_tax_profiles (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
  legal_name TEXT,
  tax_id_last_four TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
