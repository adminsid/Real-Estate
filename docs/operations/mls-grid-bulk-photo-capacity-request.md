# Temporary initial photo-import capacity request

Prepared October 14, 2026. Draft only; no message has been sent.

October 27 update: source allowances remain unconfirmed. Smart batching and fresh reconciliation are now deployed within the existing conservative limits; the request below remains a capacity proposal, not an approved configuration.

To: support@mlsgrid.com

Subject: OneKey IDX initial photo import — confirm media limits and temporary bulk allowance

Hello MLS GRID Support,

Prime America Real Estate is completing its approved OneKey IDX integration for primeamericany.com and its subdomains. We need to complete initial ingestion of all currently permitted listing photos within 24 hours, then maintain incremental updates. We will prioritize active NYC listings first.

Our latest inventory has approximately 1.03 million outstanding public media manifest entries across currently marketed New York listings. Initial listing reconciliation is still in progress, so this is a planning count rather than a guaranteed final total. Each original is stored privately; source media URLs are never displayed, persisted, altered or reused within their single-use window.

Please confirm:

1. Do the published 2 requests/second, 7,200/hour, 40,000/day and 4GB/hour limits apply collectively to Property API requests, signed media.mlsgrid.com downloads, and their approved storage redirects, or are there distinct media quotas?
2. Can you approve a temporary initial-import allowance? The known backlog requires at least 12 successful photo downloads/second for 24 hours, before failures or new photos. We propose capacity for 15 successful photos/second with headroom: approximately 1.3 million photo downloads/day, plus Property requests and approved redirect requests (potentially about 2.6 million HTTP requests/day where every photo redirects).
3. Please provide the allowed request rates, hourly and rolling daily totals, download byte limits, applicable hosts, duration, and any fees or subscription changes in writing. We will use sampled original-photo sizes to confirm the byte capacity required before starting the accelerated run.
4. If those rates are unavailable, is there an officially supported bulk-export or initial media delivery service with the same permission/removal requirements? We understand direct S3 bucket-to-bucket transfers are no longer supported.

Our importer keeps per-source pacing, request and byte budgets, permission checks, revision deduplication, removal propagation, one-hour URL retry rules and throttle backoff. We will not distribute requests across tokens to evade limits. Existing standard limits remain enforced until capacity is confirmed.

Thank you,
Prime America Real Estate

References: https://docs.mlsgrid.com/ and https://docs.mlsgrid.com/api-documentation/api-version-2.0.md
