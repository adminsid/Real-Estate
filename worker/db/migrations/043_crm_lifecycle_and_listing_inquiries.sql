-- RE Workspace — CRM Lifecycle Stages, Listing Inquiry Pool & Archiving
-- Migration 043

-- 1. Extend contacts table with lifecycle fields
ALTER TABLE contacts ADD COLUMN source_listing_id TEXT;
ALTER TABLE contacts ADD COLUMN is_archived INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN lifecycle_stage TEXT DEFAULT 'lead'; -- lead | active_client | past_client | listing_inquiry

-- 2. Indexes for fast lifecycle and listing inquiry filtering
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle ON contacts(tenant_id, lifecycle_stage, is_archived);
CREATE INDEX IF NOT EXISTS idx_contacts_listing ON contacts(tenant_id, source_listing_id);
