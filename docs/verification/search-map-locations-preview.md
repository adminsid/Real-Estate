# Street map, OneKey location fields, and NYS preview

Implemented October 13, 2026 in the private search preview, branch `codex/search-map-experience`.

## Verified mapping and consumer behavior

The signed-in MLS GRID OneKey IDX Property mapping exposes `PostalCity`, `KEY_ManNYNeighborhood` (description: Neighborhood), `KEY_Hamlet`, `KEY_Village`, and `SubdivisionName`. Latitude and longitude were not listed in that licensed mapping. The former projection retained only City, which frequently reads New York.

Search labels and the area filter prefer the explicit Manhattan neighborhood, then postal town, then City. Postal towns are not represented as neighborhood polygon boundaries. Legacy City links continue to work through the `places` parameter; the new `areas` parameter uses the verified location expression. NYC remains the default; consumers choose New York State explicitly.

Reused the Inventory Admin implementation from `listing-input/src/client.ts`, specifically MapLibre and OpenFreeMap Liberty. The old Workspace Leaflet component was not Inventory Admin. The pinned MapLibre 4.7.1 CSP browser/worker bundles and MIT notices are self-hosted and loaded only when the map is shown. Street and neighborhood labels come from the basemap; query-matched property points use worker-side canvas clustering. Cluster expansion, same-location selection, keyboard property selection, search-current-area, and bottom-dock navigation remain available. The map query covers the matching search independently of card pagination, with a disclosed 2,500-point cap.

## Import and coordinate safeguards

Migration `0002_locations.sql` adds indexed coordinates, address keys, projection version, a separate location refresh cursor, and a daily geocoder request counter. Location replay fetches the complete media manifest and applies permission removals before changing authoritative listing versions. Equal-version projection refresh preserves matching ready photos; it does not advance the primary replication cursor. Older source revisions cannot overwrite newer facts.

Existing NYC projections are refreshed first in batches of 50 while a separate statewide replay advances by at most 100 records per pass. Both share the established MLS request/byte budget and lease fencing. Currently marketed, licensed NY inventory is retained; choosing NYS does not imply complete statewide coverage.

The official NYS address geocoder runs in the scheduled importer, never the consumer read path. Public displayable NY addresses only; no contacts, private remarks, or withheld addresses. At most three lookups per pass and 1,000 per UTC day, with indexed reuse of previously matched public addresses. Responses are limited to 128 KiB and five seconds. Only score >=98, address/subaddress point matches with the same ZIP and unambiguous NY coordinates are accepted. Derived coordinates are stored separately from MLS fields and labeled approximate. Changed/withheld addresses clear their coordinates. An expired lease or changed address prevents writes. Unmatched/unavailable lookups remain absent from the map and retry on another day.

## Verification

- `npm test`: 501 passed, 64 suites (loopback-enabled execution).
- Workspace and both search typechecks passed.
- Workspace build and production search asset build passed; pre-existing Workspace bundle size warning remains.
- Independent review: all required findings addressed, including full media reconciliation, credential/backoff propagation, vendor error caching, empty viewport bounds, and stale cluster callbacks.
- Chrome QA: rendered OpenFreeMap streets and attribution under CSP, expanded a 70-property fixture cluster, filtered Astoria, selected an accessible property, and explicitly expanded to NYS.
- 390px viewport: 332px map canvas, no document horizontal overflow, no error logs; viewport override reset.
- Official NYS geocoder tested with a government office address through GET and the same POST form used by the Worker, with an address-point match at score 100.
- Additive migration applied to `prime-property-search`, preserving existing records.
- Only private staging Worker deployed. Public release gates remain closed.

Live location refresh and initial MLS catch-up remain in progress. The first deployed pass processed 100 location records and added eligible statewide records. At 06:28 UTC, the refresh had processed 800 records and stored three actual derived property locations. A local workerd reproduction rejected redirect:error; a regression was reproduced in the geocoding seam and fixed by manual redirects with explicit non-2xx rejection. Initial MLS catch-up still reports a provider HTTP failure and is not complete. No locations are fabricated when the provider cannot match an address.

## Primary references

- MLS GRID account mapping: https://app.mlsgrid.com/developer/mappings
- OneKey field upgrade: https://support.onekeymls.com/hc/en-us/articles/31410003391764-Matrix-Data-Upgrade-Fall-2024
- OpenFreeMap: https://openfreemap.org/quick_start/
- MapLibre clustering: https://maplibre.org/maplibre-gl-js/docs/examples/create-and-style-clusters/
- NYS public geocoder: https://gis.ny.gov/nys-geocoding-service
- NYS endpoint migration: https://gis.ny.gov/migration-web-services

Private deployment: `4c34250a-34e7-42c1-b43f-aa009129dcd1` (2 ms Worker startup; this is not consumer load time).
