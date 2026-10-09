-- RE Workspace — operations project execution tracker
-- Stores signed-agreement project workflow records, tasks, and collaboration notes.

CREATE TABLE IF NOT EXISTS operations_projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  client_name TEXT,
  property_address TEXT,
  deal_id TEXT,
  listing_id TEXT,
  crm_contact_id TEXT,
  owner TEXT,
  signed_date TEXT,
  current_stage TEXT NOT NULL DEFAULT 'Marketing Plan',
  status TEXT NOT NULL DEFAULT 'Active',
  due_date TEXT,
  completion INTEGER NOT NULL DEFAULT 0,
  assets_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_operations_projects_tenant ON operations_projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_operations_projects_due_date ON operations_projects(due_date);

CREATE TABLE IF NOT EXISTS operations_project_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES operations_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_operations_project_tasks_project ON operations_project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_operations_project_tasks_due_date ON operations_project_tasks(due_date);

CREATE TABLE IF NOT EXISTS operations_project_comments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES operations_projects(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_operations_project_comments_project ON operations_project_comments(project_id);
