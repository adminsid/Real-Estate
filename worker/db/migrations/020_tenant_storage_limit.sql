-- RE Workspace — Add storage_limit_bytes to tenants
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/020_tenant_storage_limit.sql --remote

ALTER TABLE tenants ADD COLUMN storage_limit_bytes INTEGER DEFAULT 10737418240; -- Default 10 GB
