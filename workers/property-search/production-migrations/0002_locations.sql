-- Derived map locations stay separate from source MLS fields.
ALTER TABLE listings ADD COLUMN latitude REAL;
ALTER TABLE listings ADD COLUMN longitude REAL;
ALTER TABLE listings ADD COLUMN map_source TEXT;
ALTER TABLE listings ADD COLUMN address_key TEXT;
ALTER TABLE listings ADD COLUMN geocode_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN projection_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX listing_coordinates ON listings(state,latitude,longitude,property_type,status);
CREATE INDEX listing_geocode ON listings(geocode_after,id) WHERE latitude IS NULL AND address_key IS NOT NULL;
CREATE INDEX listing_area ON listings(COALESCE(NULLIF(TRIM(json_extract(public_json,'$.KEY_ManNYNeighborhood')),''),NULLIF(TRIM(json_extract(public_json,'$.PostalCity')),''),city),property_type,status,state);
CREATE INDEX listing_address_key ON listings(address_key) WHERE address_key IS NOT NULL;
CREATE TABLE location_refresh(id INTEGER PRIMARY KEY CHECK(id=1),next_url TEXT,complete INTEGER NOT NULL DEFAULT 0,processed INTEGER NOT NULL DEFAULT 0,last_attempt TEXT,failure TEXT);
INSERT INTO location_refresh(id) VALUES(1);
CREATE TABLE geocode_budget(day TEXT PRIMARY KEY,requests INTEGER NOT NULL DEFAULT 0);
