-- RE Workspace — Add lead_app_domain to tenants
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/030_tenant_lead_app_domain.sql --remote

ALTER TABLE tenants ADD COLUMN lead_app_domain TEXT DEFAULT NULL;
