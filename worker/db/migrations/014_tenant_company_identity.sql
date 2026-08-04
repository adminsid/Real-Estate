-- ============================================================
-- RE Workspace — D1 Schema Migration 014
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/014_tenant_company_identity.sql --remote
-- ============================================================

ALTER TABLE tenants ADD COLUMN company_address TEXT;
ALTER TABLE tenants ADD COLUMN company_telephone TEXT;
ALTER TABLE tenants ADD COLUMN company_fax TEXT;
