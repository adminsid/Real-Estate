-- RE Workspace — Add lock and timeline columns to transactions table
ALTER TABLE transactions ADD COLUMN is_locked INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN listed_date TEXT;
ALTER TABLE transactions ADD COLUMN expire_date TEXT;
ALTER TABLE transactions ADD COLUMN offer_date TEXT;
ALTER TABLE transactions ADD COLUMN pending_date TEXT;
ALTER TABLE transactions ADD COLUMN home_inspection_date TEXT;
ALTER TABLE transactions ADD COLUMN possession_date TEXT;
ALTER TABLE transactions ADD COLUMN escrow_date TEXT;
ALTER TABLE transactions ADD COLUMN inspection_deadline TEXT;
ALTER TABLE transactions ADD COLUMN appraisal_date TEXT;
