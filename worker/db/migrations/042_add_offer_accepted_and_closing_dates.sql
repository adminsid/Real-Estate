-- RE Workspace — Add offer_accepted_date and closing_date columns to transactions table
ALTER TABLE transactions ADD COLUMN offer_accepted_date TEXT;
ALTER TABLE transactions ADD COLUMN closing_date TEXT;
