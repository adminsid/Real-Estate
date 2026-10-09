-- This hostname already routes to re-workspace in wrangler.toml and serves Prime America's workspace.
INSERT OR IGNORE INTO tenant_hostnames(id,tenant_id,hostname,is_primary,verified)
SELECT 'hn_app_primeamerica',tenant_id,'app.primeamericarealestate.com',0,1
FROM tenant_hostnames WHERE hostname='workspace.primeamericany.com' AND verified=1;
