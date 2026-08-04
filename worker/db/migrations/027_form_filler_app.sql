-- Form Filler App Registration
INSERT INTO app_registry (id, name, hostname, app_type, controlled, sso_capable, auth_model, notes)
VALUES ('app_formfiller', 'Form Filler (PoC)', 'filler.primeamericany.com', 'internal', 1, 1, 'central', 'Standalone PoC for PDF form mapping and auto-fill');
