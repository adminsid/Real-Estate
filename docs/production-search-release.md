# Production property search release

Prepared October 9, 2026 for `https://search.primeamericany.com`.

The owner confirmed that the approved primeamericany.com installation covers subdomains and designated `info@primeamericany.com` for data corrections and DMCA notices. Do not change the Placester Buy button until public end-to-end checks pass.

## Release controls

- Public Worker: `workers/property-search/wrangler.production.jsonc`. `PUBLIC_RELEASE_ENABLED=false` and `DISPLAY_REVIEW_COMPLETE=false` keep every route closed (503/noindex), including static assets, APIs, photos and sitemaps.
- Private preview and ingestion Worker: `workers/property-search/wrangler.jsonc`. Existing owner-only Access remains. `/ops/mls-grid` checks credentials; `/ops/mls-sync` shows import status and runs one bounded pass. These controls do not publish listings.
- Production resources: D1 `prime-property-search` (`7eb56a7c-7a05-4303-998a-4e38a8f7a5f3`), private R2 `prime-property-search-media`. They contain no Workspace data.
- `LIVE_SYNC_ENABLED` controls background work independently from publication. `DATASET=live` selects the private live-data interface; its banner explicitly allows incomplete private verification.

## Repeatable verification and deployment

Run from the repository root:

```sh
npm test
npm run typecheck
npm run build
npm run search:build:production
npm run search:typecheck
npm run search:typecheck:production
npx wrangler deploy --dry-run --config workers/property-search/wrangler.jsonc
npx wrangler deploy --dry-run --config workers/property-search/wrangler.production.jsonc
npx wrangler d1 migrations apply prime-property-search --remote --config workers/property-search/wrangler.production.jsonc
npx wrangler deploy --config workers/property-search/wrangler.jsonc
```

Before public deployment, verify deployed request-rate controls and scraping monitoring; finish the initial traversal and unfiltered catch-up, verify listing/media removals and empty delta polls, check real NYC coverage and published contact routing, confirm the OneKey public-field inventory, implement/verify optimized mobile photo delivery, and review required display wording/attribution/logos. Set `DISPLAY_REVIEW_COMPLETE=true` only when those checks are complete. Set `PUBLIC_RELEASE_ENABLED=true` only for the intended consumer launch.

```sh
npm run search:build:production
npx wrangler deploy --config workers/property-search/wrangler.production.jsonc
```

Then verify root search, all five boroughs where feed inventory exists, filter updates, all sort/page settings, deep links, phone/email actions without sending a test message, canonical and share metadata, sitemap, revoked-listing 404s, and mobile behavior. The Buy button target is **https://search.primeamericany.com/** (not `serach`).

## Performance evidence

`node scripts/mls-grid/benchmark-production.mjs` recreates 100,000 synthetic records and writes `docs/production-search-benchmark.json`. It measures local SQL statistics plus one page, not Cloudflare latency, image transfer, or Core Web Vitals. Query plans verify filter indexes and FTS5. Broad common-word text searches can still require a temporary sort; do not describe this as the fastest algorithm or a live latency guarantee.

## Rollback

Keep the Placester button unchanged during preparation. If a public release must close, deploy with `PUBLIC_RELEASE_ENABLED=false`; every consumer path then returns a closed 503/noindex response. Reverting consumer code does not revert D1 state. Never restore an older listing snapshot as a shortcut, because it can reintroduce revoked listings. Private ingestion can be paused with `LIVE_SYNC_ENABLED=false` without deleting resources. Stop displaying listings when the last complete poll exceeds twelve hours.

## Source assets and rules

Approved logo files in `scripts/mls-grid/display-assets` came from the OneKey MLS Documentation table in the owner's MLS GRID account on October 9. The required notices are reproduced for the licensed brokerage installation and use the confirmed designated email. Review sources: [OneKey IDX rules](https://support.onekeymls.com/hc/en-us/articles/43268287278996-MLS-GRID-IDX-and-VOW-Rules), [GRID API v2](https://docs.mlsgrid.com/api-documentation/api-version-2.0), and [media migration](https://docs.mlsgrid.com/releases/upcoming-changes-to-media-delivery-migration-away-from-amazon-aws).

## Deployment verification — October 9, 2026

The dedicated database migration was applied remotely, and both Workers were deployed. The public custom domain responded with the intended HTTP 503, `Retry-After: 300`, `noindex, nofollow`, and `private, no-store`; the closed preparation page was verified in the browser. The owner-only sync controls successfully processed a bounded 100-record pass. A subsequent aggregate check showed 200 source records processed, zero NYC listings so far, an incomplete initial import, and no recorded failure. These counts are progress evidence, not a statement of available consumer inventory.

Final verification: 62 test suites / 469 tests passed; Workspace typecheck and build passed; staging and production search typechecks, asset build, and both Wrangler dry runs passed. The Workspace build retains its existing large-chunk warning; the dedicated public search Worker bundle is approximately 11 KiB gzipped. Local benchmark timings are recorded separately and do not establish live response times.

The private preview now uses the live replica, with an explicit incomplete-import notice, so it no longer presents fictional test inventory. Public publication remains disabled. Initial traversal/catch-up, real-listing display and contact verification, authorized-field review, optimized photo delivery and mobile performance checks, and a deployed abuse-control check remain launch prerequisites.

Anonymous listing/page reads use a coarse 300-request/minute network limiter and photo reads a separate 1,200-request/minute limiter. Static assets remain available. Blocked reads return 429 with Retry-After and emit a structured event without listing details or IP addresses. These Cloudflare counters are local to each edge location and eventually consistent; they reduce burst scraping, do not prevent all scraping, and need traffic-based tuning for shared networks.

Reviewed deployed versions: private staging `e7b14425-77dd-4d5b-ae99-50cf25b39665`; closed production `c1c2d52a-9880-4e24-9eb7-066a1317f36e`. Browser verification confirmed that the owner-only live preview finishes rendering with zero matches during initial import, the approved logos and required disclosures are present, and the public preparation page remains closed. Scheduled logs showed active lease exclusions while an import pass was running; an aggregate check subsequently showed 300 source records processed with no stored failure. Independent review found no remaining required findings in the implementation or final abuse-control delta.

Binding declarations are regenerated without duplicating runtime definitions already supplied through the existing `@cloudflare/workers-types` dependency:

```sh
npx wrangler types workers/property-search/worker-configuration.d.ts --config workers/property-search/wrangler.jsonc --include-runtime=false
npx wrangler types workers/property-search/production-configuration.d.ts --config workers/property-search/wrangler.production.jsonc --env-interface ProductionEnv --include-runtime=false
```

## Import bottleneck correction — October 9, 2026

A live aggregate check found 1,860 source versions, zero retained NYC listings, and byte-budget backoff. The earliest pages contained November 2024 history. Twenty-record pages were each reserving 32 MiB without settling completed response bytes. Media processing additionally performed a D1 query for every photo of discarded listings. These were application bottlenecks, not proof of an MLS outage.

The corrected importer requests one 100-record page per invocation, bounded to 8 MiB, settles successfully consumed API responses to the larger of decoded bytes and Content-Length, and retains full reservations for interrupted or oversized responses. Request counts are never refunded. Initial queries select only the four marketing statuses supported by this release; catch-up and deltas stay unfiltered. Existing provider next links are not rewritten. An incomplete, lease-free initial import with no retained listings may be restarted from the beginning to adopt the new page size and status scope, keeping versions and conservative historic byte reservations. It must still finish traversal and catch-up before publication.

Version lookups are batched per page. Media eligibility and states use at most two page-level reads before atomic claims, including when all photos are already ready. Owner operations now display import phase and processed source counts. Public release controls remain closed.

## Photo ingestion correction — October 11, 2026

A read-only check found 23,260 source versions, 8,140 retained NYC listings, 1,490 ready photos, and 123,005 pending photos. D1 occupied 90.2 MB; the private R2 photo bucket occupied 388 MB. The preceding 25 hourly accounting buckets held 2,616 provider requests and 38.8 GB of conservative reservations. These are provider-protection counters, not Cloudflare billed transfer. Cloudflare's account usage dashboard reported no usage overage for the observed cycle; fixed subscriptions and domain registration invoices are separate.

The media downloader now settles each fully consumed response, including approved redirect bodies and HTTP error bodies, to the larger of decoded bytes and Content-Length. Interrupted or oversized responses retain the full reservation. Known credential/throttling status survives failed body consumption. The 15 MiB bound, rolling ceilings, persisted pacing, lease, request counts, and existing concurrency remain. Previously reserved bytes are not reset: they age out of the conservative hourly/daily windows.

Within the same 12-photo attempt cap, pending jobs now follow media order and give each candidate listing one photo before another gallery image; listings without photos come first within a round. Backfill selects up to 12 listings, prioritizing missing covers and then Active inventory. Both normal feed responses and backfill refresh activity timestamps for every pending/failed photo, including equal-version responses, so leftover photos cannot force another URL regeneration within one hour. Recent failures retain failed state and a conservative one-hour delay from the fresh URL acquisition; older failures become pending for retry. Stale source versions cannot refresh activity. Starting further photo jobs stops at the existing 150-second run deadline.

This correction adds no services, paid plan changes, transforms, or public exposure. Full bootstrap and unfiltered catch-up are still required; public launch controls remain closed.

Verification: 62 suites / 484 tests passed, including the initially failing response-accounting, cover-order, mixed-failure freshness, and consecutive-backfill regressions. Workspace and both search typechecks, Workspace build, production search asset build, and private Worker dry run passed. Independent review has no remaining required findings. Private importer deployed as `614842a2-17d9-4dc7-b8e6-6b32a030fb31` with its existing minute cron; no new bindings or services were added.

At 06:18 UTC on October 11, the source remained in initial traversal: 23,460 source versions, 8,183 NYC listings, 200 listings with photos, and 1,494 ready photos. Old rolling-hour reservations totaled 2,992,741,930 bytes, leaving 7,258,070 bytes—less than the 8 MiB feed-page reservation. The older hourly bucket expires at 07:00 UTC (03:00 America/New_York); resumed live throughput is not yet verified. Do not reset historical budgets or declare the feed complete on the strength of local tests.
