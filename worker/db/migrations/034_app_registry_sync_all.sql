-- Migration 034: Register all Prime America satellite Workers in app_registry
INSERT OR IGNORE INTO app_registry (id, name, hostname, app_type, controlled, sso_capable, auth_model, notes)
VALUES
  ('app_listing_input_dev', 'Inventory Admin', 'listing-input.lama-4db.workers.dev', 'inventory', 1, 1, 'central', 'Inventory & RESO Admin Worker'),
  ('app_openhouse_dev',     'Open House Portal', 'openhouse.lama-4db.workers.dev',     'openhouse', 1, 1, 'central', 'Open House Registration Worker'),
  ('app_branding_hub_dev',   'Branding Hub',     'branding-hub.lama-4db.workers.dev',  'marketing', 1, 1, 'central', 'Brand & Marketing Collateral Worker'),
  ('app_company_brain_dev',  'Company Brain',    'prime-america-kb.lama-4db.workers.dev', 'kb', 1, 1, 'central', 'Company Brain Knowledge Base Worker');
