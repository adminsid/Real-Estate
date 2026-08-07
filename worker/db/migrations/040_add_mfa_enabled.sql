-- ============================================================
-- RE Workspace — D1 Schema Migration 040
-- Add mfa_enabled column to users table
-- ============================================================

ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0;
