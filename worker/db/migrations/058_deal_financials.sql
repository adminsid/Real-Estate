-- Additive financial records. Existing deal values and posted ledger entries remain intact.
ALTER TABLE transactions ADD COLUMN financials_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN financials_state TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE transactions ADD COLUMN financial_price_label TEXT;
CREATE TABLE deal_financial_versions (
  tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL REFERENCES transactions(id),
  version INTEGER NOT NULL, data_json TEXT NOT NULL, calculation_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('draft','approved')), actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tenant_id, transaction_id, version)
);
CREATE TRIGGER financial_revision_guard BEFORE INSERT ON deal_financial_versions
WHEN NEW.version != (SELECT financials_version + 1 FROM transactions WHERE id=NEW.transaction_id AND tenant_id=NEW.tenant_id)
BEGIN SELECT RAISE(ABORT, 'Financials changed; reload before saving'); END;
CREATE TRIGGER financial_revision_advance AFTER INSERT ON deal_financial_versions
BEGIN UPDATE transactions SET financials_version=NEW.version, financials_state=NEW.state WHERE id=NEW.transaction_id AND tenant_id=NEW.tenant_id; END;
CREATE TRIGGER financial_no_update BEFORE UPDATE ON deal_financial_versions BEGIN SELECT RAISE(ABORT, 'Financial history is immutable'); END;
CREATE TRIGGER financial_no_delete BEFORE DELETE ON deal_financial_versions BEGIN SELECT RAISE(ABORT, 'Financial history is immutable'); END;
CREATE TABLE agent_financial_plans (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL REFERENCES users(id),
  effective_from TEXT NOT NULL, rules_json TEXT NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK(length(effective_from)=10)
);
CREATE TABLE financial_cap_balances (
  tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL, period TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant_id,agent_id,period)
);
CREATE TABLE financial_cap_movements (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL, period TEXT NOT NULL,
  transaction_id TEXT NOT NULL, version INTEGER NOT NULL, amount_cents INTEGER NOT NULL,
  expected_revision INTEGER NOT NULL,
  UNIQUE(tenant_id,transaction_id,version,agent_id,period)
);
CREATE TRIGGER cap_movement_guard BEFORE INSERT ON financial_cap_movements
WHEN NEW.expected_revision != COALESCE((SELECT revision FROM financial_cap_balances WHERE tenant_id=NEW.tenant_id AND agent_id=NEW.agent_id AND period=NEW.period),0)
BEGIN SELECT RAISE(ABORT, 'Cap balance changed; reload before approving'); END;
CREATE TRIGGER cap_movement_apply AFTER INSERT ON financial_cap_movements
BEGIN INSERT INTO financial_cap_balances(tenant_id,agent_id,period,amount_cents,revision)
VALUES(NEW.tenant_id,NEW.agent_id,NEW.period,NEW.amount_cents,1)
ON CONFLICT(tenant_id,agent_id,period) DO UPDATE SET amount_cents=amount_cents+NEW.amount_cents,revision=revision+1; END;
CREATE TABLE deal_receipts (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL REFERENCES transactions(id),
  payer TEXT NOT NULL, amount_cents INTEGER NOT NULL, received_date TEXT NOT NULL,
  reference TEXT NOT NULL, reverses_id TEXT REFERENCES deal_receipts(id), created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(tenant_id,reverses_id)
);
CREATE TABLE agent_account_charges (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, agent_id TEXT NOT NULL REFERENCES users(id),
  transaction_id TEXT REFERENCES transactions(id), description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents>0), charge_date TEXT NOT NULL,
  created_by TEXT NOT NULL, settled_at TEXT, settlement_reference TEXT,
  settlement_method TEXT, payment_id TEXT, source_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(tenant_id,source_key)
);
CREATE INDEX financial_plans_lookup ON agent_financial_plans(tenant_id,agent_id,effective_from);
CREATE INDEX receipts_deal_lookup ON deal_receipts(tenant_id,transaction_id,received_date);
CREATE INDEX charges_deal_lookup ON agent_account_charges(tenant_id,transaction_id);
CREATE TABLE charge_settlements (
  charge_id TEXT PRIMARY KEY REFERENCES agent_account_charges(id), tenant_id TEXT NOT NULL,
  payment_id TEXT NOT NULL REFERENCES commission_ledger_entries(id), settled_date TEXT NOT NULL
);
CREATE TRIGGER charge_settlement_guard BEFORE INSERT ON charge_settlements
WHEN NOT EXISTS(SELECT 1 FROM agent_account_charges WHERE id=NEW.charge_id AND tenant_id=NEW.tenant_id AND settled_at IS NULL)
BEGIN SELECT RAISE(ABORT,'Charge settlement changed; reload before recording payment'); END;
CREATE TRIGGER financial_approval_guard BEFORE INSERT ON deal_financial_versions
WHEN NEW.state='approved' AND NOT EXISTS(SELECT 1 FROM transactions WHERE id=NEW.transaction_id AND tenant_id=NEW.tenant_id AND status='closed' AND actual_close_date=json_extract(NEW.calculation_json,'$.calculatedDate') AND is_locked=0)
BEGIN SELECT RAISE(ABORT, 'Closing changed; reload before approving'); END;
CREATE TABLE transaction_offer_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
  offer_id TEXT NOT NULL, purchase_price REAL NOT NULL, status TEXT NOT NULL, details_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE TRIGGER preserve_offer_revision BEFORE UPDATE ON transaction_offers
BEGIN INSERT INTO transaction_offer_history(tenant_id,transaction_id,offer_id,purchase_price,status,details_json)
VALUES(OLD.tenant_id,OLD.transaction_id,OLD.id,OLD.purchase_price,OLD.status,OLD.details_json); END;
CREATE TRIGGER preserve_deleted_offer BEFORE DELETE ON transaction_offers
BEGIN INSERT INTO transaction_offer_history(tenant_id,transaction_id,offer_id,purchase_price,status,details_json)
VALUES(OLD.tenant_id,OLD.transaction_id,OLD.id,OLD.purchase_price,OLD.status,OLD.details_json); END;
