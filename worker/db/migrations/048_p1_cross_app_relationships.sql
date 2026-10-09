-- P1 cross-application identity and source relationships.

CREATE TABLE IF NOT EXISTS professional_licenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'NY',
  license_number TEXT NOT NULL,
  license_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expiration_date TEXT,
  source TEXT NOT NULL DEFAULT 'workspace_user',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, jurisdiction, license_number),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_licenses_user
  ON professional_licenses (tenant_id, user_id);

ALTER TABLE users ADD COLUMN professional_license_id TEXT;

INSERT OR IGNORE INTO professional_licenses (
  id, tenant_id, user_id, jurisdiction, license_number, expiration_date, source, verified_at
)
SELECT
  'lic_' || lower(hex(randomblob(12))),
  tenant_id,
  id,
  COALESCE(NULLIF(TRIM(license_state), ''), 'NY'),
  TRIM(license_number),
  license_expiration_date,
  'workspace_user',
  datetime('now')
FROM users
WHERE license_number IS NOT NULL AND TRIM(license_number) <> '';

UPDATE users
SET professional_license_id = (
  SELECT pl.id
  FROM professional_licenses pl
  WHERE pl.tenant_id = users.tenant_id AND pl.user_id = users.id
)
WHERE professional_license_id IS NULL;

CREATE TABLE IF NOT EXISTS contact_source_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  listing_id TEXT,
  open_house_event_id TEXT,
  consent_status TEXT NOT NULL DEFAULT 'property_contact_only',
  consent_captured_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tenant_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_source_contact
  ON contact_source_links (tenant_id, contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_source_listing
  ON contact_source_links (tenant_id, listing_id);
CREATE INDEX IF NOT EXISTS idx_contact_source_event
  ON contact_source_links (tenant_id, open_house_event_id);

CREATE INDEX IF NOT EXISTS idx_transactions_inventory_listing_active
  ON transactions (tenant_id, inventory_listing_id, is_active);
