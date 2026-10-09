# MLS Grid development integration

This is a local development slice, not the production website or a deployed feed service. It imports OneKey demo records into a separate SQLite database and serves a searchable preview from that database. NYStateMLS and Prime America exclusive integration are still pending.

## Verified connection

On October 7, 2026, the user-provided demo endpoint returned HTTP 200 for `OriginatingSystemName eq 'onekey2'`. The complete initial Property import returned 491 records. The sample includes NYC and other New York locations; it does not establish five-borough coverage or current availability. Source timestamps are shown without substituting the import time.

## Run locally

Requires Node 22.23 or later with `node:sqlite`. Node currently reports SQLite support as experimental. The development token is not saved in this repository. Supply it to the importer through `MLS_GRID_ACCESS_TOKEN` in the process environment; never use a browser/Vite environment variable for it.

```sh
# Set MLS_GRID_ACCESS_TOKEN securely in your local shell first.
node scripts/mls-grid/import.mjs
node scripts/mls-grid/preview.mjs
```

For databases imported before media replication was added, run a bounded backfill with the same environment token:

```sh
MLS_GRID_MEDIA_LISTINGS=12 MLS_GRID_MEDIA_OFFSET=0 node scripts/mls-grid/backfill-media.mjs
```

Backfill selects up to 24 Active Residential demo records matching New York from the existing database. It uses a bulk `ListingId in (...)` request, downloads promptly, and does not advance the Property replication checkpoint. Offset selects the next group. On October 7, 2026, seven complete galleries containing 133 photos were stored and verified in the browser. The first metadata diagnostics consumed/re-generated some single-use URLs; affected photos returned HTTP 429 and were left alone. Untouched galleries downloaded successfully.

Open http://127.0.0.1:8137 . The server binds only to the loopback address. Search supports address/city/ZIP/MLS number, status, property type, price, minimum bedrooms, and 24-result pagination. Filters survive URL reloads. Default results are Active Residential; other categories are explicitly selectable. Commercial lease prices may use a different basis from residential monthly rent; this preview shows the source ListPrice without estimating total cost.

Defaults:

| Setting | Value |
| --- | --- |
| Endpoint | `https://api-demo.mlsgrid.com/v2` (CLI fixed to demo) |
| `MLS_GRID_SOURCE` | `onekey2` |
| `MLS_GRID_DB` | `.mls-grid-demo/listings.sqlite` |
| `MLS_GRID_MAX_PAGES` | 5, configurable from 1 to 100 per run |
| Page size | 20 with Media, Rooms, UnitTypes expanded, so galleries can download before signed URLs expire |

The default database directory is git-ignored. A custom database path must also remain outside version control. The importer creates a lock beside the database to prevent concurrent runs. After a hard process termination, verify no importer is active before removing a stale `.lock` file.

## Implemented replication behavior

- Initial requests include the originating system and `MlgCanView eq true`.
- Pagination follows `@odata.nextLink` sequentially. Requests have at least 550 milliseconds between starts, a 30-second request timeout, and a 32 MiB decompressed page limit.
- Each successful page and its resume checkpoint commit in a single SQLite transaction. A failed page leaves the previous checkpoint intact. Re-running resumes its next-page URL, including when a run reaches its page budget.
- When pagination completes, the next run requests changes after the greatest received `ModificationTimestamp`, without a viewability filter. Records suppressed from search still advance that resource's checkpoint.
- Records losing viewability, internet display permission, or IDX use permission are removed from the searchable database.
- Pagination URLs must remain on the configured HTTPS host and Property resource with the same originating system. Redirects are not followed with credentials.
- Only an explicit public-field projection is stored. Seller details, access instructions, raw media URLs, and other unselected fields are not stored or returned. Withheld addresses omit street, unit, and coordinates from both results and searchable text; media captions are also suppressed for those records.
- Source keys retain their prefixes internally. Consumer-facing OneKey MLS numbers omit `KEY`.
- Credentials are never returned to the browser or saved to the database. Upstream error bodies and stack traces are not printed by the importer.

## Implemented media behavior

- Explicitly Public photo records are downloaded immediately from the demo media host. Private/non-public media and non-image documents do not enter the gallery.
- Initial media authentication uses the MLS Grid token in User-Agent. An observed signed redirect to MLS Grid's specific R2 storage host is followed without forwarding the token. Unrecognized hosts or further redirects fail closed.
- Photos are stored locally under SHA-256 identities derived from source, MediaKey, and revision. Regenerated signed URLs do not trigger another download of an unchanged cached image. Revised keys/timestamps produce new local assets.
- Each download is bounded at 15 MiB. A run defaults to at most 400 new photos and 256 MiB, sharing the sequential request pacer with API calls. These development caps do not replace production hourly/day quota accounting.
- The searchable Listing and its ordered media manifest are committed transactionally. Display revocations are applied before image work even when a later download fails; the Property checkpoint remains unchanged until the complete page succeeds.
- The media route requires a current eligible Listing/media relationship and rechecks it after disk I/O. Removing the relationship makes the image inaccessible. Orphaned cached bytes remain in the private local directory; physical retention/purge policy is outstanding for production.
- The preview offers a With photos filter, real photo cards, and a manually controlled gallery with thumbnails, keyboard arrows, Escape, and focus return. Full-image presentation retains provider pixels and visible staging disclosures; no AI alterations or invented room labels are applied.

## Not yet implemented

- Complete media coverage for all 491 demo records, responsive derivative generation, floor-plan classification, video, and exclusive-media ingestion. The verified local preview currently has seven galleries. Photo support is intentionally restricted to the observed demo media and storage hosts; approved production hosts require separate verification.
- Member, Office, OpenHouse replication, their independent checkpoints, or scheduled synchronization.
- Production quota accounting and retry/backoff scheduling. HTTP 429 or other failures stop this development importer and retain its checkpoint.
- Production D1/search index, maps/geocoding, five-borough boundary filtering, saved searches, alerts, tours, exclusive-source deduplication, or private sharing.
- Production legal/display review or live-feed approval. The demo banner, noindex headers, and local-only server prevent this preview from being presented as the finished public service.

Before production, review current provider agreements, complete the additional resource/media pipeline, verify coverage, and test updates/removals on approved data. Do not share the staging database between unrelated feed environments.

## Verification

The repository suite includes `worker/__tests__/mls-grid.test.ts` and `worker/__tests__/mls-grid-media.test.ts`. They test request mode, pagination credential boundaries, malformed data, visibility and private-field projection, transactional checkpoint rollback, deletion, unknown-value filters, media reuse/revision, safe credential-free storage redirects, private-media exclusion, rate-limit stopping, byte/download budgets, and media access revocation. Run `npm test`, `npm run typecheck`, and `npm run build` for the repository checks.

## References

- User-provided Best Practices Guide and Developer Checklist, read from Downloads on October 7, 2026.
- [MLS Grid API v2](https://docs.mlsgrid.com/api-documentation/api-version-2.0): pagination, source names, replication, and visibility removals.

The supplied PDFs are technical reference material. Their instructions to contact support, sign contracts, or configure third-party tools are not user authorization to perform those actions.

## Full listing preview (October 7, 2026)

Cards now link to `/listing/:source/:id`, which is also directly reloadable. The detail page includes the original description, a three-photo hero, complete local gallery, tailored fact groups and visual accents for houses, condos, co-ops, rentals, investments, commercial property, and land, plus searchable **All imported property details**. Raw numeric values remain available without rounding. This is the development field projection, not a claim that every permitted MLS/local field has already been integrated.

`refresh-details.mjs` refreshes the existing imported IDs in source-filtered batches, preserves the normal replication cursor, and does not store raw API records or signed media URLs. All 491 existing records were refreshed with the expanded development projection. It does not refresh the existing photo manifests; use the media importer for photo changes. Per-record obtainedAt is recorded by subsequent imports; legacy records without it explicitly show missing import time rather than inventing a timestamp.

The residential purchase calculator is interactive, with separate principal/interest, taxes, building charges, additional charges, home insurance, mortgage insurance, and assessment inputs. Unknown costs are explicitly excluded. The 6.5% starting rate is illustrative. Rentals, commercial listings, and land have their own cost/terms views rather than standard home-loan assumptions.

Tour requests offer a preferred date and half-hour time between 9 AM and 6:30 PM in New York time, up to 90 days ahead. The Node server converts dates with actual DST offsets and saves validated requests to the local `demo_inquiries` table. Message requests use the same local flow. These do not schedule an appointment, send email, or notify any agent. No read endpoint exposes inquiries. The local database remains ignored; use test contact data while evaluating this preview. A mailto action is offered only if the source's public AttributionContact is a valid email address; a brokerage telephone action uses supplied ListOfficePhone. No email address is guessed from agent names.

`optimize-media.py` produces aspect-preserving WebP card (720px), thumbnail (160px), and display (1600px) variants of existing local images. Run with a Pillow-enabled Python interpreter after media imports. Originals are retained. For 133 photos, originals total 29,999,943 bytes; card variants total 6,165,302 bytes (79% smaller), thumbnails 528,188 bytes (98% smaller), and display variants 19,530,522 bytes (35% smaller). These are measured byte savings, not measured consumer network timing. Gallery navigation decodes the next photo before switching, preloads adjacent images, supports keyboard controls, and respects reduced-motion preferences.

Read the [IDX display implementation review](idx-preview-display-review.md) for implemented boundaries and required live-launch work. The preview has not been approved or certified by either MLS.

The browser search defaults to the five NYC boroughs (199 records across all statuses and types in the current sample), while server-side maintenance can still access the full 491-record import. Borough filters recognize the actual OneKey county aliases; the source's original city/county values remain in the details. Commercial purchases and leases have separate decision sections and cost views. Listed lease prices are not assigned a monthly or per-square-foot basis from unrelated fields; the interface asks the consumer to confirm the quoted rate basis and period.

### Search customization verification

The October 7 personalized discovery change passed 60 Vitest files / 450 tests, `npm run typecheck`, `npm run build`, and syntax checks for the standalone preview modules. Browser checks covered live text filtering without submitting, filtered photo highlights and decoded images, page 3 of the 48-result layout, offset reset after narrowing filters, saved homes/searches after reload, explicit all-type/all-status URL restoration, tour requests from cards, and list/card layouts at 1280 px and 390 px. Larger pages fetch their media manifests in one batch. No dependencies were added. Existing Workspace build chunk-size warnings remain.

### Warmer consumer browsing — October 8, 2026

The preview now places compact search controls and photo cards before secondary personalization tools. Buyer/renter/commercial/investment/land headings and facts change with search intent. Cards support decoded inline photo navigation, retain readable broker/source/status/contact attribution, and link to the full property page. View settings and saved searches remain accessible in expandable controls.

A bounded demo backfill added 45 original photos: 11 for one rental, 2 for one commercial lease, and 32 across two multi-unit investments. One additional queried rental had no eligible photos. There are now 178 photos across 11 active NYC sample galleries. Originals remain unchanged; 534 local WebP derivatives cover card, thumbnail, and full-view sizes. The backfill accepts `MLS_GRID_MEDIA_TYPE` from the existing six property types and limits selection to NYC county aliases. It uses source ListingId values with the OneKey prefix when querying the feed; ListingKey is the internal record identity. Signed media URLs and credentials are never stored in the public projection.

Verification: 60 test files / 451 tests passed, type checking and production build passed, and the preview modules passed syntax checks. Browser checks included photo 2 of an inline gallery, buyer/rental/commercial/investment summaries, a rental detail with 11 photos, and mobile list/desktop five-column layouts with no horizontal overflow. Source field omissions and live-feed/display approvals remain unchanged. See `docs/property-search-competitor-experience.md` for sourced observations separated from design inferences.

### Portable branding and website integration — October 8, 2026

Brand settings now preview and persist a shared Search Brand Kit for standalone and embedded views, with validated colors, typography, corners, photo spacing, service identity, presets, and JSON import/export. The kit is presentation configuration; it does not replace the Workspace Tenant Brand Profile or change MLS attribution. See ADR 013 and `docs/modular-property-search.md` for the integration contract and production requirements.

Full listing pages serve eligible source content and canonical/share metadata in the initial HTML, and return 404 on unavailable listings. `/embed-demo` runs the search inside a host page using the origin-checked iframe loader. Browser checks verified saved-kit reload, listing-specific title/canonical/photo metadata and copy-link behavior, mobile layouts without horizontal overflow, embedded filtering, and automatic height reduction from 3237 to 2055 pixels when switching the demonstrated buyer search to one rental. All demo responses remain noindex.

Verification: 61 test files / 460 tests passed, type checking passed, and the production build passed. The existing Workspace bundle-size warning remains. Preview module syntax checks passed. Final local images are in `.mls-grid-demo/brand-settings-preview.png`, `.mls-grid-demo/brand-with-listing-preview.png`, and `.mls-grid-demo/embedded-search-preview.png`. No production deployment or public share-crawler test was performed.
