# Cloudflare ingestion, media delivery, and capacity research

Checked October 30, 2026. Primary-source research for the ingestion specification; proposals below are not deployed changes. Prices are USD, before tax, and must be checked against the account's actual plans, shared usage, and any negotiated contract before purchase or rollout. No credentials or signed MLS media URLs were accessed.

## Findings that change the specification

1. Separate source polling from gallery transfers; increasing consumer concurrency does not increase the MLS provider's quota. Keep the primary MLS replication traversal sequential, following its next links. Media jobs may overlap bounded network/storage work only through one authoritative source-budget admission mechanism.
2. Cloudflare Queues provides prompt background delivery without tying a gallery to the next minute's cron. Delivery is at least once, so the database must own deduplication and durable job state. Queues is a wake-up/delivery mechanism, not the source of truth for whether an image already exists. [Delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)
3. The current app's 1,000-transform monthly ceiling is its own setting, not the published Images allowance. Current Images documentation explicitly bills the Workers binding by unique source/parameter combinations per month, while also saying binding output is not automatically cached. Persisting derivative bytes in private R2 avoids repeated decoding and future binding calls. [Binding billing and caching](https://developers.cloudflare.com/images/optimization/binding/)
4. Do not enable caching in front of the authorization/eligibility entrypoint. Cache only an internal byte-serving entrypoint reached after the current permission check. Legacy Cache API is documented as unavailable behind Cloudflare Access, so a preview cache experiment must test the actual host. [Cache API availability](https://developers.cloudflare.com/workers/runtime-apis/cache/), [gateway/inner-entrypoint pattern](https://developers.cloudflare.com/workers/cache/examples/)

## Confirmed platform constraints

### Queues

- A successful small message normally incurs write, read, and delete operations. Paid Workers includes one million operations/month, then $0.40 per million. Billing chunks messages by 64 KB and counts retries as additional reads. Queue payloads should carry stable IDs/revisions and job kind, never photo bytes or signed URLs. [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/)
- Defaults are ten messages or five seconds before batch delivery; configurable batch size is 1–100 and timeout is 0–60 seconds. Explicit per-message acknowledgments avoid retrying successful items when another item fails. Delayed retries allow cooldown handling without keeping a Worker sleeping. These are configuration bounds, not a hard delivery-latency SLA. [Batching, retries, delays](https://developers.cloudflare.com/queues/configuration/batching-retries/)
- Configure a DLQ. Without one, messages that exhaust retry allowance are deleted. Persist failed jobs in D1 and expose re-drive controls; a DLQ itself is not indefinite archival. [DLQ behavior](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)
- Paid queue retention defaults to four days, configurable to fourteen; message size max 128 KB, retry delay max 24 hours, consumer wall time max fifteen minutes. Limits permit up to 250 concurrent push consumers, but that is not a suitable starting configuration for a rate-limited MLS integration. [Queues limits](https://developers.cloudflare.com/queues/platform/limits/)
- Consumer autoscaling adjusts after completed batches. A large slow batch can delay scaling; set an explicit small maximum concurrency and use short jobs. [Consumer concurrency](https://developers.cloudflare.com/queues/configuration/consumer-concurrency/)

### Workers and D1

- Workers have 128 MB isolate memory and six simultaneous outgoing connections per invocation. Queue and cron wall time is fifteen minutes; `waitUntil()` only extends HTTP work thirty seconds after response/disconnect. A cron running more frequently than hourly has a thirty-second CPU budget; network waiting is distinct from CPU time. Use the granular limits page rather than assuming a pricing-page summary overrides it. Start with bounded page bodies and media streams; do not simply change 100 expanded rows to 1,000 without profiling heap/CPU/payloads. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Each D1 database executes queries serially. More Workers can increase its queue rather than write throughput. `db.batch()` reduces round trips and counts as one invocation query, while each statement still obeys its limits. Relevant ceilings: 100 bound parameters, 2 MB row size, thirty-second query duration, 10 GB database size. Benchmark query SQL time and invocation overhead separately. [D1 limits and throughput](https://developers.cloudflare.com/d1/platform/limits/)
- D1 Paid includes 25 billion rows read and 50 million rows written/month, then $0.001/million reads and $1/million writes; storage beyond the first 5 GB is $0.75/GB-month. Rows scanned count even if few are returned, and indexes add writes. Capture `rows_read`, `rows_written`, SQL duration, database size, and actual shared-account utilization. An aggregate scan is not “one cheap read” merely because it returns one number. [D1 billing](https://developers.cloudflare.com/d1/platform/pricing/)

### Durable coordination

A Durable Object can hold strongly consistent state for a natural coordination unit. For this integration that unit is the provider subscription/quota identity, not the entire public search service. The public read path must not route through it. A DO remains optional if equivalent global admission can be proven using atomic D1 reservations and narrowly scoped locks; retaining the existing long feed lease for photo work is not equivalent separation. [DO model](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)

Cloudflare cautions against a global singleton for all application traffic. A low-rate provider-specific coordinator is a narrower proposed exception whose capacity should be tested, not a pattern for routing thousands of consumer requests. Persist pacing, quota reservations, backoff, and dispatch priority; return a permit or a future due time, rather than hold long image transfers inside the coordinator. [DO design rules](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)

DO Paid includes one million requests and 400,000 GB-seconds/month; overages are $0.15/million requests and $12.50/million GB-seconds, with billing rounding. SQLite storage includes 25 billion read rows, 50 million write rows, 5 GB-month; overages are $0.001/million reads, $1/million writes, $0.20/GB-month. Alarms are requests, and setting one writes a row. Avoid a busy-waiting object and measure wall-time duration, not only CPU. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Each DO has one alarm, with at-least-once execution and automatic exponential retries. A persisted schedule can multiplex due work through that alarm. Use alarms for a bounded coordinator wake-up where needed; do not assume exact-millisecond execution. [Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)

## Recommended minimal architecture

This is an engineering proposal, contingent on the MLS constraints research and a private-preview spike:

- **Sequential source dispatcher:** one primary replication cursor owner; small transactional fact/removal commits; cursor advancement does not wait for any photo or transformation. A separate manifest task may use supported projections, but partial responses must not overwrite a complete public record or delete an unrequested Media collection.
- **Durable work/outbox in D1:** write jobs atomically with record/manifest changes. The queue publisher retries unsent outbox rows. A process crash between D1 commit and queue send cannot lose a cover request. A queue duplicate cannot start another download of the same source/media revision.
- **Independent cover and gallery delivery queues:** tiny identifier-only messages, including revision and correlation ID. A gallery consumer claims a due job, then resolves its source URL just in time through the sequential MLS API dispatcher. Source URLs remain invocation-local. Grant source download admission before making any external request; check the manifest again when committing results.
- **One source admission governor:** request slots, rolling request/byte accounting, and provider backoff cover all relevant operations until quota scope is confirmed. Reserve capacity for deltas/removals. Give galleries bounded priority over bulk work, retain a floor for missing covers, and age old jobs to prevent starvation. A separate queue alone provides no cross-queue fairness. Do not issue permits far into the future; prioritize before granting the next slot.
- **Local transformations:** once an original is safely retained, produce bounded card sizes and the first useful gallery display size without consuming MLS request capacity. Run these jobs independently of the source dispatcher and source throttling. Keep original-quality viewing available from our retained copy.
- **Short job ownership:** a feed cursor lease protects only the primary traversal. Per-media revision claims fence photo writes. Source permits are short and do not hold a whole-gallery lock. Recovery handles claimed-but-stuck jobs conservatively under the provider's single-use media rules.

Start with two or three bounded media consumers and low queue batch sizes; raise toward ten only when measured queue wait is high, source permits remain available, and D1, CPU, and memory remain healthy. This is a tuning range, not ten persistent paid machines and not ten independent copies of the replication loop. If global permits are unavailable, enqueue/defer durably with a due time rather than spin retrying every second. A source cooldown must not block ready R2 byte reads or local derivative generation.

## Cache and revocation requirements

Workers Cache operates in front of entrypoints, so a hit can avoid the entrypoint code. Disable cache on the outer gateway. After authentication and a current eligibility/manifest check, a private internal entrypoint may cache immutable retained bytes by media-revision hash plus a fixed derivative profile. Partition keys by dataset/environment and any access scope. Do not forward credentials into a shared inner cache key; do not expose that entrypoint through an unchecked public route. Verify pinned Wrangler/schema support and preview behavior first. [Workers Cache model](https://developers.cloudflare.com/workers/cache/), [authenticated gateway pattern](https://developers.cloudflare.com/workers/cache/examples/)

Keep browser responses permission-safe, including `304` responses, and recheck before serving in-flight transform/download results. A revoked manifest must deny future responses even if private R2 originals or internal byte-cache entries still exist. Never use `stale-if-error` to serve through an eligibility lookup failure. Cache purge helps reclaim stale bytes but does not replace authorization. Whole search-response caching needs generation-safe invalidation of changed/removed listings and separate testing; it should not be bundled casually into the first ingestion fix. These are proposed safety invariants, not Cloudflare's guarantee of MLS compliance.

## Prices and cost model

Cloudflare Images Free includes 5,000 unique transformations/month; above that new transformations fail rather than generate an overage bill. Paid Images charges $0.50/1,000 beyond 5,000. R2-sourced images incur transformation pricing, not Images-hosted storage/delivery pricing. Fixed source+parameter pairs are counted once per calendar month; changing width creates another pair. The current 1,000-attempt app ceiling counts calls conservatively, not billing-unique pairs. [Images pricing](https://developers.cloudflare.com/images/pricing/)

R2 Standard costs $0.015/GB-month, $4.50/million Class A operations, $0.36/million Class B operations; included monthly usage is 10 GB, one million A, ten million B. Egress is free, but request/compute costs remain. Billing rounds usage units upward. Use Standard for hot listings; Infrequent Access has retrieval fees and does not receive these free allocations. [R2 pricing](https://developers.cloudflare.com/r2/pricing/)

Workers Standard has a $5 subscription, ten million requests and thirty million CPU milliseconds/month included, then $0.30/million requests and $0.02/million CPU milliseconds. Logs have a separate allowance/overage and announced December 1, 2026 pricing changes; recheck before a later rollout. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

The 46,532-listing input was supplied by the lead agent from the owner admin snapshot at 9:09:52 AM ET on October 30; it was not independently re-queried in this research task. Current app settings were inspected in [wrangler.jsonc](../workers/property-search/wrangler.jsonc), [sync.mjs](../workers/property-search/src/sync.mjs), and [image-variants.mjs](../workers/property-search/src/image-variants.mjs).

The following are calculated planning scenarios, not account bills. Allowances are assumed available, operations/messages small enough for one billing chunk, and purchased plans activated where needed. Retry overhead, tax, shared Workspace consumption, feed fees, external maps/geocoding and other services are extra.

| Scenario | Inputs | Approximate consequence |
|---|---|---|
| Cover bootstrap | 46,532 covers × two new widths = 93,064 transforms | $44.03 Images usage before rounding; fixed-width persisted derivatives do not need regeneration each calendar month. |
| Modest ongoing work | 20,000 newly needed source/width pairs/month | $7.50 Images usage if the full 5,000 allowance is otherwise available; this is an assumption about changes/viewing, not a forecast. |
| Keep 1m originals | Assumed mean 0.5 MB = 500 GB | About $7.35/month Standard storage if all are retained for a full month and other usage is absent. Source transfer quotas determine feasibility/time separately. |
| Transform 1m photos twice | Two million new source/width pairs | About $997.50 Images usage in that month; exceeds the $200 target before other services. Do not precompute every possible gallery size. |
| Deliver 1m queue jobs | Three million ordinary queue operations | About $0.80 over the one-million allowance; retries and larger messages add operations. |
| Continuous uncached stress | 1,000 concurrent users, ten requests/minute each, 30 days; 10 ms CPU/request; one R2 GET/request | 432m requests/month: roughly $217.40 Workers + $151.92 R2 reads, before storage/Images/D1. Not a traffic forecast; it disproves a blanket $200 guarantee for continuous concurrency. |

A plausible low-traffic cover-bootstrap envelope is approximately $50–$80 infrastructure for that month **if** shared included usage remains available, total Standard R2 storage stays around 50 GB, source/queue traffic stays modest, and a small operational reserve covers overhead. This is conditional arithmetic, not a price commitment. The parent specification must keep the cost envelope tied to measured traffic and account usage rather than “number of users.”

Define `infrastructure_budget = 200 − confirmed_feed_fees − other_included_services − applicable_tax_reserve` if $200 is the total monthly ceiling. If the feed itself costs $200, there is no $200-total infrastructure solution without changing the scope or budget. The owner's report that OneKey supplied access without a fee must be confirmed through the agreement/invoice; do not invent an MLS charge.

Use separate budgets for one-time cover warmup and steady-state changes. Initial proposal: reserve infrastructure headroom and stop optional gallery prewarming/extra variants before exhausting it, continue safe metadata/removal checks, serve already generated card variants, and expose the pause reason in admin. A dashboard alert is not a hard billing cap. Prove abuse controls and durable admission limits; Cloudflare usage can still incur charges for requests already received. Never replace every card's small derivative with a large original automatically when a budget pauses.

## Acceptance evidence needed before implementation sign-off

- Account plan and shared allowance usage, current R2 bytes/mean/p95 original sizes, D1 size/write amplification, and source quota interpretation recorded.
- Trace a gallery request's queue wait, provider admission wait, provider HTTP duration, R2 commit, derivative duration, and browser first useful photo separately.
- Run duplicate-delivery, missing-outbox-send, stale revision, permission revocation, source `429`, expired URL, exhausted transform budget, D1 overload, and queue DLQ tests.
- Show source writes/deltas continue while gallery storage/transform consumers are delayed or failed.
- Benchmark short network/storage concurrency before raising it. Define consumer-facing p95 targets as our acceptance goals under stated workload/healthy-provider conditions, never as promises guaranteed by Cloudflare queues or edge geography.
- Measure the actual protected preview and later public host. Legacy Cache API and new Workers Cache are different products; do not claim an Access-protected cache worked based solely on localhost or documentation.
