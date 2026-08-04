-- ============================================================
-- RE Workspace — D1 Schema Migration 025
-- Short-lived cross-app SSO tokens for cross-domain redirect flow
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/025_sso_tokens.sql --remote
-- ============================================================

-- Short-lived one-time tokens for cross-domain SSO redirect flow.
-- Flow: App A redirects to /api/sso/redirect?app=inventory&return_to=...
--       Worker issues a token, redirects to app with ?sso_token=<token>
--       Receiving app calls /api/sso/validate?token=<token> to get user identity
CREATE TABLE IF NOT EXISTS sso_tokens (
  token       TEXT PRIMARY KEY,           -- secure random hex token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_app  TEXT NOT NULL,              -- target app hostname
  return_to   TEXT,                       -- URL to return to after validation
  used_at     TEXT,                       -- null = unused, set = consumed
  expires_at  TEXT NOT NULL,             -- short TTL (5 minutes)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sso_tokens_user ON sso_tokens(user_id);
-- Auto-purge old tokens (done at query time via expires_at check)
