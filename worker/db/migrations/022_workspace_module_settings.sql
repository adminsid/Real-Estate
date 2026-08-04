-- Migration 022: Workspace-level module settings (type-settings system)
-- These settings are admin-controlled and apply to all users in the workspace
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/022_workspace_module_settings.sql --remote

ALTER TABLE tenants ADD COLUMN module_settings TEXT DEFAULT NULL;
