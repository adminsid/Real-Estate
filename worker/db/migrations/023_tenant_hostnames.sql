-- ============================================================
-- RE Workspace — D1 Schema Migration 023
-- Hostname-aware tenant resolution
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/023_tenant_hostnames.sql --remote
-- ============================================================

-- Maps custom hostnames to tenants
-- This is how the platform knows which tenant is being accessed
CREATE TABLE IF NOT EXISTS tenant_hostnames (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hostname    TEXT UNIQUE NOT NULL,        -- e.g. workspace.primeamericany.com
  is_primary  INTEGER NOT NULL DEFAULT 0, -- the canonical hostname for this tenant
  verified    INTEGER NOT NULL DEFAULT 1, -- 1=active, 0=pending verification
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hostnames_tenant ON tenant_hostnames(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hostnames_host   ON tenant_hostnames(hostname);

-- Seed workspace.primeamericany.com as the primary hostname for tenant_primeamerica
INSERT OR IGNORE INTO tenant_hostnames (id, tenant_id, hostname, is_primary, verified)
  VALUES (
    'hn_workspace_prime',
    'tenant_primeamerica',
    'workspace.primeamericany.com',
    1,
    1
  );

-- Also register the workers.dev canonical URL as a valid hostname
INSERT OR IGNORE INTO tenant_hostnames (id, tenant_id, hostname, is_primary, verified)
  VALUES (
    'hn_workersdev_prime',
    'tenant_primeamerica',
    're-workspace.lama-4db.workers.dev',
    0,
    1
  );

-- Localhost for development
INSERT OR IGNORE INTO tenant_hostnames (id, tenant_id, hostname, is_primary, verified)
  VALUES (
    'hn_localhost_prime',
    'tenant_primeamerica',
    'localhost',
    0,
    1
  );
