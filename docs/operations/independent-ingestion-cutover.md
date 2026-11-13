# Independent ingestion cutover and recovery

This runbook applies only to `prime-property-search-staging`, its live search replica and private media bucket. Never use the Workspace database or synthetic staging database. Public search publication is a separate decision.

## Deploy

1. Pass repository tests, typecheck, build, both search typechecks, production search build and preview Wrangler dry run. Review migration 0010 and fault tests. Record the current deployment and a sanitized feed snapshot. Verify public search is still gated.
2. Create `prime-search-galleries`, `prime-search-covers`, `prime-search-variants`, and `prime-search-media-dlq` if absent. Do not change unrelated queues.
3. Atomically acquire a maintenance lease on `feed_state` only when its existing lease is inactive. Use a distinctive operator lease ID and ten-minute expiry, and verify the update changed one row. This fences the existing scheduler before the schema snapshot. If an import is active, let it drain; do not overwrite it.
4. Apply the additive live search migrations. The initial mode is `legacy`; migration copies pacing and active backoff. Ready manifests are backfilled only where retained media proves the old expanded import. No original files are deleted.
5. Deploy the preview Worker and verify its required bindings, route and every-minute schedule. It remains Access-protected. Verify the maintenance lease still belongs to this operation; renew it if deployment takes too long. A deployment failure does not authorize changing ownership.
6. Require the same unexpired maintenance lease when copying the greatest legacy pacing/backoff into `source_control` and setting mode `independent`. Release that exact maintenance lease only after verifying the mode transfer. These guarded statements are crash-safe: if release is interrupted, only the new authority can dispatch, and the primary poll waits for maintenance expiry. Keep cursors and `feed_budget` unchanged. Do not reset source progress or replay a second traversal.
7. Verify successive facts checks, queued cover/gallery/local-variant progress, permissions, shared usage, recovered originals and owner admin rendering. Requested galleries use one-message, zero-batch-delay delivery. Geocoding has its own short lease. Confirm Images plan activation and bound transform attempts before full cover warmup.
8. Observe at least 24 hours in private preview, classify cover gaps, measure actual image bytes and cold/warm network behavior, perform the isolated load/failure/rollback checks in the specification, and review budget/provider exceptions. Public deployment uses the prepared consumer configuration and its existing approval/display/freshness gates; this runbook never sets them to true.

## Stop and recover

Set mode `draining` first to prevent new source dispatch and job claims. Let current bounded requests and jobs drain; verify no live primary, location or job claim. Do not release a foreign lease. Preserve the shared ledger and unknown attempts: D1 and external fetches cannot commit atomically.

Keep the new permission-aware reader. Once metadata-only versions have been committed, a legacy binary may expose an unvalidated retained manifest or delete media on an unexpanded cursor. **Do not use a blind Wrangler rollback to the old importer/reader.** Prefer a forward fix with ingestion paused. Public freshness protection continues to close the service if its verified replica becomes too old.

Recover `downloading` originals by checking the exact revision's private R2 object and validated content type through the job processor. Never reset all attempt ages or regenerate single-use URLs just to retry faster. Unknown network attempts retain their reservation and retry protection.

Jobs in `dead_letter` are visible in the admin job panels. After diagnosing the failure, an owner can re-drive at most ten selected job IDs by moving them to `retry_wait`, clearing their claim/publication lease and failure counter, and preserving a provider-safe `not_before`. Do not change revision, source, listing or profile identity. Keep cooldown/account backoff intact; the dispatcher still validates eligibility and quota. Never purge DLQ messages as a recovery shortcut.

If a queue send succeeds but D1 acknowledgement is lost, its short send lease permits a duplicate delivery; idempotent claims prevent duplicate source work. Accepted waiting messages use a longer publication lease, while active claims shorten recovery to three minutes. D1 remains the source of truth after message expiration.

Before resuming, prove only one source authority is active, rolling usage and backoff are intact, exact cursor ordering is preserved and uncertain manifests remain hidden. A paused source and truthful admin status is safer than claiming an unverified rollback succeeded.
