# Independent ingestion private-preview verification

November 13, 2026. This records a private-preview deployment and bounded real-data canaries, not public-release or performance sign-off.

## Released implementation

The owner approved the [specification](../mls-ingestion-performance-spec.md). Implementation decisions and recovery are recorded in [ADR 018](../adr/018-independent-listing-and-media-ingestion.md) and the [cutover runbook](../operations/independent-ingestion-cutover.md).

- `57a5f88`: independent facts/components, subscription dispatch authority, durable outbox/queues, prepared-image work, card summaries, progressive viewing and admin panels.
- `4fc9508`: canary hydration continuation correction, bounded demand-priority derivative publication and demand cleanup.
- `d51f923`: local derivative publication no longer delays the next original transfer; bounded parallel R2 recovery checks reuse exact-revision lookups.

Final preview Worker version: **35aafdcc-4185-4d1c-b7aa-be047fb565dd**, route `preview-search.primeamericany.com`, every-minute cron, three producer queues and gallery/cover/variant/DLQ consumers. The live search database and private R2 originals are reused; Workspace and synthetic storage are unchanged. Public consumer configuration is prepared but has not been deployed or opened.

## Cutover and live state

The predeployment read found 45,767 retained marketed NY listings and 45,712 with a ready original, with no feed failure. Counts change as the live feed changes. The database occupied about 819 MB before the additive migration.

The old writer had no active lease when the maintenance fence was acquired. Migration 0010 applied successfully (11 commands, about 1.83 seconds reported by D1). The new Worker was deployed while that lease remained held. Guarded ownership transfer preserved precise cursors, the completed reconciliation, original hashes, request/byte counters and active pacing/backoff. No bootstrap restart or second traversal was initiated. Independent mode and a released primary lease were verified afterward.

Primary source checks succeeded while gallery originals were being downloaded: checks at 12:00, 12:01, 12:02 and 12:03 UTC remained in delta mode. The 12:01 check applied one source record during the first gallery's transfer. No photo transfer held the primary lease. Provider REST and media attempts used the same durable accounting authority; observed successful redirects were HTTP 307 followed by HTTP 200.

Images transformation-only activation was completed personally by the owner and its active subscription confirmation was inspected. No Images/Stream hosted-storage allowance was selected. The app limits preparation to 100,000 attempts/month; account-wide usage, other services and tax remain separate from that bound. Original provider concurrency and conservative request/byte ceilings were not increased.

## Canary findings and corrections

The first deployment exposed a hydration continuation edge case: a `$top=1` lookup can produce a continuation link even for a single identified property. The strict one-listing hydration validator correctly refused that response. A regression fixture reproduces it. Hydration now uses the previously established 100-row request shape while still accepting at most one matching source/ListingId/ListingKey and no continuation. The failed cover jobs retain their ordinary one-hour retry times; they were not force-retried with new signed URLs.

The first successful cold gallery began with one retained original and finished with all 16 originals ready, **87.023 seconds** after durable demand admission. The owner browser observed the open viewer grow through 11, 12 and 16 photos without reloading. Pointer and keyboard navigation worked; closing restored focus to the replacement “All 16 photos” button. The source watermark continued independently. This sample did **not** meet the proposed 60-second healthy cold-gallery target; approximately 7.56 seconds was its provider metadata response alone, and the trace also identified avoidable local publication waits.

The final optimization tracks derivative publication with the queue invocation's `waitUntil` after committing its durable outbox row. It does not hold the next original transfer. A stalled-publication regression verifies this behavior. Exact-revision R2 recovery HEADs run in drained batches of four and are not repeated within the same invocation. This changes local I/O scheduling, not provider concurrency or cooldowns.

After the final deployment, a second listing grew from one original to all **18 originals in 71.383 seconds** after demand admission. Its viewer showed “All 18 photos,” navigation and a full-window image with the OneKey watermark visible. Different properties/photo sizes are not a controlled benchmark or percentile evidence; this second sample also exceeds the proposed 60-second target. Further latency work and source measurements remain a release gate.

At the final 7:12 AM ET owner-dashboard check, both gallery jobs were ready, six cover jobs were ready, 60 cover jobs were waiting to retry, and **1,694 variant jobs were ready**. The primary feed completed its 7:12 check successfully and applied one record. There was no recorded source credential/media circuit failure. The displayed source usage was 171/6,000 hourly requests and 1,916/35,000 daily-window requests, with about 0.34 GB in the daily byte window. These are app accounting windows, not an account bill. Public search was separately rechecked and still returned its preparation **503**.

## Validation

**563 tests in 73 suites passed**, plus Workspace typecheck, both search Worker typechecks, Workspace production build and production search asset build. Preview Wrangler dry runs succeeded. The existing Workspace bundle-size warning remains unrelated. Independent review found no remaining blocking defect after fixes for post-wait admission, component/demand fencing, retained-original recovery, backoff preservation, scheduling deferrals, outbox recovery and derivative priority.

Regression coverage includes omitted/empty/malformed expansions, same-version hydration, stale versions and removals, tied/fractional cursors, minute-boundary scheduling, all four quota reserves, pre-dispatch uncertain intent, changes during pacing, retained R2 success, duplicate claims/publication, ten normal budget deferrals, media vs REST credential circuits, expired/reopened demand, source-version races, variant reactivation, bounded card DTOs, prepared-image fallback and stalled derivative publication.

Screenshots were captured as local owner-review artifacts, not committed MLS image fixtures. Credentials, signed provider URLs and raw restricted source payloads were not retained in the verification report or Git history.

## Remaining release gates

Cover-size warmup continues asynchronously. The first observed preparation snapshot reached 929 ready variant jobs with more queued; this is neither complete cover coverage nor an ETA. The preview keeps its existing read fallback during warmup (`PREPARED_MEDIA_ONLY=false`); the prepared public configuration requires ready images and has no Images or provider credential binding.

The 24-hour observation after the final deployment, classified source-photo exceptions, geographic/mobile byte and latency measurements, 1,000 cached-visitor isolated capacity test, cost review, relevant provider clarifications and display review have not been signed off. No public-release flags were enabled. The unrequested full-gallery backlog remains intentionally on demand; this deployment does not claim every source photo has been downloaded or that all performance targets have passed.
