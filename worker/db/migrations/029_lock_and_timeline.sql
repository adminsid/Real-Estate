-- RE Workspace — Lock and Timeline dates migration
-- Run: wrangler d1 execute re-workspace-db --file=worker/db/migrations/029_lock_and_timeline.sql --remote

ALTER TABLE transactions ADD COLUMN is_locked INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN listed_date TEXT;
ALTER TABLE transactions ADD COLUMN expire_date TEXT;
ALTER TABLE transactions ADD COLUMN offer_date TEXT;
ALTER TABLE transactions ADD COLUMN pending_date TEXT;
ALTER TABLE transactions ADD COLUMN home_inspection_date TEXT;
ALTER TABLE transactions ADD COLUMN possession_date TEXT;
