-- Private, pre-CRM consumer intake. No marketing enrollment or booking confirmation.
CREATE TABLE consumer_inquiries (
 id TEXT PRIMARY KEY,
 command_id TEXT NOT NULL UNIQUE,
 request_hash TEXT NOT NULL,
 source TEXT NOT NULL,
 listing_id TEXT NOT NULL,
 kind TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'received',
 name TEXT NOT NULL,
 email TEXT NOT NULL,
 phone TEXT NOT NULL,
 message TEXT NOT NULL,
 requested_at TEXT,
 representation TEXT NOT NULL,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT
);
CREATE INDEX consumer_inquiries_status_created ON consumer_inquiries(status,created_at DESC);
CREATE TABLE consumer_inquiry_events (
 id TEXT PRIMARY KEY,
 inquiry_id TEXT NOT NULL,
 status TEXT NOT NULL,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX consumer_inquiry_events_parent ON consumer_inquiry_events(inquiry_id,created_at);
