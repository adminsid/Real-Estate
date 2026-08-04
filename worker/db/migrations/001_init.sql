-- ============================================================
-- RE Workspace — D1 Schema Migration 001
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/001_init.sql --remote
-- ============================================================

-- Tenants (brokerages / companies)
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'starter',
  logo_url    TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed Prime America as the first tenant
INSERT OR IGNORE INTO tenants (id, name, slug)
  VALUES ('tenant_primeamerica', 'Prime America Real Estate', 'prime-america');

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  email           TEXT NOT NULL,
  password_hash   TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'salesperson',
  license_number  TEXT,
  license_state   TEXT DEFAULT 'NY',
  avatar_url      TEXT,
  phone           TEXT,
  title           TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  email_verified  INTEGER NOT NULL DEFAULT 0,
  invited_by      TEXT REFERENCES users(id),
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(email, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- User personal settings (notifications, theme, preferences)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme            TEXT NOT NULL DEFAULT 'system',
  notifications    TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  display_prefs    TEXT NOT NULL DEFAULT '{}',  -- JSON blob
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Granular permissions (overrides on top of role defaults)
-- granted=1 means allow, granted=0 means explicit deny (deny wins)
CREATE TABLE IF NOT EXISTS user_permissions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id  TEXT NOT NULL REFERENCES tenants(id),
  module     TEXT NOT NULL,
  action     TEXT NOT NULL,
  granted    INTEGER NOT NULL DEFAULT 1,
  granted_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, module, action)
);
CREATE INDEX IF NOT EXISTS idx_perms_user ON user_permissions(user_id);

-- Invitations (HR sends invite link → agent creates account)
CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL REFERENCES tenants(id),
  invited_by  TEXT NOT NULL REFERENCES users(id),
  email       TEXT NOT NULL,
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'salesperson',
  token       TEXT UNIQUE NOT NULL,
  accepted_at TEXT,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invites_token  ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invites_tenant ON invitations(tenant_id);

-- Impersonation audit log
CREATE TABLE IF NOT EXISTS impersonation_audit_log (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  impersonator_id TEXT NOT NULL REFERENCES users(id),
  target_user_id  TEXT NOT NULL REFERENCES users(id),
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at        TEXT,
  reason          TEXT
);
CREATE INDEX IF NOT EXISTS idx_impersonate_tenant ON impersonation_audit_log(tenant_id);
