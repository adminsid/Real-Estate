ALTER TABLE transactions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE commission_ledger_entries ADD COLUMN corrects_entry_id TEXT REFERENCES commission_ledger_entries(id);
ALTER TABLE commission_ledger_entries ADD COLUMN calculation_snapshot_json TEXT;
CREATE TRIGGER commission_posted_no_update BEFORE UPDATE ON commission_ledger_entries
WHEN OLD.status = 'posted'
BEGIN SELECT RAISE(ABORT, 'Posted commission entries require a linked adjustment'); END;
CREATE TRIGGER commission_posted_no_delete BEFORE DELETE ON commission_ledger_entries
WHEN OLD.status = 'posted'
BEGIN SELECT RAISE(ABORT, 'Posted commission entries cannot be deleted'); END;
ALTER TABLE transactions ADD COLUMN source_event_id TEXT;
CREATE UNIQUE INDEX idx_transactions_source_event ON transactions(tenant_id, source_event_id) WHERE source_event_id IS NOT NULL;
