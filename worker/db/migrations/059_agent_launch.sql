-- Per-recipient state also isolates legacy broker-only company notifications.
CREATE TABLE notification_states (
 tenant_id TEXT NOT NULL, notification_id TEXT NOT NULL REFERENCES notifications(id), user_id TEXT NOT NULL REFERENCES users(id),
 is_read INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,notification_id,user_id)
);
CREATE TABLE listing_lead_intakes (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, listing_id TEXT NOT NULL, assigned_to TEXT NOT NULL,
 payload_json TEXT NOT NULL, contact_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')),
 reviewed_by TEXT, resolution TEXT, PRIMARY KEY(tenant_id,id)
);
CREATE TABLE notification_email_jobs (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, category TEXT NOT NULL,
 subject TEXT NOT NULL, message TEXT NOT NULL, action_url TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, error_code TEXT,
 next_attempt_at TEXT NOT NULL DEFAULT(datetime('now')), created_at TEXT NOT NULL DEFAULT(datetime('now')),
 updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX email_jobs_pending ON notification_email_jobs(status,next_attempt_at);
CREATE TABLE pilot_feedback (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT NOT NULL, category TEXT NOT NULL,
 severity TEXT NOT NULL, area TEXT NOT NULL, description TEXT NOT NULL, expected TEXT NOT NULL,
 rating INTEGER, status TEXT NOT NULL DEFAULT 'new', resolution TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX feedback_tenant ON pilot_feedback(tenant_id,created_at);
CREATE INDEX intake_tenant ON listing_lead_intakes(tenant_id,status,created_at);
