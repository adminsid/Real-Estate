# Consumer confidence interface release

User authorization: the user approved the prior search design recommendations and the consumer-confidence direction and requested implementation and deployment. This release implements the consumer interface and browser-owned planning. It does not certify compliance or implement a transaction-management service.

## Implemented

- A search start page at `/`, with property intent, NYC/NYS selection, keyboard-accessible borough suggestions, borough shortcuts and a direct route to results. Existing filtered links and `/embed` continue opening results. The start page avoids an inventory search; live display notices remain.
- A consistent SVG save icon, understandable save feedback, quieter card actions, whole-photo fitting, a save action on listing pages, and stable mobile Search / Map / View / Your search controls. Existing source attribution, full source photo counts, gallery navigation, pagination and viewing preferences are retained.
- `/your-search`: current eligible saved properties, source-fact comparison, private reasons/questions, a self-chosen stage, preparation reminders and preferred viewing times. The workspace rechecks the replica using saved IDs; it does not retain MLS facts or images in browser storage. Unavailable items can be removed without inventing a reason for removal.
- Browser-local planning persists with bounded fields and handles blocked storage honestly. Multiple tabs merge edits to different properties. Sharing a listing excludes notes and planning data. Removing a save deletes its planning entry; clearing planning does not remove the shortlist. This is not an account or cross-device service.
- Contact panels identify the published email address and attributed company, ask optionally about existing representation, distinguish preferences from confirmations, and link process guidance. Opening a contact starts a fresh message so text for another property does not carry over. Email delivery and appointment confirmation are not asserted.
- `/guide`: server-rendered, expandable explanations of representation, agency disclosure, fair housing, agreements, seller condition disclosures and NYC rental fees, with scoped official sources. `/how-it-works` explains actual routing, storage, choice, corrections and a dated, limited industry-litigation example. Neither page records disclosure delivery, signatures or consent.
- Prominent official NYS housing/anti-discrimination notice link and links to Prime America's existing SOP and reasonable-accommodation pages. The existing public brokerage website supplied the verified company support phone and policy links; these links do not independently validate the content or operation of those policies.

## Verification

- Full Vitest run: 79 suites, 608 tests passed. The initial sandboxed run could not bind loopback for existing HTTP tests; the authorized rerun passed with networking enabled.
- Both search Worker TypeScript checks passed; production asset build passed; preview and production Wrangler dry runs passed.
- Headless Chrome with fictional inventory: keyboard suggestions, no browser inventory query from the start page, save/reload, private notes excluded from API requests, current-listing comparison, private share URLs, saved-heart state, preferred viewing times, clearing contact drafts, actual photo loading, whole-photo viewer and guide deep links passed.
- No page JavaScript errors or horizontal overflow at 320×740, 390×844, 768×1024, 1366×768, 2560×1440 and 844×390. Foldable viewport-segment CSS is included; physical foldable/dual-screen hardware and formal accessibility certification were not tested.
- Existing protected-route tests now include the new pages/assets. The browser-owned workspace is empty in server HTML and remains noindex.

## Deployment boundaries

Target private preview: `prime-property-search-staging`, `preview-search.primeamericany.com`. Production package uses `prime-property-search`, `search.primeamericany.com`, with the existing public-release gate preserved. Deployment IDs and remote checks are recorded after publication.

No schema migration, new paid service, image transformation allowance, Stream activation, source-poll frequency increase, bulk media preparation or transaction-document upload is included. These consumer actions do not create new upstream MLS calls; existing listing-photo enrichment remains the established on-demand path.
