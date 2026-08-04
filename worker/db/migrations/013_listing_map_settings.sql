-- ============================================================
-- RE Workspace — D1 Schema Migration 013
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_map_settings (
  listing_id TEXT PRIMARY KEY,
  lat REAL,
  lng REAL,
  categories TEXT DEFAULT '["all","food","groceries","transit","parks","education"]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
