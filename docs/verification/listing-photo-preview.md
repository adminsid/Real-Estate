# Listing photos and responsive viewer

October 13, 2026 (America/New_York). Private preview Worker deployment: `5644d5d4-71d4-477b-8b1e-09cc473b2067`.

Clicking a result-card photo or a detail-page photo opens a full-window native dialog. The complete photo is contained without cropping. Previous/next buttons, photo position, keyboard arrows/Home/End, horizontal swipe, an optional thumbnail strip, original-quality selection and close are available. Browser fullscreen is optional where supported; closing restores focus and page scrolling. Only adjacent photos are prefetched. Physical touch gestures and every native fullscreen implementation have not been tested.

Original MLS files remain in R2. Fixed WebP variants cover thumbnails (160px), responsive cards (480/720/1080px) and larger photos (1600/2560px). Gallery selection accounts for viewport and device pixel ratio; very large displays can use the original. Transformation uses scale-down, preserves the full image and watermarks, and never alters property content. Generated variants persist in R2 and reuse the original's revision identity. Original-quality selection remains available at any viewport.

Migration0004 adds an atomic monthly transformation-attempt budget and a one-minute cache of large admin aggregates. Preview permits at most 1,000 transformation attempts/month; errors and exhausted budgets fall back to original bytes. This is a transformation guardrail, not a total Cloudflare spending cap. Per-read permissions are checked before bytes and conditional 304 responses, including a final check following transformations. No public object URLs or shared HTTP cache bypass removal checks.

Photo backfill now runs despite a primary-feed HTTP400/404/410, while preserving the primary failure and cursor. Authentication, throttling and budget errors retain normal backoff. Passes are bounded to 48 download attempts, existing provider request/byte accounting, a 150-second deadline and one-hour missing-photo URL retry rules. This is resumable background ingestion, not a million-photo request. Only fresh permission-checked source records authorize downloads.

Live verification at 2026-10-14T03:42:23.948Z showed 17,844 stored photos, up from 17,582 earlier in the turn, with 1,030,449 pending manifest entries. The latest pass recorded 44 photo attempts. The main feed still returned HTTP400 with sanitized reason `pagination_offset`, stage `primary_feed`; initial reconciliation remains incomplete (issue19). Attempt counts are not successful-download counts or an ETA. Not every historical manifest entry will necessarily remain eligible at download time.

Verification:
- All 509 tests across 66 suites passed, including image caching/budget/fallback, revoked-media 304 handling, and primary-error backfill coverage.
- Workspace, staging search and production search typechecks passed.
- Workspace and production search asset builds passed; existing Workspace bundle-size warning remains.
- Live gallery network responses were image/webp HTTP200, with sampled sizes 346,454–387,174 bytes.
- Actual 390×844 viewport showed a full-window gallery without horizontal overflow; override restored.
- Keyboard End reached photo4/4; closing restored focus to the originating photo button and cleared scroll locking.
- Real photo2 was visually decoded, with full composition and OneKey watermark visible. Desktop screenshot: /private/tmp/preview-gallery-final.jpg; phone screenshot: /private/tmp/preview-gallery-photo2.png.
- Independent review found no remaining Required findings after fullscreen and revoked-media fixes.
- Migration0004 applied to the live search database; only the owner-protected preview Worker deployed. Production config is prepared, not deployed.

Deployment incident: the first migration request returned API7403, but deployment erroneously proceeded. The previous preview version was restored immediately; migration was then applied successfully before redeploying. Verification above concerns the subsequent successful release.

Primary references:
- https://docs.mlsgrid.com/ — highest source resolution, individual expiring media URLs, local-copy storage and request/download limits.
- https://developers.cloudflare.com/images/optimization/binding/ — transformation of private R2 streams.
- https://developers.cloudflare.com/images/optimization/features/ — scale-down behavior.
- https://developers.cloudflare.com/images/pricing/ — unique-transform billing; separate from R2 and request charges.
