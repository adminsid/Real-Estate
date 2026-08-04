-- Add folder structure to documents table
ALTER TABLE documents ADD COLUMN is_folder INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN parent_id TEXT REFERENCES documents(id) ON DELETE CASCADE;
