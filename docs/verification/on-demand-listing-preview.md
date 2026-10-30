# On-demand listing enrichment — private preview

October 27, 2026. Deployment: `a5bb9c1e-4e4a-43d9-b4d4-c184f38e445c` to `prime-property-search-staging` / `preview-search.primeamericany.com` only. Additive search database migrations 0008 and 0009 applied successfully before deployment. Public release permissions remain disabled.

Search facts and the existing allowed property details stay in the local replica. Feed pages commit before requested galleries or covers. Preview batches can process six pages instead of three; background downloads now target one cover per listing without a photo. Existing gallery files are retained. After reconciliation, new feed checks become eligible each minute rather than every fifteen minutes.

A listing page or gallery visit requests enrichment through an origin-checked POST. The 500-entry durable queue coalesces requests, preserves ordering, enforces source cooldowns, and is consumed by the existing scheduled importer. The provider token and signed media URLs never enter the queue or consumer API. All work uses the existing global lease and request/byte budgets. A quarter of each photo allowance remains available for missing covers.

Verification:

- `npm test`: 537 tests, 70 suites passed.
- `npm run typecheck`, `npm run search:typecheck`, `npm run search:typecheck:production`: passed.
- `npm run build` and `npm run search:build:production`: passed. The pre-existing Workspace bundle-size warning remains.
- Current official Workers type definitions (5.20261027.1) and MLS GRID media/replication documentation checked; Worker environment declarations regenerated from Wrangler configurations.
- Regression coverage includes repeat visits, cooldowns, global admission cap, removals, requested-gallery priority, unchanged replication watermark, cover-only background downloads, primary facts before media, minute-level delta eligibility, in-flight loading state, and newly requeued requests surviving cleanup.
- Owner browser opened the real Queens listing `KEY126205093`, initially 3 of 12 public photos ready. The page displayed its queue status and D1 showed exactly one demand entry. Admin displayed the pending gallery count without requesting provider data itself. The first new scheduled pass completed six pages / 600 listing records with 48 covers saved and no recorded failure, compared with three-page / 300-record passes before the change. The next scheduled pass completed the request: all 12 photos were retained and appeared automatically in the open viewer without a reload. D1 recorded completion about 2 minutes 45 seconds after the visit (including waiting behind the existing import). That pass processed 600 records, saved 87 photos, and recorded one completed on-demand gallery with no feed failure. A subsequent reload reused the 12 ready photos. Full-window navigation and normal focus return to “All 12 photos” were checked; a fallback handles the original trigger being replaced during enrichment. Screenshot: `/private/tmp/on-demand-listing-gallery.png`.

Limitations: Initial inventory reconciliation is still incomplete, so this is not a public-readiness sign-off. Requested galleries are asynchronous and can wait behind a running pass, source throttling, or the conservative one-hour media regeneration cooldown. A gallery exceeding a pass allowance may need a later permitted refresh. “All photos” means source-supplied public media only. Image optimization retains the existing monthly transform cap and original-image fallback; no new paid product was provisioned.
