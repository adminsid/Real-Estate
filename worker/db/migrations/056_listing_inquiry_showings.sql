-- One relationship per person/property; appointments remain separate records.
CREATE TABLE listing_inquiries (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL,
 contact_id TEXT NOT NULL REFERENCES contacts(id),
 listing_id TEXT NOT NULL,
 listing_address TEXT,
 attendee_role TEXT NOT NULL DEFAULT 'buyer' CHECK(attendee_role IN ('buyer','renter','outside_agent')),
 is_archived INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 UNIQUE(tenant_id,contact_id,listing_id)
);
CREATE INDEX idx_listing_inquiries_listing ON listing_inquiries(tenant_id,listing_id);
ALTER TABLE showings ADD COLUMN inquiry_id TEXT REFERENCES listing_inquiries(id);
ALTER TABLE showings ADD COLUMN status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('scheduled','completed','canceled','no_show'));
UPDATE showings SET status='scheduled' WHERE julianday(shown_at)>julianday('now');
CREATE INDEX idx_showings_inquiry ON showings(tenant_id,inquiry_id,shown_at);
INSERT OR IGNORE INTO listing_inquiries(id,tenant_id,contact_id,listing_id,is_archived)
 SELECT 'inq_'||lower(hex(randomblob(16))),tenant_id,id,source_listing_id,COALESCE(is_archived,0)
 FROM contacts WHERE is_active=1 AND NULLIF(trim(source_listing_id),'') IS NOT NULL;
INSERT OR IGNORE INTO listing_inquiries(id,tenant_id,contact_id,listing_id)
 SELECT 'inq_'||lower(hex(randomblob(16))),s.tenant_id,s.contact_id,s.listing_id
 FROM contact_source_links s JOIN contacts c ON c.id=s.contact_id AND c.tenant_id=s.tenant_id
 WHERE c.is_active=1 AND NULLIF(trim(s.listing_id),'') IS NOT NULL;
-- Keep public inquiry and open-house intake connected without changing consent evidence.
CREATE TRIGGER source_link_listing_inquiry AFTER INSERT ON contact_source_links
 WHEN NULLIF(trim(NEW.listing_id),'') IS NOT NULL
 BEGIN
 INSERT OR IGNORE INTO listing_inquiries(id,tenant_id,contact_id,listing_id)
 SELECT 'inq_'||lower(hex(randomblob(16))),NEW.tenant_id,NEW.contact_id,NEW.listing_id
 FROM contacts WHERE id=NEW.contact_id AND tenant_id=NEW.tenant_id AND is_active=1;
 END;
