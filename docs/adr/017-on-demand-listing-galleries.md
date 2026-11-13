# ADR 017: Prioritize listing coverage and enrich galleries on demand

Accepted for private preview, October 27, 2026.

Search and listing pages continue to read the local, licensed D1 replica. The retained public projection already contains the allowed property details; delaying those details until a provider request would make the experience slower and less reliable. Every eligible listing can appear before its photos are downloaded. The source must still finish initial reconciliation before public release.

The preview importer uses `PHOTO_IMPORT_MODE=on-demand`. It commits up to six sequential 100-record feed pages before photos, checks deltas on a one-minute cadence after reconciliation, and postpones location replay until reconciliation completes. Background media work downloads at most one cover for a listing without a ready photo. Existing originals and optimized variants remain reusable. It does not delete existing galleries.

Opening a listing page or its photo viewer submits a same-origin POST to `/api/listing/{source}/{id}/enrich`. Search reads, SSR, link previews, and HEAD requests never enqueue work. A durable, globally bounded 500-row D1 queue coalesces visits. Recently completed requests have a fifteen-minute cooldown; pending requests retain their queue order. Completed entries are cleaned after that cooldown, pending entries after a day, and listing removal deletes its demand entry.

The existing scheduled importer consumes up to three requested listings per pass after primary feed work and before covers. A quarter of the photo allowance, capped at 24 downloads, is reserved for missing covers. The same replication lease, version guards, private R2 manifest checks, source pacing, byte reservations, and throttle backoff apply. On-demand lookups use the provider-supported ListingId filter and cannot change the global replication cursor. Consumers never get the provider token or signed media URLs. The public Worker needs no provider credential or new paid service.

This is asynchronous priority service, not a live API proxy. Requests wait behind the current import pass, source backoff, and the conservative one-hour media URL regeneration cooldown. A gallery larger than the remaining per-pass allowance can take another permitted refresh. All photos means all permitted public photos supplied in the source manifest, not private media or unavailable source content.

The client shows cached facts immediately and polls the local listing API every five seconds, for at most three minutes, only while visible. It stops on cooldown, completion, unavailability, or errors. Photo updates preserve the current gallery photo and do not rebuild the details form. A newer property version refreshes displayed facts. A source permission removal invalidates local listing/media reads and clears the open details view when observed. Owner operations show pending gallery demand and source cooldowns.

Public release gates remain unchanged. No additional Workers, tokens, media hotlinks, or quota exceptions are introduced.
