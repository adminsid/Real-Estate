CREATE TABLE IF NOT EXISTS prime_view_overrides (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  expectation_id TEXT NOT NULL,
  field TEXT NOT NULL,
  value TEXT NOT NULL,
  overridden_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_pvo_role ON prime_view_overrides(role);
CREATE INDEX IF NOT EXISTS idx_pvo_expectation ON prime_view_overrides(expectation_id);
CREATE INDEX IF NOT EXISTS idx_pvo_active ON prime_view_overrides(active);