ALTER TABLE feed_state ADD COLUMN reconcile_id TEXT;
ALTER TABLE feed_state ADD COLUMN snapshot_start TEXT;
CREATE TABLE reconciliation_seen (
 source TEXT NOT NULL,id TEXT NOT NULL,generation TEXT NOT NULL,
 PRIMARY KEY(source,id)
);
