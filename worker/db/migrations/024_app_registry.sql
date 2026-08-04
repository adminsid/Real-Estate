-- ============================================================
-- RE Workspace — D1 Schema Migration 024
-- Registered app hostnames — tracks which apps we control
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/024_app_hostnames.sql --remote
-- ============================================================

-- Registry of all Prime America-controlled apps and third-party vendor apps
CREATE TABLE IF NOT EXISTS app_registry (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name            TEXT NOT NULL,
  hostname        TEXT UNIQUE NOT NULL,    -- e.g. inventory.primeamericarealestate.com
  app_type        TEXT NOT NULL,           -- 'workspace' | 'inventory' | 'openhouse' | 'marketing' | 'vendor'
  controlled      INTEGER NOT NULL DEFAULT 1, -- 1=we control it, 0=third-party vendor
  sso_capable     INTEGER NOT NULL DEFAULT 0, -- 1=can participate in SSO, 0=separate login only
  auth_model      TEXT NOT NULL DEFAULT 'separate', -- 'central' | 'separate' | 'federated'
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_app_registry_hostname ON app_registry(hostname);

-- Prime America-controlled apps
INSERT OR IGNORE INTO app_registry (id, name, hostname, app_type, controlled, sso_capable, auth_model, notes)
VALUES
  ('app_workspace',  'RE Workspace',            'workspace.primeamericany.com',           'workspace',  1, 1, 'central',   'Main portal — central auth authority'),
  ('app_inv_live',   'Listing Inventory',        'inventory.primeamericarealestate.com',   'inventory',  1, 1, 'central',   'Listing data source of truth — separate Worker'),
  ('app_openhouse',  'Open House Portal',        'openhouse.primeamericarealestate.com',   'openhouse',  1, 1, 'central',   'Open house registrations — separate Worker'),
  ('app_inside',     'Brand & Marketing Hub',    'inside.primeamericarealestate.com',      'marketing',  1, 1, 'central',   'Internal marketing hub — separate Worker'),
  ('app_workers',    'RE Workspace (canonical)', 're-workspace.lama-4db.workers.dev',      'workspace',  1, 1, 'central',   'Canonical workers.dev deployment URL'),
  -- Third-party vendor apps (no SSO possible)
  ('app_txdesk',     'TransactionDesk',          'pr.transactiondesk.com',                 'vendor',     0, 0, 'separate',  'Lone Wolf Technologies — no federation capability; users log in separately'),
  ('app_onekey',     'OneKey MLS',               'onekey.clareity.net',                    'vendor',     0, 0, 'separate',  'Clareity / Constellation1 MLS SSO — NYSCAR credentials; no federation with our system'),
  ('app_ceshop',     'CE Shop Academy',          'primeamerica.theceshop.com',             'vendor',     0, 0, 'separate',  'The CE Shop — third-party CE provider; no API federation');
