# Search staging

This is a private, synthetic-data installation of the consumer search. Placester and the professional Workspace are separate services.

## Resources

- Worker: `prime-property-search-staging`
- Deployed host: `preview-search.primeamericany.com`
- D1: `prime-property-search-staging` (`47a4aef3-bc61-4b7c-9500-ae60e99dba55`)
- R2: `prime-property-search-staging-media`, private; no public bucket URL
- Configuration: `workers/property-search/wrangler.jsonc`
- Schema: `workers/property-search/migrations/0001_search_staging.sql`

No binding points to `re-workspace-db`. The Worker has no MLS credential or delivery integration. Staging inquiries are demo records.

## Access setup needed from the account owner

The current Wrangler OAuth login can provision/deploy the Worker and storage but was denied Access application creation (HTTP 403). Its read-only Access application list was empty; organization settings were inaccessible, so the organization's actual configuration has not been verified.

In [Cloudflare Zero Trust](https://one.dash.cloudflare.com/), select the existing account and open Access applications. Add a Self-hosted application for **the entire** `preview-search.primeamericany.com` hostname, with no path restriction. Allow only `lama@primeamericany.com` initially; do not use an Everyone or Bypass rule. Use the existing login provider or email one-time PIN as appropriate. If setup requires accepting terms or choosing a plan, the account owner must complete that step.

Provide the team domain (`…cloudflareaccess.com`) and the application's AUD tag. These are public configuration identifiers, not credentials. Set `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in the search config, regenerate binding types, and redeploy. Keep workers.dev and preview URLs disabled. No page, asset, API or image is served while the settings are missing.

Verify an anonymous request reaches the Access login; a signed-in allowed user can browse results, open a direct Listing URL, use the gallery and save a synthetic inquiry; forged JWTs and unapproved origins remain denied. Verify a revoked listing's page and media return unavailable. Never enable public indexing on this host.

## Local development and deployment

Build the frontend from the existing shared consumer files with `npm run search:build`. `npm run search:dev` runs the Cloudflare adapter locally. Local bindings begin empty; seed them explicitly with the staging migration and fictional dataset. Access checks also apply locally; unit/integration fixtures test authenticated routes without embedding a bypass in the deployed Worker.

Generate fictional fixtures with `node scripts/mls-grid/seed-staging.mjs`. The SQL and SVG files go to the ignored `workers/property-search/fixtures` directory. Apply the schema and seed **only** to the dedicated staging database using its explicit config. Upload the two files listed in `fixtures/media.json` to the dedicated private bucket. Seed upserts preserve separately saved demo inquiries. Do not export or upload the local MLS database.

Before deploy: `npm test`, `npm run typecheck`, `npm run build`, `npm run search:build`, `npm run search:typecheck`, then `npx wrangler deploy --dry-run --config workers/property-search/wrangler.jsonc`. Deploy using `npm run search:deploy:staging`, not the Workspace deployment command.

Use `wrangler versions list` and `wrangler rollback` with the explicit search config to revert Worker code. Database migrations and media uploads are separate from a Worker rollback; preserve their state and the Access app. Keep the synthetic seed available for reproducible recovery. No production migration is implied by this staging runbook.

GitHub CI validates code, tests, the Workspace build and the search bundle. It does not have Cloudflare credentials or deploy automatically. Production data permissions, source update/removal processing, communications delivery and public launch approval remain pending work.

## Deployment record — October 8, 2026

Worker version `46a5a5c3-725e-477f-b623-4da23e9af95e` is deployed to the custom hostname. Anonymous requests return HTTP 403 with private/no-store and noindex headers. Access configuration is deliberately empty until the account owner supplies the team domain and application AUD, so even the owner cannot yet browse remotely. The local design preview remains available separately.
