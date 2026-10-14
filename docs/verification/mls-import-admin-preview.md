# Live MLS import admin

October 13, 2026. Private deployment: 2d16a2a5-5eab-4636-8bc1-42bbc4dcdcc1.

Owner entry point: https://preview-search.primeamericany.com/admin (redirects to /ops/mls-sync).

The dashboard runs on the existing private Access host and reads LIVE_DB, the same D1 database bound as SEARCH_DB in the consumer production Worker. It therefore monitors real production feed storage independently of the consumer release. It is a feed operations panel, not a general brokerage administration system.

All dashboard, JSON status and asset paths require the configured feed operator through the existing Access verification. No new recipients, access permissions or public production routes were introduced. Mutations require a same-origin POST. GET status polling never invokes the MLS client or starts a sync pass.

The visible tab polls every 15 seconds, suppresses overlapping reads, pauses polling when hidden, and retains the last successful display during connection errors. UI uses textContent for live values. It shows primary replication phase, active lease/retry timing, unique source records, stored eligible NY listings, listings with photos, matched map locations, photo queue states, location-field backfill and statewide replay. Progress bars use known photo/retained-listing denominators; no invented overall percentage or completion ETA.

Migration0003 adds last_result and last_result_at to feed_state. Only a bounded controlled sync summary is saved, fenced to the current lease. Busy/backoff attempts do not overwrite the previous summary. Raw API records, tokens, signed pagination/media URLs and contacts are absent from status responses. Request and conservative byte counters match the importer's existing accounting windows; displayed guardrails are not a dollar-cost estimate.

Verification:
- 505 tests, 65 suites passed, including four new monitor tests covering owner protection, origin checks, read-only polling, sensitive-data exclusion, accounting and preserved failure summaries.
- Workspace and both search Worker typechecks passed.
- Workspace and production search asset builds passed; existing Workspace bundle-size warning remains.
- Independent review found no Required issues.
- Browser verified automatic timestamp/count updates, persisted HTTP400 diagnostic, retry time, last successful address-match summary and photo queue counts without clicking Run one sync pass.
- Actual 390px viewport has no horizontal overflow; viewport restored.
- Additive migration applied to the live search database; only the private staging Worker deployed.
- Live screenshot: /private/tmp/mls-import-admin-live.png.

Known importer condition remains tracked in GitHub issue19: the primary persisted catch-up request returns HTTP400 and initial reconciliation is incomplete. Location refresh and geocoder can progress independently; the dashboard deliberately displays these separately.

Operational note: aggregate counts scan the retained inventory and media state index while the panel is visible. Watch D1 rows-read usage as feed size or simultaneous operator sessions grow; no background polling runs from hidden tabs and no MLS requests result from dashboard refreshes.
