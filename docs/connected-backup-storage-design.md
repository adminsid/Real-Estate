# Connected backup storage: R2 first

Design direction selected September 6, 2026 following the user's request to use Cloudflare storage. This document specifies the integration; it does not claim that a backup Worker, destination bucket or schedule has been deployed.

## Product choice

Use a dedicated private R2 bucket for SQL exports, media copies, configuration archives and recovery manifests. Keep it separate from the four application media buckets. R2 is object storage and exposes an S3-compatible interface, which is the useful storage abstraction here.

| Product | Role in this design |
| --- | --- |
| R2 | Primary backup artifact storage |
| D1 | Existing source databases; native Time Travel adds rapid database recovery, but is not a media backup |
| KV | Existing source data where required; do not use its eventually consistent reads as the authoritative backup completion ledger |
| Pipelines | Event ingestion and transformation into R2; not needed to capture full database/media backups |
| Hyperdrive | Connection pooling/caching for external PostgreSQL/MySQL; not backup storage |

A separate D1 backup catalog is unnecessary initially: each completed backup carries its own manifest in object storage, making recovery less dependent on another database.

## One module, replaceable storage

The owning apps keep their existing databases and buckets. A dedicated backup runner captures them; applications do not upload a backup during every business write.

The backup module owns capture orchestration, checksums, retry state and completion verification. Its storage adapter needs only immutable object writes, reads and paginated listing. Provider-specific credentials, bucket names and request signing stay inside that adapter. Use R2's native binding when running within the same Cloudflare account; an S3-compatible adapter can support R2 in a separate account or a future external destination. Do not implement unused provider adapters now.

The job runner can use scheduled Workers plus Workflows for resumable export/copy steps. Select execution limits and chunk sizes against measured data before enabling the schedule. The existing local recovery drill remains an independent validation tool and does not become evidence of a deployed scheduler.

## Artifact and completion contract

- Give every backup run a unique ID. Preserve its source capture timestamps and resource identifiers.
- Store objects under a run-specific prefix; never overwrite a `latest.sql` file. Retrying a run must compare existing metadata/checksums and fail on a conflicting payload.
- Copy media rather than merely recording live object URLs. Paginate the source inventory; the current reference-only scan is insufficient for whole-bucket coverage.
- Record source versions, byte counts and SHA-256 hashes for all artifacts. Include SQL, media, permitted configuration, and the coverage/exclusions for KV, Durable Objects and external providers.
- Write the final completion manifest only after every required artifact is acknowledged and verified. A failed/partial run must never be reported as a successful restore point. Keep the manifest small enough for bounded validation and shard large object inventories.
- Keep restore verification separate from capture completion: validate SQL integrity/FKs and media hashes in isolated targets, then test application recovery.
- Do not silently purge retained files from a runtime application. Retention and deletion belong to the backup administration policy.

## Protection and recovery scope

Use a private bucket with no public URL, narrowly scoped access and R2 bucket-lock retention rules. Use unique object keys because locks prevent overwriting protected objects. Align lifecycle expiration with lock duration. Management credentials can change lock rules, so administrative account protection remains necessary; a bucket lock is not an independently controlled copy by itself.

R2 protects copies from ordinary application failures and, with appropriate controls, accidental deletion. R2 in the same Cloudflare account does not provide independence from that account. R2 in a separately controlled account improves account separation, but both remain dependent on Cloudflare. Full provider-outage recovery therefore remains a separate acceptance gate; choosing R2 does not claim it solved.

Hourly capture, 30-day retention and restoration within one business day remain proposed starting targets, subject to cost, workload measurements and restore testing. They are not established guarantees. The user accepted manually exporting complete copies to an encrypted external hard drive as the initial independent-copy approach. Provide an authenticated complete-archive download with checksums and restore instructions; this download workflow is not yet implemented. A later automated external destination can use the storage adapter without changing business applications.

## Delivery steps

1. Inventory available R2 buckets/access and prepare a dedicated private destination with retention configuration.
2. Implement the backup module and R2 adapter with tests for interrupted writes, conflicting retries, partial runs and manifest verification.
3. Connect database exports, complete media enumeration/copy, configuration capture and explicit coverage for other state.
4. Run and restore one complete backup before enabling the schedule; validate retention controls.
5. Enable monitoring for failed runs and excessive backup age. Measure full application recovery against the proposed targets.
6. Add independent account/provider protection as a separately evidenced layer.

The R2 choice resolves the primary storage-product question. Provisioning, implementation, scheduling and recovery acceptance are still work to execute under the full delivery program.

## Primary references

- [R2 overview and bucket-scoped access](https://developers.cloudflare.com/r2/)
- [R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Workers KV](https://developers.cloudflare.com/kv/)
- [Pipelines](https://developers.cloudflare.com/pipelines/)
- [Hyperdrive](https://developers.cloudflare.com/hyperdrive/)
