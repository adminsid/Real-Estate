# Search design completion release — November 16, 2026

The user asked to complete the missing items in the previously approved search-design recommendations and deploy. This release covers the software changes below. Observed usability sessions remain pending; the [session protocol](search-usability-session.md) is ready to use.

## Delivered changes

- The start page has a visible query label, recent searches with a clear control, and an editable interpretation of common phrases such as “2 bedrooms in Queens under $800,000.” Recognized transaction, bedroom, bathroom, location and budget choices are shown before searching. Unknown words remain keyword searches. Contradictory, unsupported numeric and ambiguous negated limits require correction instead of silently dropping a restriction. This is deterministic interpretation, not general-purpose AI understanding.
- Source-backed autocomplete distinguishes boroughs, reported neighborhoods/postal towns, addresses, ZIPs and MLS IDs. It supports keyboard and touch. The protected `/api/suggestions` endpoint uses the existing local replica/FTS index in production, examines at most 80 candidate records and returns at most 12 whitelisted suggestions. Withheld addresses and private fields are excluded. No upstream MLS request or media import is made for suggestions.
- Successful initial/submitted results can be reopened through browser-local recent searches. Personal notes and saved-property IDs are excluded from recent-search URLs. The existing shared-filter and return-position behavior is retained.
- Cards now read photo → price/Save → key facts → address/location/style → one useful type-specific extra → attribution. Other available facts and price/date signals open under More facts. Rental prices show a period only when supplied; co-op/condo fees show a monthly equivalent only when the charge frequency is known; unknown financial periods are not invented.
- Save/Saved is a labelled SVG control beside the price. Undo can restore removal and its private planning notes. Save feedback says where data is stored. The photo is no longer covered by a save control.
- Card and showcase photo frames use 4:3 geometry and `object-fit: contain`. Photo controls open the gallery, addresses open listing details and Save only saves. Browser Back closes the photo viewer. No automatic photo rotation or gallery import on hover was added.
- The primary dock is Search / Filters / Map / Saved, with 14 px labels and at least 48 px control height. Search and Filters enter the reused form at appropriate points. Sort/display settings are secondary and open directly. Filter choices remain visible above results. Grid columns respect the requested maximum and available pane width. Larger text remains effective. The dialog responds to available visual-viewport height; physical mobile-keyboard/foldable testing remains part of the session protocol.
- Empty results offer specific, explicit changes while retaining other limits; the engine never increases a budget or expands the area automatically to produce matches.

## Validation and limits

The full suite passed 80 suites / 619 tests. Both Worker type checks, production asset build and preview deployment dry run passed. A final targeted parser run covers the geographic-name safeguard distinguishing boroughs from compound place/street names.

Headless Chrome checks covered natural-language application, live reported-area suggestions, touch selection, Save/Undo, Undo preserving notes, recent-search clearing, gallery Back, explicit empty-result recovery preserving budget, 4:3 whole-image fitting, 14 px dock labels and secondary display settings. No horizontal overflow or page JavaScript errors appeared in the core journey at 320×740, 390×844, 768×1024, 1366×768, 2560×1440 and 844×390. Homes/split/map layouts, density maxima and larger text also passed at narrow/tablet/desktop/wide widths.

Photo checks used fictional listing records and three already-downloaded MLS images: 810×1080 portrait, 480×640 low-resolution portrait and 1073×804 landscape. Each rendered with full-image containment in the gallery. Real panoramic and floor-plan samples were not present in that selected local set; those content-quality checks remain in the manual media review. Test photographs were not added to source control or uploaded as new production assets.

No observed older-adult/first-time-user session, screen-reader certification, physical foldable test or live-owner-session visual verification is claimed. Automated checks do not replace those activities.

## Release controls

Deploy to the private preview and update the production package while retaining its public-release gate. Cloudflare Access, IDX eligibility checks, current photo counts, source polling/quotas, paid-media disablement and image-transform allowance of zero remain unchanged. No schema migration, new paid service, source-token change or access-policy change is part of this release.

Deployment identifiers and remote checks are recorded after publication.
