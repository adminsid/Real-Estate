-- Link Network introductions to the canonical CRM Person while retaining the
-- existing name/email/phone columns as historical snapshots.
ALTER TABLE network_referrals ADD COLUMN crm_contact_id TEXT REFERENCES contacts(id);
CREATE INDEX IF NOT EXISTS idx_network_referrals_crm_contact
  ON network_referrals(tenant_id, crm_contact_id);
