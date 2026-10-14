CREATE TABLE image_transform_budget(month TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE feed_monitor_counts(id INTEGER PRIMARY KEY CHECK(id=1),captured_at INTEGER NOT NULL,counts_json TEXT NOT NULL);
