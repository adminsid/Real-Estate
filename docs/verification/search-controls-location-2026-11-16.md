# Search controls, location and Prime America requests — November 16, 2026

## Scope and reproduced causes

The user reported misplaced pagination/saving, confusing Top controls, broken commercial/land filters, hidden map tools and a missing brokerage connection flow.

The original browser check failed because pagination, Save search and map controls were descendants of the Sort & Display dialog. The revised dock moves only the search form between inline and dialog positions. Pagination stays with results, Save search opens its own management dialog, and map tools stay next to the map. Display settings remain in one secondary dialog in either position.

Commercial/land forms had too many horizontal intent tabs and narrow controls after irrelevant fields were hidden. Shared grid sizing, wrapping intent choices, type-specific query examples and explicit hidden-field handling correct the layout. A follow-up browser check caught the settings details being collapsed by a legacy outside-pointer handler: the resulting dialog resize moved Done between pointer-down and click. That settings section is no longer a popover.

## Location and detail browsing

Hovering or focusing a card places an independent MapLibre marker over its verified location, including locations inside a cluster. A local key-to-point map avoids repeated source searches. Missing/withheld locations produce an honest status rather than a guessed pin. Out-of-view locations pan into view with reduced-motion support. Map controls are directly above the map and native zoom controls are also present on the map.

Listing details reuse the existing MapLibre/OpenFreeMap integration, public coordinates and source-reported locality. Nearby named transit/amenity points come only from loaded map features within approximately 1.8 km of the property, with bounded processing and six entries per category. Deduplication prefers the nearest instance. Distances are approximate straight lines. They are not walking routes, walking times, verified service/accessibility information or a complete neighborhood directory. External route links are user-initiated; no paid places/routing API was added.

Detail pages opened from results show Previous/Next property and their position. Page boundaries fetch the adjacent replica result page only on demand. Back retains filter/page context. Open in new tab appears within that browsing context and opens the clean canonical property path. Only IDs, filters and paging metadata are stored in session storage, without MLS fact snapshots or private planning notes. Shared links do not include saved-property IDs or notes.

## Consumer connection and private intake

Listing agent/company/source attribution stays prominent. A distinct Prime America action card names the platform brokerage as recipient of showing requests/questions and offers Prime America email/phone alternatives. Existing representation is optional self-reported routing context, never an agreement or agency selection.

POST `/api/inquiries` uses the existing eligible replica, same-origin JSON checks, bounded input, existing consumer rate protection on public release, validated consumer data and preferred New York times converted to UTC. A UUID command and payload hash prevent duplicate retries or reuse for different content. The insertion rechecks listing existence and showing status. Receipt is displayed only after successful storage; it is not appointment confirmation, listing-agent contact or email delivery.

Additive migration `0011_consumer_inquiries.sql` creates separate private intake/status-event tables in the existing search D1 database. No listing/import schema is changed. These are pending professional review, not canonical CRM Persons, appointments or marketing subscriptions. See ADR 009 and CONTEXT.md: a later reviewed CRM handoff must resolve Person identity and preserve inquiry attribution. No automatic Person creation, outgoing email or marketing enrollment is included.

Owner-only preview `/ops/inquiries` lists the latest 100 requests. Team members with the configured owner identity can record Received/Reviewing/Contacted/Needs follow-up/Closed, with actor/time audit events. Contacted is explicitly a team record, not verified delivery. The email link opens the operator's email app. The inbox and its client module require verified Access identity; writes also require same-origin JSON. Production provides no public inbox read endpoint. Operators manage follow-up manually in this release; there are no automatic response-time promises or notifications.

## Verification

- Full Vitest suite: 82 suites / 625 tests passed, including intake idempotency, revocation/status handling, time conversion, bounded input, public read rejection, owner authorization, CSRF, escaped messages and audit writes; location grouping/distance and navigation context validation.
- Both search Worker type checks and production asset build passed.
- Headless Chrome: six viewport sizes (320×740, 390×844, 768×1024, 1366×768, 2560×1440, 844×390), both control positions and commercial sale/lease/land. Placement, control widths, dialog closure, no horizontal overflow or page exceptions passed.
- Controlled MapLibre browser fixture verifies clustering remains enabled, an independent hover marker is drawn, focus/card indication, detail previous/next, context-aware new-tab link, and the Prime America action card. This isolates interaction correctness from tile-provider availability; a separate local Chrome run successfully rendered real OpenFreeMap tiles, a property marker and named nearby transit.
- A further browser run passed adjacent-page detail navigation, retained Back context, and the production-mode Prime America form using intercepted test submissions. It verified the command UUID and receipt after response, without external messages.
- Local QA uses fictional listings and a temporary SQLite database. No consumer requests were sent to people or written to live intake during testing.
- No physical foldable/keyboard test, screen-reader certification, observed older-adult session or owner-authenticated deployed visual check is claimed.

## Deployment controls

Use the existing private preview and update the gated production package. Keep Access, IDX eligibility, feed quotas/schedules, public-release gates and paid-image-transform allowance zero. No new paid map provider, Cloudflare Images or Stream service is introduced. Migration is additive and old code can run with the new tables present; code rollback does not remove inquiry records.

- Source commit: `ae527f2`, pushed to `codex/search-map-experience`.
- Preview Worker version: `601590b0-1a54-4640-887f-8846e731cab6`.
- Gated production Worker version: `b7023d88-e072-4eb1-8841-42aaf75e39bf`.
- Remote live search D1 migration `0011_consumer_inquiries.sql` applied successfully; subsequent migration listing reports none pending.
- Remote anonymous GET: preview results URL returns HTTP 302 to Access; owner inbox `/ops/inquiries` returns HTTP 302 to Access; public search returns HTTP 503 with release gates retained.
- Deployed owner-session page rendering was not inspected. Local real-map/browser checks and remote deployment/access checks are distinct evidence.
- Deployment preserved `IMAGE_TRANSFORM_LIMIT=0`, the preview minute schedule and the existing queue/binding configuration. Public release and display-review flags remain false.
