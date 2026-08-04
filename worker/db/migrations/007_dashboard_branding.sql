-- ============================================================
-- RE Workspace — D1 Schema Migration 007
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/007_dashboard_branding.sql --remote
-- ============================================================

-- Add branding and dashboard settings columns to tenants
ALTER TABLE tenants ADD COLUMN primary_color TEXT DEFAULT '#0F2040';
ALTER TABLE tenants ADD COLUMN accent_color TEXT DEFAULT '#C9A84C';
ALTER TABLE tenants ADD COLUMN tagline TEXT DEFAULT 'Your Real Estate Command Center';
ALTER TABLE tenants ADD COLUMN website_url TEXT DEFAULT 'https://primeamericany.com';
ALTER TABLE tenants ADD COLUMN dashboard_settings TEXT DEFAULT NULL;
