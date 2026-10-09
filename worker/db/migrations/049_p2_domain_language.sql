-- P2: canonical business vocabularies and copied-snapshot provenance.

ALTER TABLE contacts ADD COLUMN qualification_status TEXT NOT NULL DEFAULT 'unqualified';
ALTER TABLE contact_source_links ADD COLUMN source_version TEXT;

UPDATE contacts
SET qualification_status = CASE lead_stage
  WHEN 'qualified' THEN 'qualified'
  WHEN 'converted' THEN 'qualified'
  WHEN 'closed_lost' THEN 'disqualified'
  WHEN 'nurture' THEN 'engaged'
  ELSE 'unqualified'
END;

UPDATE contacts SET lifecycle_stage = 'inquiry' WHERE lifecycle_stage = 'listing_inquiry';

UPDATE transactions SET status = 'offer_received' WHERE status = 'active';
UPDATE transactions SET status = 'fallen_through' WHERE status = 'cancelled';

ALTER TABLE transactions ADD COLUMN inventory_source TEXT;
ALTER TABLE transactions ADD COLUMN inventory_source_version TEXT;
ALTER TABLE transactions ADD COLUMN inventory_snapshot_synced_at TEXT;
ALTER TABLE transactions ADD COLUMN inventory_snapshot_json TEXT;

UPDATE transactions
SET inventory_source = 'listing-input',
    inventory_snapshot_synced_at = updated_at
WHERE inventory_listing_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_qualification
  ON contacts(tenant_id, qualification_status);
