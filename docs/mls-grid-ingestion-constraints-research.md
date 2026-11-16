# MLS GRID ingestion and media constraints

Checked **October 30, 2026** against MLS GRID's public documentation and the current guides linked from its [official resources page](https://www.mlsgrid.com/resources). This is technical due diligence for a proposed fix, not evidence of a quota exception or a substitute for Prime America's executed OneKey license and authorized-field inventory. No production requests, credentials, or private signed media URLs were used for this research.

## Verified source requirements

### API shape and replication semantics

The [API v2 documentation](https://docs.mlsgrid.com/api-documentation/api-version-2.0) establishes:

- Every query specifies one `OriginatingSystemName`.
- General page ceiling: 5,000 records; using `$expand` lowers it to 1,000. These are ceilings, not recommended payload sizes or throughput guarantees.
- Top-level `$select` is supported; `$select` and `$orderby` on expanded resources are not.
- Supported Property filters include `ListingId`, modification time, status, type, office ID and viewability. `ListingKey` is not in the searchable-field list; preserve prefixed provider identifiers for lookups.
- Follow returned `@odata.nextLink`. Default ordering is by `ModificationTimestamp`; recovery can resume using received progress.
- Incremental replication omits the bootstrap viewability filter and tracks the greatest received timestamp, including excluded records.
- `MlgCanView=false` requires removal. Those tombstones disappear after seven days.
- Expanded resources are replacement sets: missing prior entries must be removed. Changed photo manifests/revisions are signaled by source timestamps and media identities.
- Media downloads require the assigned OAuth token in `User-Agent`.

These limits do not establish that 1,000 expanded records will fit this application's current 8 MiB decoded-response cap.

### Sequential cursor and source budgets

The official [Best Practices Guide 2.1](https://static1.squarespace.com/static/5908cde79f745622b6a59828/t/69fb84676b4a2b6031e7f25c/1778091111359/MLS%2BGrid%2B-%2BBest%2BPractices%2BGuide%2B2.pdf), pages 2–4, directs consumers to:

- Keep replication sequential rather than split it between concurrent threads/processes; avoid timestamp-range partitions.
- Resume from progress instead of restarting an interrupted import; prefer `in` over `or` for multi-record lookups.
- Use compressed responses and avoid repeatedly downloading unchanged media.
- Stay within 2 requests/second, 7,200/hour, 40,000 in a rolling day, 4 GB/hour and 60 GB/day.
- Request an initial-import grace period from support **before** exceeding normal allowances.

The guide describes fifteen-minute replication as sufficient freshness, rather than requiring that interval. Its sequential rule explicitly concerns **replication requests**. It does not define whether every identifier-based hydration request is included, nor explicitly grant media-transfer concurrency. Serializing all MLS REST dispatch is a conservative design choice pending clarification; ten independent cursors are not an acceptable inference from the request-rate ceiling.

### Media delivery

The [documentation overview, Media Files and Service sections](https://docs.mlsgrid.com/) states that the API provides replication rather than direct real-time search; upstream changes are checked each minute unless restricted. Consumers must keep their own photo copies, not hotlink vendor URLs. Supplied URLs retrieve the highest source resolution. Since September 8, 2026, they are signed, single-use, unmodifiable, expire after one hour, and must not be cached for later use. Repeated download attempts and generating URLs to download the same media again during that hour can return 429. Bucket-to-bucket transfer is no longer supported.

**Important ambiguity:** the wording alternates between an individual media item and media for a listing. It does not unambiguously impose an hour-long ban on downloading a *different, never-downloaded* photo after downloading a cover. Nor does it clearly define recovery after a failed transfer, a request that timed out after dispatch, or URL retrieval without a download. Our current blanket parent cooldown is therefore an implementation policy, not a verified universal vendor requirement. The reviewed public pages do not separate API versus media-CDN quota accounting.

### IDX display and licensing

The current [IDX Rules, updated September 17, 2026](https://static1.squarespace.com/static/5908cde79f745622b6a59828/t/6ac3be89645b3e6537803175/1791213193923/MLS%2BGrid%2BIDX%2BRules.pdf), require refresh at least every twelve hours, address suppression where applicable, authorized public fields only, required attribution/disclosures, and a 2,500-listing search-result ceiling (map pins alone are treated separately). Confidential information cannot be exposed merely because the feed contains it. Source exclusions and sold/off-market displays have additional rules.

Rule 21 distinguishes prohibited data changes from display formatting, but the reviewed material does not explicitly settle every image transformation, crop, disclosure/watermark or derivative-retention question. Treat responsive resizing/re-encoding as a proposed display operation requiring verification against the executed license and OneKey requirements. Preserve originals, aspect ratio and visible disclosures; do not infer permission for content edits or AI alterations. “Thumbnail” in Rule 10 means a listing summary, not solely an image dimension. Current public rules were read; the executed agreement and OneKey field inventory were not revalidated in this research.

## Engineering consequences — proposed safeguards, not provider quotations

1. **One primary replication cursor.** Separate worker lifecycles must not create parallel pagination, time-range shards or independent watermarks for the same source/resource. A scheduler can prioritize work while retaining a single ordered source traversal.
2. **Global dispatch authority.** Every provider request, regardless of producer, needs one durable admission decision for pacing, requests, bytes and backoff. Count media attempts and redirects conservatively until MLS GRID confirms their accounting. API lookup workers cannot each enforce an independent “2 RPS” limit.
3. **Split projections safely.** A facts-only response is not a complete media manifest. Omitting `Media`, `Rooms` or `UnitTypes` must not delete retained sets, mark them hydrated, or cause a later same-version full response to be skipped. Track fact revision, manifest revision and hydration completeness separately. Missing eligibility fields must fail closed, not default to public.
4. **Version discipline.** Preserve source timestamp precision; do not round a replication cursor through millisecond-only `Date` serialization. Same-timestamp ties require idempotent replay/overlap and committed progress. Demand lookups never advance the primary cursor. Older responses cannot replace newer facts or permissions.
5. **Outage reconciliation.** A delta gap approaching the seven-day removal horizon requires a full membership verification plus changes/removals captured during the snapshot. Six days is our safety threshold, not an explicit source-mandated interval. Do not infer source completeness from a successful page or a familiar row count.
6. **Identifiers in durable queues, URLs just in time.** Persist source/listing/media revision, priority and retry state; acquire a bounded manifest shortly before transferring selected missing originals. Do not persist signed URLs in queues, logs, browser responses or retry records.
7. **Per-media attempt ledger.** Distinguish manifest/URL acquisition, download not attempted, dispatched, succeeded, definitively failed and outcome unknown. A ready revision is reused. A timeout after dispatch is not a safe immediate retry. Resetting every pending sibling's attempt age whenever a manifest is read is not equivalent to recording a real download attempt.
8. **Permission-safe completion.** A finishing download or derivative cannot reattach a revoked or replaced media revision. Cache/CDN optimization must have an explicit invalidation/eligibility design, including stale variants, conditional requests, revoked listing URLs and rollback.

## Questions requiring MLS GRID's written answer

Send these through the brokerage's authorized support process; this research did not send a message.

1. After the cover was downloaded, may we immediately fetch the same Property again and download only *other, never-downloaded* media revisions? Is the one-hour enforcement key the media item/revision, URL, parent listing, account, or another scope?
2. Does requesting a fresh expanded manifest without using its media URLs start any media cooldown? What are permitted recovery steps after an unused expired URL, an HTTP failure, or an indeterminate timeout?
3. Do requests to `media.mlsgrid.com` and its approved storage redirect each count against the API request/byte ceilings? Are redirects separately counted? Which byte measure governs compressed REST responses and media?
4. May several photo transfers be in flight while starts remain globally paced, and what concurrency is approved? May identifier-based Property hydration be interleaved with a primary replication traversal? Are concurrent REST requests of any kind permitted?
5. Confirm the account-specific hourly/daily allowances, actual billing and any approved initial-import grace period. No exception or separate media allowance has been established here.
6. Confirm OneKey's current public field/media permission inventory and permitted responsive derivatives, including watermark/disclosure preservation and retention/deletion obligations. Public licensing documents are not proof of the executed account's exact entitlement.

## Capacity calculation to use in the specification

These are planning equations, not observed vendor service levels. Measure compressed/decoded REST bytes, source-photo sizes, redirects, retries, source response latency and local processing cost before substituting numbers.

- `Qfacts ≈ ceil(eligible_or_examined_records / measured_safe_page_size) + catchup_pages + retries`.
- `Qsource = Qfacts + manifest_hydration_queries + charged_media_requests + charged_redirects + retries`; which terms the vendor charges remains a clarification item.
- `Tsource ≥ max(Qsource / approved_request_rate, source_bytes / approved_byte_rate)`; also enforce rolling hourly/day windows. Local hashing, D1 commits, image transformation and scheduling add time beyond this lower bound.
- `Tmedia ≥ missing_original_bytes / approved_media_throughput`, additionally bounded by any applicable per-item cooldown and request quotas.
- Cover readiness, complete-gallery readiness and complete-index reconciliation are separate totals. A count of retained NY listings is not a verified total of the licensed feed. A consumer search's 2,500-match display ceiling is not a replication/storage ceiling.

The [Developer Checklist](https://static1.squarespace.com/static/5908cde79f745622b6a59828/t/69b06d3d543a533ae4460de4/1773169981903/MLS%2BGrid%2B-%2BDeveloper%2BChecklist%2B2.pdf) supports testing a separate replica/product and incremental downloads per resource. The [official resources page](https://www.mlsgrid.com/resources) links the current agreement, AI addendum, rules and guides; earlier locally supplied PDFs should not silently supersede newer public versions.
