# Connected workspace recovery runbook

This is an executable preparation and recovery procedure, not evidence of a completed full-service failover. Current measurements and blockers are in [the evidence ledger](connected-workspace-delivery-evidence.md).

## Capture

Use an account with read/export permissions. Create a restricted directory outside the repository (`umask 077`). Export each database with Wrangler's `d1 export --remote --output` using its owning configuration:

| File | Database | Configuration |
| --- | --- | --- |
| workspace.sql | re-workspace-db | real-estate/wrangler.toml |
| openhouse.sql | open-house-db | open-house/wrangler.toml |
| inventory.sql | listing_input | listing-input/wrangler.toml |
| hub.sql | prime-america-db | branding hub/wrangler.toml |

Treat export logs as confidential: they can contain signed download links. Retain timestamps and SHA-256 hashes. These sequential exports do not guarantee a cross-app point-in-time snapshot. For coordinated recovery, pause business writes or reconcile changes across the capture interval.

From Workspace run `python3 scripts/connected-recovery-drill.py PRIVATE_DIRECTORY --download-media`. It restores all four SQL files to isolated SQLite targets, checks integrity/FKs and downloads referenced R2 objects with hashes. Any failed restore/download exits nonzero. Review every failure; never call a partial manifest a complete backup. Folder placeholders are excluded. This does not inventory unreferenced bucket objects, KV, Durable Objects or external provider state.

Archive the four repositories' source revision and necessary uncommitted delivery changes, lockfiles, migration files, Worker configuration and deployment IDs. Store secret recovery material through a separately controlled credential system, never in repository docs or a public artifact. Inventory DNS/domain access, Cloudflare account recovery, central auth configuration and provider credentials.

## Protect and schedule

The primary destination is now planned as a dedicated private Cloudflare R2 bucket, following the user's Cloudflare storage preference. See [the storage design](connected-backup-storage-design.md). Implement capture and verification behind one backup module with a replaceable storage adapter. The R2 bucket and scheduled runner are not deployed yet.

Use bucket-scoped access, unique backup keys, bucket-lock retention and an aligned lifecycle policy. Protect administrative credentials separately from normal application access. A scheduled job must alert on nonzero exit, stale successful backup age or missing artifacts; a cron entry alone is not verification.

Hourly capture and 30-day retention are proposed initial settings, with a one-business-day recovery target to validate. `/tmp/cw-recovery` remains temporary. R2 within the application's Cloudflare account is not independent protection from account loss or a provider-wide outage; preserve that separate recovery gate and support a second destination through the adapter.

## Restore

1. Verify archive hashes and decrypt using independent credentials. Keep the source copy intact.
2. Restore to isolated databases and buckets, not production. Compare row counts, integrity/FKs and object hashes with the manifest. Bind staging Workers to these isolated resources.
3. Apply only missing migrations after comparing actual schema; Workspace's migration registry is behind its schema. Migration rollback must not erase business writes made after capture. Preserve posted ledger facts; use forward corrections.
4. Restore configuration and permitted secrets. Rebuild assets from the captured lockfiles and source. Validate active membership, private/public document boundaries and service bindings.
5. Reconcile source commands and downstream receipts across the capture interval before enabling replay. Do not resend a social post with an uncertain provider acknowledgment; inspect the recorded provider ID and final state first.
6. Verify a synthetic manual attendance journey, eligible listing import, deal close/correction, results CSV and private media with each supported role. Measure time to usable service, not just SQL import duration.
7. Switch traffic only after these checks; monitor errors, delivery backlog and recovery age. Record actual timings and losses against the agreed objectives.

A Cloudflare-wide outage also requires a separately reachable hosting/database adapter and DNS control. The current Workers/D1 bindings are not a verified alternate-provider deployment. Offline device capture offers limited continuity while infrastructure recovery is unresolved.
