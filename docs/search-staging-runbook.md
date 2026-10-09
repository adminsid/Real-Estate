# Search staging

This is a private, synthetic-data installation of the consumer search. Placester and the professional Workspace are separate services.

## Resources

- Worker: `prime-property-search-staging`
- Deployed host: `preview-search.primeamericany.com`
- D1: `prime-property-search-staging` (`47a4aef3-bc61-4b7c-9500-ae60e99dba55`)
- R2: `prime-property-search-staging-media`, private; no public bucket URL
- Configuration: `workers/property-search/wrangler.jsonc`
- Schema: `workers/property-search/migrations/0001_search_staging.sql`

No binding points to `re-workspace-db`. The Worker has a server-side MLS GRID credential for a bounded connection check, but no live replication or delivery integration. Staging inquiries are demo records.

## Owner access configuration

The approved self-hosted application is **Property search private staging**, covering the entire `preview-search.primeamericany.com` hostname with no path restriction. Its only policy is **Preview owner — lama@primeamericany.com** (`b70424b9-c9a5-4ddf-9da2-714b2255172c`): Allow, Include exact email `lama@primeamericany.com`. Login uses the existing One-time PIN provider, with six-hour application sessions. No Everyone, Bypass, service-token or other Allow rule is attached.

- Team domain: `primeamerica.cloudflareaccess.com`
- Application audience: `aeb5d1a3e1aacaf377f99f5297ba88a71b1ac4d3fb6c7466a557897aea823755`

These are public configuration identifiers, not credentials. The audience was read from the published Access login URL after Cloudflare confirmed creation. Both values are committed in the Worker config; generated binding types must match. Workers.dev and version preview URLs remain disabled. Native signature verification still runs before every page, API, asset and media read. JWKS requests use the edge-supported manual redirect mode and reject non-success responses, including redirects.

Open the preview URL, enter the allowed email, and enter the emailed sign-in code directly in Cloudflare's page. Do not commit, log or send the code to another service. Anonymous requests should reach the Access login. An allowed user should be able to browse results, open a direct Listing URL, use the gallery and save a synthetic inquiry. Unapproved identities must remain denied. Never enable public indexing on this host.

For rollback, restore the previous Worker version while keeping the Access application enabled. Clearing the Worker audience also closes every route. Do not remove verification to recover access.

## Local development and deployment

Build the frontend from the existing shared consumer files with `npm run search:build`. `npm run search:dev` runs the Cloudflare adapter locally. Local bindings begin empty; seed them explicitly with the staging migration and fictional dataset. Access checks also apply locally; unit/integration fixtures test authenticated routes without embedding a bypass in the deployed Worker.

Generate fictional fixtures with `node scripts/mls-grid/seed-staging.mjs`. The SQL and SVG files go to the ignored `workers/property-search/fixtures` directory. Apply the schema and seed **only** to the dedicated staging database using its explicit config. Upload the two files listed in `fixtures/media.json` to the dedicated private bucket. Seed upserts preserve separately saved demo inquiries. Do not export or upload the local MLS database.

Before deploy: `npm test`, `npm run typecheck`, `npm run build`, `npm run search:build`, `npm run search:typecheck`, then `npx wrangler deploy --dry-run --config workers/property-search/wrangler.jsonc`. Deploy using `npm run search:deploy:staging`, not the Workspace deployment command.

Use `wrangler versions list` and `wrangler rollback` with the explicit search config to revert Worker code. Database migrations and media uploads are separate from a Worker rollback; preserve their state and the Access app. Keep the synthetic seed available for reproducible recovery. No production migration is implied by this staging runbook.

GitHub CI validates code, tests, the Workspace build and the search bundle. It does not have Cloudflare credentials or deploy automatically. Production data permissions, source update/removal processing, communications delivery and public launch approval remain pending work.

## Deployment record — October 8, 2026

Worker version `46a5a5c3-725e-477f-b623-4da23e9af95e` is deployed to the custom hostname. Anonymous requests return HTTP 403 with private/no-store and noindex headers. Access configuration is deliberately empty until the account owner supplies the team domain and application AUD, so even the owner cannot yet browse remotely. The local design preview remains available separately.

## Owner-access update — October 8, 2026

The browser dashboard confirmed saving the exact-email policy and application. The preview hostname now redirects to the correct application login at `primeamerica.cloudflareaccess.com`. The dashboard subsequently reported an application-list permission error; that administrative view needs separate investigation if future changes are required. No alternative administrator credential was used to get around it.

Worker version `9ff1a169-452d-46a6-8db5-63d291012457` connects this application to the preview. Verification covered anonymous requests to the home page, listing route, search API, JavaScript, HTML template, embed page and media; each returned HTTP 302 to the matching Access login. After the owner completed sign-in, the browser showed the deployed search results and synthetic gallery images successfully. No real inquiry was submitted.

The isolated release passed all 452 tests, Workspace and search type checks, production and search builds, and the explicit search deployment dry run. No production service, database migration or live MLS dataset changed in this release.

## OneKey production connection — October 9, 2026

The account owner reported OneKey approval and added `MLS_GRID_ACCESS_TOKEN` with Wrangler's interactive secret prompt. Only the binding name is visible through `wrangler secret list`; the value is never read back, copied to local files, or included in this repository. The search Worker declares the secret as required for deployments and type generation.

`/ops/mls-grid` is a private operator page. Both the normal Access signature checks and the signed JWT email matching `FEED_OPERATOR_EMAIL` are required; an identity header alone is insufficient. GET/HEAD do not contact MLS GRID. A same-origin POST makes exactly one production request to `https://api.mlsgrid.com/v2/Property`, filtered to `onekey2` and `MlgCanView eq true`, selecting only `OriginatingSystemName`, `MlgCanView`, and `MlgCanUse`, with `$top=1` and no expansion. The check does not follow pagination, redirects or retries. The response is limited to 1 MiB and a 15-second request timeout. Token, listing payloads, provider errors and signed URLs never appear in the operator result, database, logs or consumer assets.

Results distinguish missing credentials, 401 authentication failure, 403 source/subscription denial, 429 quota suspension, transport failure, invalid response, an accepted empty result, and a returned OneKey permission sample. A returned IDX permission verifies only that sample. It does not prove complete inventory coverage, NYStateMLS access, display rules, AI authorization or approval for a different installation/domain.

Production synchronization is not enabled by this release. Before enabling it:

1. Record the approved subscription, installation/domain and permitted public-field/media inventory, and verify production media host and download behavior against current provider documentation.
2. Provision separate live-feed storage, with source/environment/resource checkpoints, run health and quota accounting; retain the synthetic dataset for design testing.
3. Add version-aware writes and removal evidence so older repairs cannot regress prices or restore revoked listings. Commit facts, eligibility, child manifests and page progress atomically.
4. Separate media readiness from fact replication; old/removed assets must become ineligible before replacement downloads. Do not let one expired picture block later removals.
5. Validate restart/resume, equal timestamps, permission changes, reconciliation after an extended outage, and source failures. Enable scheduled replication only after these checks pass.
6. Wire the approved projection and media into the private preview, then complete display validation for the approved installation before public publication.

The existing local importer remains fixed to the demo endpoint and demo storage. Do not give it the production token or mix its checkpoint/database with production.

Worker version `f64ed4da-933e-4758-a5fe-73d78a6925dc` deploys the private operator check. At `2026-10-09T16:20:05.936Z`, the authenticated owner-session check returned upstream HTTP 200, one matching OneKey permission sample, and `sampleAllowsIdx=true`. No listing payload or photo was persisted. The release passed 61 test files / 457 tests, both type checks, both builds and the explicit deployment dry run. Live replication/publication remain pending.
