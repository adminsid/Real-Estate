-- RE Workspace — Network enhancements + experience tracking
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/010_network_enhancements.sql --remote

ALTER TABLE network_connections ADD COLUMN website TEXT;
ALTER TABLE network_connections ADD COLUMN telephone TEXT;
ALTER TABLE network_connections ADD COLUMN fax TEXT;
ALTER TABLE network_connections ADD COLUMN poi TEXT;
ALTER TABLE network_connections ADD COLUMN picture_url TEXT;
ALTER TABLE network_connections ADD COLUMN experience_rating INTEGER;
ALTER TABLE network_connections ADD COLUMN experience_notes TEXT;
ALTER TABLE network_connections ADD COLUMN total_referrals INTEGER NOT NULL DEFAULT 0;
ALTER TABLE network_connections ADD COLUMN successful_referrals INTEGER NOT NULL DEFAULT 0;

ALTER TABLE network_referrals ADD COLUMN experience_rating INTEGER;
ALTER TABLE network_referrals ADD COLUMN experience_notes TEXT;
