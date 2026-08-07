-- RE Workspace — Business Logic Overhaul (Earnest Money, Commission Splits, Credits, Attorney Review, Failures, Post-Occupancy)
ALTER TABLE transactions ADD COLUMN earnest_money_amount REAL;
ALTER TABLE transactions ADD COLUMN earnest_money_status TEXT DEFAULT 'pending'; -- pending, deposited, returned, released
ALTER TABLE transactions ADD COLUMN earnest_money_notes TEXT;
ALTER TABLE transactions ADD COLUMN commission_split_buyer_percent REAL;
ALTER TABLE transactions ADD COLUMN commission_split_co_broker_percent REAL;
ALTER TABLE transactions ADD COLUMN commission_split_referral_percent REAL;
ALTER TABLE transactions ADD COLUMN repair_credit REAL;
ALTER TABLE transactions ADD COLUMN attorney_review_start_date TEXT;
ALTER TABLE transactions ADD COLUMN attorney_review_status TEXT DEFAULT 'pending'; -- pending, active, completed, waived
ALTER TABLE transactions ADD COLUMN deal_failure_reason TEXT; -- financing, inspection, title, seller_cold_feet, buyer_cold_feet, other
ALTER TABLE transactions ADD COLUMN deal_failure_notes TEXT;
ALTER TABLE transactions ADD COLUMN post_occupancy_deadline TEXT;
ALTER TABLE transactions ADD COLUMN post_occupancy_daily_rate REAL;
ALTER TABLE transactions ADD COLUMN post_occupancy_escrow_held REAL;
