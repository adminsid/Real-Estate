CREATE TABLE next_journeys (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 owner_id TEXT NOT NULL REFERENCES users(id), document TEXT NOT NULL CHECK(json_valid(document)),
 revision INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL REFERENCES users(id), last_command_id TEXT,
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX next_journeys_owner ON next_journeys(tenant_id,owner_id);
CREATE TABLE next_journey_members (
 journey_id TEXT NOT NULL REFERENCES next_journeys(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(journey_id,user_id)
);
CREATE TABLE next_journey_history (
 journey_id TEXT NOT NULL REFERENCES next_journeys(id), revision INTEGER NOT NULL,
 document TEXT NOT NULL, updated_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(journey_id,revision)
);
CREATE TRIGGER next_journey_revision BEFORE UPDATE OF document ON next_journeys BEGIN
 INSERT INTO next_journey_history(journey_id,revision,document,updated_by)
 VALUES(OLD.id,OLD.revision,OLD.document,OLD.updated_by);
END;
CREATE TABLE next_comments (
 id TEXT PRIMARY KEY, journey_id TEXT NOT NULL REFERENCES next_journeys(id),
 outcome_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX next_comments_outcome ON next_comments(journey_id,outcome_id,created_at);
-- Pre-transaction offers are promoted atomically to transaction_offers when linked.
CREATE TABLE next_offer_drafts (
 id TEXT PRIMARY KEY, journey_id TEXT NOT NULL REFERENCES next_journeys(id), payload TEXT NOT NULL CHECK(json_valid(payload))
);
-- Pre-listing showing notes are promoted to showings when linked.
CREATE TABLE next_showing_drafts (
 id TEXT PRIMARY KEY, journey_id TEXT NOT NULL REFERENCES next_journeys(id), payload TEXT NOT NULL CHECK(json_valid(payload))
);
ALTER TABLE showings ADD COLUMN next_details TEXT;
ALTER TABLE showings ADD COLUMN next_journey_id TEXT REFERENCES next_journeys(id);
CREATE INDEX showings_next_journey ON showings(tenant_id,next_journey_id);
CREATE TABLE contact_relationships (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 contact_id TEXT NOT NULL REFERENCES contacts(id), related_contact_id TEXT NOT NULL REFERENCES contacts(id),
 relationship TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 CHECK(contact_id < related_contact_id), UNIQUE(tenant_id,contact_id,related_contact_id)
);
CREATE INDEX contact_relationships_related ON contact_relationships(tenant_id,related_contact_id);
