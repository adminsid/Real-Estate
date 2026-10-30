# Live synchronization recovery

October 27, 2026. Private preview deployment: `d1177af7-6856-49b5-bafb-f9bf6eda117e`.

Scheduled synchronization was already configured. The `/ops/mls-grid` page incorrectly hardcoded a synthetic dataset and disabled synchronization. The real importer was returning `reconciliation_required` after the six-day safety threshold: MLS GRID removes denied/deleted records from its change feed after seven days, so simply resuming the expired cursor could retain withdrawn data.

The connection page now reports its actual dataset and sync configuration, separates scheduling from inventory health, and links the owner to the live import panel. Fresh reconciliation starts automatically when a checkpoint exceeds the safety window. Existing cached facts and photo state remain while a new permitted marketed-inventory traversal records membership. Unchanged source versions still record membership. Unfiltered catchup starts five minutes before the fresh traversal began, rather than replaying years of historical modifications. Only after both traversals finish does the importer prune absent cached listings/media, at most 100 listings per pass. R2 originals remain private, and version tombstones remain. Public readiness stays closed throughout snapshot, catchup and pruning. The final freshness timestamp is the actual catchup completion time, not the cleanup time.

This release includes the previously pending smart-import changes: up to three feed pages per pass, up to 96 photo attempts, three pipelined download/storage jobs, globally serialized budget reservations and request starts, active NYC priority in queue selection and inside returned batches, missing covers first within each group, bounded cooldowns, success/byte telemetry and timestamp-based offset recovery. A dedicated traversal watermark prevents catchup recovery from jumping to an initial snapshot's newer maximum. Existing request, byte, retry and 150-second run limits remain. This is not approval for an under-24-hour full media import.

Migrations0006 and0007 applied successfully before deployment; migration0005 indexes were already present and are now committed with their implementation. No public Worker deployment, source allowance increase or Access policy change occurred.

Verification:
- All 527 tests in 69 suites passed; Workspace and both search Worker typechecks passed; Workspace and production search builds passed. Existing Workspace bundle-size warning remains.
- Independent review found no remaining Required/Critical findings and independently ran 42 import/reconciliation/production tests.
- Live state changed from `catchup / reconciliation_required` to a new `initial` traversal with a fresh generation and start time.
- At 2026-10-27T08:53:18.825Z (4:53AM ET), last completed pass: status ok, 3 pages, 300 source records, 96 attempted/saved photos, 28,620,076 saved photo bytes, no recorded failure. Fresh membership contained 799 listings. Initial reconciliation was still incomplete.
- A preceding completed pass independently logged 3 pages, 300 records and 67 saved photos. Busy cron invocations do not start concurrent replication work.
- After refreshed owner sign-in, the live connection page showed "Live OneKey inventory · private review" and "Live synchronization: Enabled." The admin dashboard showed an active pass, outcome ok for the preceding pass (300 records / 89 saved photos), three concurrent downloads, and the active-NYC priority. Screenshot: `/private/tmp/live-sync-enabled.jpg`. Backend progress was independently verified through D1 aggregates and sanitized Worker logs.

References: https://docs.mlsgrid.com/api-documentation/api-version-2.0.md (replication, removals and media), https://docs.mlsgrid.com/ (provider limits).
