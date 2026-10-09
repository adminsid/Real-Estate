ALTER TABLE transactions ADD COLUMN workflow_key TEXT NOT NULL DEFAULT 'legacy_v1'
 CHECK(workflow_key IN ('legacy_v1','sale_v1','lease_v1'));
CREATE TABLE transaction_phase_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, transaction_id TEXT NOT NULL,
 workflow_key TEXT NOT NULL, previous_phase TEXT, phase TEXT NOT NULL,
 occurred_at TEXT NOT NULL DEFAULT (datetime('now')), origin TEXT NOT NULL
);
INSERT INTO transaction_phase_history(tenant_id,transaction_id,workflow_key,phase,origin)
 SELECT tenant_id,id,'legacy_v1',status,'migration_baseline' FROM transactions;
CREATE TRIGGER transactions_workflow_insert AFTER INSERT ON transactions BEGIN
 UPDATE transactions SET workflow_key=CASE WHEN NEW.type='lease' THEN 'lease_v1' ELSE 'sale_v1' END WHERE id=NEW.id;
 INSERT INTO transaction_phase_history(tenant_id,transaction_id,workflow_key,phase,origin)
 VALUES(NEW.tenant_id,NEW.id,CASE WHEN NEW.type='lease' THEN 'lease_v1' ELSE 'sale_v1' END,NEW.status,'created');
END;
CREATE TRIGGER transactions_phase_change AFTER UPDATE OF status ON transactions
 WHEN OLD.status <> NEW.status BEGIN
 INSERT INTO transaction_phase_history(tenant_id,transaction_id,workflow_key,previous_phase,phase,origin)
 VALUES(NEW.tenant_id,NEW.id,NEW.workflow_key,OLD.status,NEW.status,'transition');
END;
CREATE INDEX idx_transaction_phase_history ON transaction_phase_history(tenant_id,transaction_id,id);
