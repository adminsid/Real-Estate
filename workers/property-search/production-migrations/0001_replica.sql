-- Separate production replica. Never apply this migration to the Workspace or synthetic database.
CREATE TABLE feed_state (
 source TEXT PRIMARY KEY, next_url TEXT, watermark TEXT, cycle_watermark TEXT,
 phase TEXT NOT NULL DEFAULT 'initial', initial_baseline TEXT, bootstrap_started INTEGER,
 initial_complete INTEGER NOT NULL DEFAULT 0, last_complete TEXT, last_attempt TEXT,
 failure TEXT, retry_after INTEGER NOT NULL DEFAULT 0,
 last_request_at INTEGER NOT NULL DEFAULT 0,
 lease_id TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 request_day TEXT, requests INTEGER NOT NULL DEFAULT 0
);
INSERT INTO feed_state(source) VALUES ('onekey2');
CREATE TABLE listing_versions(source TEXT NOT NULL,id TEXT NOT NULL,modified TEXT NOT NULL,PRIMARY KEY(source,id));
CREATE TABLE listings (
 source TEXT NOT NULL,id TEXT NOT NULL,status TEXT,city TEXT,state TEXT,price REAL,beds REAL,
 property_type TEXT,search_text TEXT NOT NULL,public_json TEXT NOT NULL,
 borough TEXT,missing_price INTEGER NOT NULL,on_market_date TEXT,missing_date INTEGER NOT NULL,
 below_original INTEGER NOT NULL DEFAULT 0,has_photos INTEGER NOT NULL DEFAULT 0,
 provider_id TEXT,PRIMARY KEY(source,id)
);
CREATE INDEX listing_price ON listings(property_type,status,missing_price,price,id,source,state,borough,beds,has_photos,below_original,on_market_date);
CREATE INDEX listing_price_desc ON listings(property_type,status,missing_price,price DESC,id,source,state,borough,beds,has_photos,below_original,on_market_date);
CREATE INDEX listing_newest ON listings(property_type,status,missing_date,on_market_date DESC,id,source,state,price,beds,has_photos,below_original);
CREATE INDEX borough_price ON listings(property_type,status,borough,missing_price,price,id,source,state,borough,beds,has_photos,below_original,on_market_date);
CREATE INDEX borough_price_desc ON listings(property_type,status,borough,missing_price,price DESC,id,source,state,borough,beds,has_photos,below_original,on_market_date);
CREATE INDEX borough_newest ON listings(property_type,status,borough,missing_date,on_market_date DESC,id,source,state,price,beds,has_photos,below_original);
CREATE VIRTUAL TABLE listing_search USING fts5(search_text,content='listings',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER search_insert AFTER INSERT ON listings BEGIN INSERT INTO listing_search(rowid,search_text) VALUES(new.rowid,new.search_text); END;
CREATE TRIGGER search_delete AFTER DELETE ON listings BEGIN INSERT INTO listing_search(listing_search,rowid,search_text) VALUES('delete',old.rowid,old.search_text); END;
CREATE TRIGGER search_update AFTER UPDATE OF search_text ON listings BEGIN
 INSERT INTO listing_search(listing_search,rowid,search_text) VALUES('delete',old.rowid,old.search_text);
 INSERT INTO listing_search(rowid,search_text) VALUES(new.rowid,new.search_text);
END;
CREATE TABLE listing_media (
 source TEXT NOT NULL,listing_id TEXT NOT NULL,media_key TEXT NOT NULL,revision TEXT,
 file TEXT NOT NULL,type TEXT,position INTEGER NOT NULL,caption TEXT,
 state TEXT NOT NULL DEFAULT 'pending',attempted_at INTEGER NOT NULL DEFAULT 0,failure TEXT,
 PRIMARY KEY(source,listing_id,media_key)
);
CREATE INDEX media_parent ON listing_media(source,listing_id,state,position);
CREATE INDEX media_file ON listing_media(file,state);
CREATE INDEX media_pending ON listing_media(state,attempted_at,source,listing_id);

-- Conservatively reserve maximum response bytes before every upstream request.
CREATE TABLE feed_budget(hour INTEGER PRIMARY KEY,requests INTEGER NOT NULL,bytes INTEGER NOT NULL);
