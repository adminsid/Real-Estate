CREATE TABLE personal_notes (
 id TEXT NOT NULL, tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id),
 body TEXT NOT NULL, occurred_at TEXT NOT NULL, saved_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(tenant_id,user_id,id)
);
