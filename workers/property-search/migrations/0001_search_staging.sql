-- Dedicated staging DB only. Never apply to re-workspace-db.
CREATE TABLE listings (
 source TEXT NOT NULL,id TEXT NOT NULL,status TEXT,city TEXT,state TEXT,
 price REAL,beds REAL,property_type TEXT,search_text TEXT NOT NULL,public_json TEXT NOT NULL,
 PRIMARY KEY(source,id)
);
CREATE INDEX listing_filters ON listings(source,status,price);
CREATE TABLE checkpoints(source TEXT PRIMARY KEY,next_url TEXT,timestamp TEXT,complete INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE listing_media(source TEXT NOT NULL,listing_id TEXT NOT NULL,media_key TEXT NOT NULL,revision TEXT,file TEXT NOT NULL,type TEXT NOT NULL,position INTEGER NOT NULL,caption TEXT NOT NULL,PRIMARY KEY(source,listing_id,media_key));
CREATE INDEX media_parent ON listing_media(source,listing_id,position);
CREATE INDEX media_file ON listing_media(file);
CREATE TABLE demo_inquiries(id TEXT PRIMARY KEY,source TEXT NOT NULL,listing_id TEXT NOT NULL,created_at TEXT NOT NULL,request_json TEXT NOT NULL);
