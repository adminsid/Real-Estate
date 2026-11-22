# New listing delivery — 2026-11-15

Deployed to private preview Worker `prime-property-search-staging`, version
`f1fb3064-4158-4134-b3cc-c3003752b064`.

## Observed source flow

The live replica is caught up in independent delta mode. Inspection found 60 core
requests in the preceding hour, no outstanding feed cursor, no source backoff and
no recorded failure. After deployment, last completed sync was
`2026-11-15T14:28:02.897Z`, with initial replication complete and no source failure.
The paid Images counter stayed at 77,332. The cover queue had seven retry-wait
jobs and no unpublished warmup backlog at inspection.

Listing facts already commit before photos. A regression confirms a new core
record appears in search with an empty gallery; photo readiness is only required
when the consumer explicitly chooses the photo-only filter.

## Changes

- Open search pages check `/api/search-updates` every 30 seconds while visible.
  This endpoint reads one local feed checkpoint, never MLS GRID or photo storage.
- Changes show an unobtrusive notice and “Show latest matches” action. It keeps
  filters, selects Newest, returns to page one, then focuses the result heading.
  Existing cards, map position and open galleries are not rearranged by polling.
  With bottom controls selected, the notice joins that dock; top controls and
  map-only layouts also expose it. Monitoring restarts after a back-cache return.
- This is a feed-wide change notice, not a claim that new properties match a
  specific neighborhood. Full result queries run on user action, not each poll.
  Hidden pages skip checks; failures back off and authorization failures stop.
- An opaque checkpoint includes existing precise watermarks and pagination state,
  so tied-timestamp pages are distinguishable without exposing source cursor URLs.
  It is captured before search statistics and records, preventing a concurrent
  commit from concealing a new arrival behind an already-current token.
- Same-day Newest ties use the validated MLS `OriginalEntryTimestamp`, followed
  by descending ID when missing. A later price/status edit does not make an old
  original entry newer. This field is retained on future source updates; no full
  inventory replay was launched to backfill older stored records.
- Newly marketed covers are promoted in future outbox publication, leaving one
  slot for oldest eligible work. The query uses the existing due-job index and
  checks current revision, claims, backoff and send leases. Already-published FIFO
  messages are not reordered. This does not guarantee immediate cover delivery.

## Verification and limits

597 tests / 78 suites passed. Both search typechecks, asset build, JavaScript
syntax checks and Worker deployment dry run passed. Independent review findings
were corrected. Tests cover publication before photos, cover priority/fairness,
more-than-one-page same-day arrivals, checkpoint races, tied timestamps, hidden
tabs, changed filters, authorization/backoff and local preview asset delivery.

No database migration, new recurring service, source polling increase, source
quota change, image transformation activation or public release was introduced.
The one-minute source poll and all existing source limits remain in place.

Zero-delay publication is not promised: MLS GRID publishes a replicated feed and
must first ingest the listing from OneKey. Its docs describe minute-by-minute
upstream checks subject to MLS restrictions, and distinguish GRID's modification
time from the originating MLS time. Normal downstream delivery targets the next
successful local poll, then the visible browser's next checkpoint check; source
delay, backoff or outages can extend that. See [MLS GRID documentation](https://docs.mlsgrid.com/).
