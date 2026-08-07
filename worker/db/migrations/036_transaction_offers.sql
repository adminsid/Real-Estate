-- RE Workspace — Transaction Offers Migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/036_transaction_offers.sql --remote

CREATE TABLE IF NOT EXISTS transaction_offers (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  purchaser_name TEXT NOT NULL,
  purchase_price REAL NOT NULL,
  offer_date     TEXT NOT NULL,
  offer_type     TEXT NOT NULL DEFAULT 'sales_agreement',
  status         TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, rejected
  details_json   TEXT NOT NULL, -- Holds the complete parsed offer object
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_txn_offers_txn ON transaction_offers(transaction_id);
