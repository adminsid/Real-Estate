# Search choices, copyright visibility and open houses — November 16, 2026

The user requested visible landing-page copyright/DMCA access, removal of redundant map pan/zoom buttons, combined property types/statuses, and open houses.

## Delivered behavior

- The hero and common footer link to Copyright & DMCA notice. The full existing production disclosure is now inserted inside the main page on an opaque readable surface; it previously followed the footer over the dark hero body. Existing notice wording and info@primeamericany.com remain unchanged.
- Custom directional arrows and custom +/- buttons are removed. Native map touch/mouse interactions and accessible built-in MapLibre navigation remain. Reset area, Search NYS, borough choices, Search this area, clusters and the independent property-hover marker remain.
- Native checkbox disclosures combine all six property categories and the existing five selectable statuses, including Closed. Choices are ORed within category/status groups and ANDed with location, budget and other criteria. Same normalized choices drive results, discovery, suggestions, hero photos, saved searches and shared URLs. Choose all and Done remain explicit. Mixed sale/rental searches explain that global numeric limits apply to quoted amounts with differing payment periods. Hero photos continue to exclude Closed listings.
- A separate licensed public OpenHouse replica supplies upcoming badges, detail schedules, a landing checkbox and a results quick filter. Invalid/unqualified dates, broker/private events, revoked permissions and cancellations do not display. Event times are New York time and require confirmation. Incomplete/stale coverage is not reported as an authoritative absence of events. Changes also update the lightweight search change token.
- /ops/mls-open-houses is owner-only, links from the import monitor, and reports safe aggregate progress plus a bounded manual pass. Resource calls share existing quota/pacing/core-priority controls. No per-property event requests, new infrastructure service, paid image transforms or video service is introduced.

## Validation

- 85 suites / 642 tests pass. Root typecheck/build, both search Worker typechecks and search production build pass. Both Worker bundles passed dry-run packaging before first preview deployment. The root build retains its preexisting large-chunk warning.
- Real SQLite tests cover combined predicates, phrase parsing, share/recent persistence, explicit event permissions, time validation, bootstrap/catch-up, cancellations, malformed pages, lease loss, exact parent joins, stale event suppression, quota accounting and resource-specific authorization handling.
- Headless Chrome exercised 320×740, 390×844, 768×1024, 1366×768, 2560×1440 and 844×390 layouts with both control positions. All six categories, five statuses, choose-all/Done, immediate checkbox-driven result refresh, persistent URLs, Clear filters restoring Buy/Active defaults, copyright link/route and horizontal overflow checks passed with no page errors.
- Browser testing caught the old generic input handler refreshing the chooser before its checkbox change committed. It now handles named form inputs; chooser changes commit their normalized hidden field before triggering results.
- A fictional local event verified the upcoming card badge, exact open-house filter, detail ET schedule/confirmation language, retained hover marker, and only two custom map-area buttons. Fixture data/photos were not uploaded as application assets. Local screenshots were visually reviewed; authenticated deployed rendering was not inspected.
- Additive migrations 0012_open_houses.sql (live) and 0002_open_houses.sql (synthetic) applied successfully. The real feed completed bootstrap/catch-up and entered delta without a Property-feed error. At 16:14 UTC, it held 988 upcoming public events; 983 matched 400 imported properties. Counts are a point-in-time observation, not a completeness claim for all NYC/NYS events.
- The event filter uses separate covering-index probes for ListingKey and fallback ListingId, avoiding an OR join across the full inventory. An actual broad NYC count returned 277 properties in about 747 ms / 104,998 D1 rows read; the query plan used both event identity indexes. This is a single database observation, not end-to-end or global latency certification. A separate ad-hoc all-inventory join used about 44.99 million reads; it is not used by the consumer filter.

Public release/display review gates and Cloudflare Access remain in force. IMAGE_TRANSFORM_LIMIT stays zero. Deployment versions and final remote checks are recorded below after publishing.

## Deployed result

- Preview Worker: 727f23d0-b3aa-4649-b09c-5ea1ad3536a4.
- Gated production Worker: a2132f2c-4242-4217-931c-d7d48e9bef09.
- Anonymous preview and event-admin requests return 302 to Access. Public search remains 503, matching the closed release configuration.
- The final live check was current at 19:38 UTC with no event or Property-feed failure. It held 1,175 future public event records; source changes since the first import account for the different point-in-time count.
- IMAGE_TRANSFORM_LIMIT=0 remains in both deployed configurations. No new paid image/video service was activated.
