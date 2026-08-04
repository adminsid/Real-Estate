-- Migration 032: Overhaul features for Deals, Listings, Network, and RLS Permissions

-- 1. Stage-Gate milestone columns on transactions
ALTER TABLE transactions ADD COLUMN escrow_date TEXT;
ALTER TABLE transactions ADD COLUMN inspection_deadline TEXT;
ALTER TABLE transactions ADD COLUMN appraisal_date TEXT;

-- 2. Status column on listings (draft, pending_approval, active, archived)
ALTER TABLE listings ADD COLUMN approval_status TEXT DEFAULT 'active';

-- 3. Service radius / regions on network connections
ALTER TABLE network_connections ADD COLUMN service_radius TEXT;

-- 4. User permissions override table for RLS
CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  access_level TEXT NOT NULL, -- 'allow_all', 'allow_own', 'deny'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, resource, action)
);

-- 5. Network referral records table
CREATE TABLE IF NOT EXISTS network_referrals (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  referral_fee_percent REAL DEFAULT 25.0,
  status TEXT DEFAULT 'sent', -- 'sent', 'contacted', 'under_contract', 'closed'
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
