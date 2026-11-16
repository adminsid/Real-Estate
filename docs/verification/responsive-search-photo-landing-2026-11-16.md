# Responsive property-photo search landing page — November 16, 2026

The user requested a full-screen, dynamic photographic landing page: the first image of the highest-priced matching property with an available photo should respond to typed requirements, while text and controls remain clear.

## Delivered behavior

- The full-viewport scene uses a real listing's first available public photo, a dark readability overlay and an opaque search form. Source composition and watermarks are preserved through image containment; aspect-ratio differences blend into the dark scene rather than cropping the property. Headings, search actions and attribution remain independently readable. The page can grow/scroll on short screens; it does not trap content inside a fixed viewport.
- The existing search interpreter supplies the same borough, reported-area, type, bedroom, bathroom, keyword and price choices shown to the consumer. Removing an interpretation chip, selecting an autocomplete area or changing the transaction/scope updates the photo query. Unsupported/contradictory wording pauses the preview until corrected. This is deterministic search behavior, not AI assessment of a home's appeal.
- Initial selection starts immediately. Typed changes debounce for 450 ms. Older requests and pending image loads are cancelled and revision-checked. A previous image is subdued and explicitly labelled while a newer selection loads; it is not represented as a current match. Empty/error states remove the old image and retain the usable search form. The service does not increase budgets or widen locations to obtain a photo.
- Responsive image candidates let the browser select an existing representation as viewport/pixel density change. Photos decode before a 700 ms opacity crossfade. No automatic zoom, pan, animated text, video, room alteration or generated property photography is used. There is no next-photo/gallery prefetch. A new image is loaded only for selection, manual Next or a scheduled slide transition; at most two rendered photo elements overlap during the fade. Failed photos are removed from the current candidate set. Image/API timeouts are bounded.
- Up to six candidates rotate at nine-second intervals when visible and idle. Pause/Play and manual Next are labelled controls. Focusing the search stops automatic rotation; hovering the photo attribution also stops it. An explicit Play action can resume while its control holds focus. Reduced-motion and Save-Data start paused; reduced-motion disables crossfade transitions and Save-Data requests the small existing representation. Hidden/page-leaving tabs cancel work, and visible/BFCache restoration revalidates the selection. Active, idle slides revalidate after roughly one minute rather than preserving a personal or persistent listing snapshot.
- Price, address (or source-withheld notice), brokerage, agent, MLS/source and supplied attribution contact identify the displayed property. The property link opens its canonical detail path. OneKey/MLS GRID logos accompany OneKey photos. Lease periods are displayed only as reported. The order is labelled Highest price first; price is not presented as an objective assessment of attractiveness or suitability.

## Query and delivery

Read-only `/api/featured` reuses the shared consumer SQL filters and forces Active status, photos-only selection, descending price and a 12-row candidate bound. Production excludes nonready media and outdated manifests. It returns at most six minimal public listing snippets, one photo URL each; descriptions, private MLS fields, photo captions, full galleries, planning notes and demographic data are absent.

The production path performs two bounded listing/media reads. It skips result-wide counts, result insights and photo-count aggregates. The normal results API, ingestion, manifest/IDX eligibility and photo-read permission checks are retained. First-photo ranking now explicitly orders by source position and media key, eliminating reliance on incidental subquery order.

The existing image route now prefers a prepared 1600/1080-pixel display fallback over a smaller prepared card where available. No transformations, new variants, source downloads, gallery enrichment, signed upstream media URL, paid map/media product, external AI call, new database or migration is requested by this page. Available source resolution still limits quality; this change cannot recreate absent detail. Existing zero transformation budgets and public-release gates remain unchanged.

## Validation

- Full repository regression suite: 83 suites / 631 tests passed. Tests cover exact budget/borough matching, active-only selection, highest-price ordering, one-photo projection, ready/current manifest checks, withheld addresses, bounded SQL/no result counts, protected routes, arbitrary-media rejection, ambiguous input, profiles, and prepared-image quality fallback without spending transformation budget.
- Root typecheck, both search Worker typechecks, root production build and search production asset build passed.
- Headless Chrome checked 320×740, 390×844, 768×1024, 1366×768, 2560×1440 and 844×390. No horizontal overflow or page exceptions appeared; result layouts retain their existing behavior and do not start the landing-photo query.
- Browser interactions passed: highest matching price, budget/borough changes, empty-match fallback, unsupported interpretation, manual Next/Pause, intact photo fitting and reduced-motion behavior. A further run passed automatic rotation, persistent Pause, explicit Play, no input movement on photo arrival, rapid-input stale-response protection, broken-photo removal, Save-Data and no enrichment requests.
- Visual review used fictional listing records with three already-downloaded local MLS images (landscape/portrait/low-resolution). These test photographs were not added to Git or uploaded as new deployment assets. Screen-size simulation is not a physical-device/foldable or observed-human usability study.
- Owner-authenticated deployed rendering remains separate from local browser verification; no live MLS data was extracted through browser sessions.

Reference behavior consulted: [image decoding before presentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode), [WCAG pause/stop/hide guidance](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), and [Cloudflare Worker practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/). These checks are not a claim of accessibility certification.

- Source commit `33e476b`, pushed to `codex/search-map-experience`.
- Preview Worker: `13b5d9cb-4ca0-4618-aa40-94356aa8342f`.
- Gated production Worker: `a6ba0c36-2790-40f5-8ecb-a9875d577b4c`.
- Anonymous preview landing and `/api/featured?borough=Queens&maxPrice=800000` return HTTP 302 to Access. Public search remains HTTP 503 behind the existing release gates.
- Deployed owner-session visual verification was not performed; local visual/interactions and remote access/deployment checks are separate evidence.
- Deployments retain `IMAGE_TRANSFORM_LIMIT=0`, the existing bindings/queues and minute ingestion schedule, with production release and display-review flags false. No migration or billing activation was performed.
