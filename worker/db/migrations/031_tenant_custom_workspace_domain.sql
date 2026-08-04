-- RE Workspace — Add custom_workspace_domain to tenants
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/031_tenant_custom_workspace_domain.sql --remote

ALTER TABLE tenants ADD COLUMN custom_workspace_domain TEXT DEFAULT NULL;
