-- RE Workspace — Tenant company license sync fields
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/012_tenant_company_license_sync.sql --remote

ALTER TABLE tenants ADD COLUMN company_license_number TEXT;
ALTER TABLE tenants ADD COLUMN company_license_holder_name TEXT;
ALTER TABLE tenants ADD COLUMN company_license_type TEXT;
ALTER TABLE tenants ADD COLUMN company_license_expiration_date TEXT;
ALTER TABLE tenants ADD COLUMN company_license_synced_at TEXT;
ALTER TABLE tenants ADD COLUMN company_agents_json TEXT;
