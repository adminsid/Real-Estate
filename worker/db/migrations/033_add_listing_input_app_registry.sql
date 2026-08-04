-- Register Inventory Admin worker in app_registry for SSO redirections
INSERT OR IGNORE INTO app_registry (id, name, hostname, app_type, controlled, sso_capable, auth_model, notes)
VALUES ('app_listing_input', 'Inventory Admin', 'listing-input.lama-4db.workers.dev', 'inventory', 1, 1, 'central', 'Listing input & inventory administration app');
