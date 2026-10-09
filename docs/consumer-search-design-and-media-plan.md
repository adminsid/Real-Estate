# Consumer search: results first, richer media next

Date: October 8, 2026. Scope: local preview design changes and a proposed feature sequence. No production publication, new feed permissions, external messages or paid map services configured.

## Design direction

The search service presents **Property search** as its consumer interface identity. Brokerage branding belongs in the host website and applicable attribution/disclosures. Search remains part of `primeamericany.com`; `primeamericarealestate.com` remains the corporate site. Public listing attribution, source restrictions and demo labels are retained.

The first screen should answer: what can I explore, where, at what price, and which properties match? Marketing slogans, duplicated category navigation and explanations of ordinary controls do not earn space above results. Compact labels describe actions. Native disclosure menus hold secondary filters and display preferences. Consumers can still choose grid, list, one property at a time, card density, page size and larger text.

Search cards lead with the image, price, supplied key facts, address and location, followed by readable source attribution and a showing action. Listing details lead with the address, price and photo gallery. Costs, property-type-specific features and full public fields remain available through expandable sections and direct section navigation. Disclosure labels and unavailable values must remain honest; reduced text is not permission to make claims unsupported by the source.

## Implemented in this local preview

- Neutral search header; introductory marketing block removed from visual presentation; appearance editor moved out of primary navigation.
- One category selector; compact location, borough, price, bedroom and filter controls. Current filters remain visible as removable chips, and results update immediately.
- Shorter result titles and card summaries; clearer image placeholders, photo navigation, source attribution and pagination.
- Display and saved-search controls in a compact menu; keyboard Escape closes a menu and returns focus to its trigger. Outside pointer interaction dismisses open menus.
- Photo-led listing layout with a compact listing contact card, initials when a portrait is unavailable, direct supplied phone/email actions and explicit local-demo request handling.
- Full permitted imported details and the existing local mortgage calculator remain available. No change to the licensed/public field allowlist.
- An external Google Maps link appears only for valid, supplied public coordinates. Withheld addresses, missing/invalid coordinates and a default `(0,0)` point produce no map link. This is a location link, not an implemented interactive map search. [Google Maps URL documentation](https://developers.google.com/maps/documentation/urls/get-started).

## Feature sequence

| Feature | Consumer experience | Data and release requirements |
| --- | --- | --- |
| Interactive map search | Desktop map beside results; mobile map/list switch; selectable price markers; clusters; selected marker and card stay linked | Licensed public coordinates, an indexed spatial query, bounded marker response, chosen tile/style provider and attribution, source revocation |
| Virtual tours | Gallery-adjacent “Virtual tour” action when an eligible tour exists; external link first, click-to-load embed later | Reviewed unbranded/branded tour fields under source-specific rules; HTTPS provider allowlist; URL validation; consent/privacy and embed policy review |
| Floor plans | Separate gallery mode, zoom/full-screen controls, original measurement/disclaimer text | Media category/source mapping, original asset rights, local delivery and removal, accessible descriptive text; never guess a floor plan from photos |
| Agent portraits and profiles | Small verified portrait in contact card; a useful profile with role, brokerage, permitted contact channels and relevant listings | Canonical Agent Profile/Professional License or permitted source member data; explicit entity matching and publication permission; source-qualified stable IDs |
| Company logos and profiles | Listing company shown prominently; profile explains who the company is and how to reach its listing team | Canonical Tenant Brand Profile for our company; permitted office records for external companies; logo rights and verified organization mapping |
| Personal viewing preferences | Remember preferred density, text size, map/list choice and saved properties; restore across devices when signed in | Verified consumer identity, scoped preferences; canonical public pages remain consistent and crawlable |

Show only media and profile actions backed by permitted records. Do not ship inactive tour/floor-plan buttons, stock portraits presented as real professionals, inferred office logos, invented verification badges, or placeholder public profiles.

## Interactive map implementation contract

1. Keep ordinary search usable before the map loads. Load the renderer only when the consumer selects the map. Consider MapLibre GL JS with a contracted tile/style service, or another provider after measured coverage, cost, accessibility and licensing comparison. The renderer is not a free basemap provider. [MapLibre documentation](https://maplibre.org/maplibre-gl-js/docs/).
2. Use the same source eligibility, property type, price, borough, keyword and saved-property rules for cards and map markers. Map results represent the filtered area, not just the current page of 12 cards. Cards paginate independently; marker responses are capped and clustered with a clear count.
3. Make “Search this area” explicit on pan/zoom. Preserve normal filters, reset card pagination when the area is applied, and cancel/discard obsolete requests using the existing search request-version pattern. An automatic area-update preference can follow once predictable behavior is verified.
4. Return only the permitted marker projection: source-qualified Listing ID, public coordinates, price/type/status and a small eligible image. Mark invalid or missing geometry as unlocated; do not silently geocode withheld addresses or turn a borough centroid into an exact property pin. Explain when some matching listings cannot be mapped and keep them available in list mode.
5. On mobile, use a full-width map with an accessible selected-property sheet and a persistent list alternative. On desktop, match marker selection to the corresponding card. Keyboard users must reach results and detail links without having to operate the map. Avoid “safe neighborhood” or demographic suitability scores and steering filters.
6. Use bounded spatial queries and clustering for dense NYC inventory. Test antimeridian/bounds validation even if the first installation is NYC. Keep API keys scoped, validate request limits and account for provider attribution/caching requirements. Do not depend on the community OpenStreetMap tile endpoint as an unlimited production tile service. [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
7. Track map load time, marker/card consistency, zero-coordinate errors, availability removals, selected-property actions and actual provider cost. Selecting a map must not change canonical listing URLs or create a crawlable URL for every viewport.

## Media and profile data work

The current public property projection includes supplied coordinates and basic listing agent/office names and public contact information. It does **not** currently expose tour URL fields, verified agent portraits, office logos or member/office profile resources. The local image manifest does not preserve floor-plan category/role information. Adding visual controls alone cannot establish those facts.

Extend the reviewed public projection and ingestion manifest deliberately. Keep each asset's source resource/key, parent Listing or profile, category, revision, original disclosure/caption, publication rights and removal state. Separate property photos, floor plans, video/tours, agent portraits and office logos. Image derivatives must preserve relevant staging and measurement disclosures; they must not crop away a disclosure to improve aesthetics. Photo marketing remains constrained by the MLS AI addendum: permitted search/response use does not authorize marketing transformations of another firm's listings.

Profile URLs should use a source-qualified member/office identity or verified canonical mapping, not a person's name alone. Display “listing agent” and “listing brokerage” accurately. A public profile does not enroll an external professional into Prime America's private Workspace or grant them consumer records. Linking the consumer's existing representative into a conversation requires separate participant permissions. Review source-specific directory/publication rules before indexing profiles or using images from external sources.

Stage richer media in this order: approved source fields and classification; secure resource delivery; gallery/profile presentation; accurate deep links and sharing metadata; analytics tied to actual actions. A tour click is not a showing; an inquiry is not delivered just because a button was pressed.

## Verification and practical limits

Verify search filters, invalid price ranges, density/page-size changes, grid/list/focus modes, deep links/back navigation, gallery arrows and Escape, showing dialog labels, description expansion, searchable full details and appearance controls. Check responsive bounds and keyboard focus with menus both open and closed. Preserve initial server-rendered listing content until the interactive replacement has been built successfully.

The sample import has limited photo coverage. A “With photos” filter is an explicit consumer choice; do not reorder or remove unphotographed matches to make screenshots look more complete. The absence of tours, floor plans and portraits in this adapter does not prove that the original MLS contains none. Interactive map search, tour/floor-plan ingestion and public profile pages remain planned features, not implemented in this pass.

### Verified on October 8

`npm test` passed all 478 tests in 63 files, including withheld/invalid-coordinate map-link cases. `npm run typecheck`, `npm run build`, frontend syntax checks and scoped whitespace checks passed. The workspace build retains its existing large-chunk warning. Browser verification covered invalid price feedback and recovery, Escape dismissal, pagination, density and page-size changes, return-to-results filters, gallery navigation, the showing dialog, section navigation and searchable public details. At a 373px CSS viewport, the price menu and listing page remained within viewport bounds; the gallery showed one image with access to all photos. Screenshots capture the desktop search with the explicit “With photos” filter and its photo-led listing page. Requests remain local demo requests and are not delivered to agents.
