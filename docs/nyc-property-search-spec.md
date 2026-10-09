# Prime America NYC property search

Consumer copy and presentation standard: [website vocabulary guide](website-vocabulary-guide.md).

Status: Product scope and private-sharing policy established; live feed access awaits contracts and approval.

Development update October 7, 2026: demo access is verified and a separate local import/search preview is implemented. See [MLS Grid development integration](mls-grid-development.md). This is a development slice; the full consumer product and approved production feed remain outstanding.

The local preview now includes media replication and manually controlled galleries. The [consumer decision research](real-estate-consumer-psychology.md) and [marketing playbook](nyc-real-estate-marketing-playbook.md) translate the end-to-end journey into evidence-backed requirements and ten experiments. No consumer experiments or competitive superiority claims have been validated yet.

## Objective

Replace the current public website with a useful consumer property-search product covering Queens, Brooklyn, Manhattan, the Bronx, and Staten Island. Support authorized MLS/IDX inventory and Prime America's exclusive Listings, including public and private sharing. Measure success through repeat searches, saved-search use, useful alert engagement, and successfully delivered inquiries.

## Confirmed scope

- All five NYC boroughs.
- Two inventory sources: authorized MLS/IDX data and Prime America exclusives.
- Public discovery and controlled private sharing.
- Listing providers: NYStateMLS and OneKeyMLS. The user confirms there is no API/feed access yet. MLS Grid is the planned OneKey access route; contracts still need signing.
- User-estimated feed budget: approximately $200/month, subject to confirmation of the applicable subscription and licensing fees. No purchase or contract acceptance has been authorized or performed.
- Private consumer sharing: anyone possessing the private link can open it without signing in. Such links are forwardable and do not identify or restrict the recipient.
- A functional consumer experience backed by real inventory, rather than a visual-only redesign.

## Proposed launch experience

### Consumer information transparency

User requirement: treat consumers as capable decision-makers. Do not hide consumer-permitted MLS property facts to simplify the interface, collect contact details, or manufacture dependence on an agent. Depth of information is a product requirement; the current preview's small field projection is incomplete, not the intended final disclosure policy.

Each Listing must offer a readable overview and an accessible, searchable All property details view. The latter contains every populated field approved for consumer display from the applicable source contract, including relevant provider-specific fields and eligible room/unit data. Summaries never replace the underlying facts. Keep the provider's original value alongside any explanation or calculation, with attribution and verification/update context.

Prioritize complete costs and inclusions, taxes, building/property characteristics, room dimensions and layout, condition, utilities, amenities, confirmed restrictions, listing status and permitted history. Include adverse facts as clearly as favorable ones. Explain unfamiliar terminology without removing specificity. Do not interpret a missing value as zero, no restriction, or a negative fact.

Distinguish these states accurately:

- Supplied and display-permitted: show the value.
- Not supplied by this source: say so; never imply the agent or seller deliberately withheld it.
- Explicitly restricted from this consumer access tier: explain the source restriction without exposing the restricted value.
- Not integrated yet in the development preview: identify it as an implementation gap, not a source-data gap.

Before consumer release, maintain a versioned field-level inventory of received source fields, display eligibility, data type, consumer label, and mapping. Every field must have a documented disposition; automatically detect newly received fields requiring review. This is broader than a fixed handful of familiar fields, while avoiding accidental publication of private data through raw-JSON passthrough.

OneKey describes different IDX, VOW, and back-office products. Investigate a separately licensed, appropriately authenticated VOW tier if it materially expands useful consumer information; logging in alone does not grant permission to show back-office data. Seller contact details, occupant information, access codes, credentials, and agent-only remarks do not become public property facts. Prime America private exclusive sharing remains a separate publication decision and does not bypass source permissions.

Acceptance criteria: audit every field actually received against the display contract; test rich facts, arrays/room data, unknowns, and restricted fields; prove that all consumer-permitted mapped fields are reachable in the interface; and document exclusions with their actual reason. The consumer interface must not claim full MLS transparency while this audit or integration is incomplete.

Reference: [OneKey data-delivery products](https://corporate.onekeymls.com/benefits-data-delivery). This requirement expands the consumer experience; production agreements and field eligibility still require verification.

Visitors can browse without registering. Search accepts borough, neighborhood, address, ZIP, and MLS identifier. Map and list views use the same query and result set. URLs preserve filters, sorting, and selected location so searches can be shared and restored.

Support sale and rental searches, price, bedrooms, bathrooms, property type, condo/co-op distinctions, and open-house filters. Additional filters such as monthly fees, parking, and outdoor space require sufficient source coverage. Missing values must remain unknown; never convert missing fees to zero or unknown amenities to absent.

Listing pages show available photographs, property facts, public remarks, recurring costs, location, source attribution, listing updates, and permitted price history. Show the freshness of source data. Closed, withdrawn, expired, or otherwise unavailable Listings stop appearing as available inventory after the corresponding source update is processed.

Consumers can save favorites, compare Listings, save searches, and explicitly opt into new-match and price-change notifications. Registration is requested when needed to persist an account feature. Alerts link back to matching Listings and offer withdrawal controls.

Tour requests and questions create durable Inquiry Attribution and route to the appropriate CRM Person and responsible agent. Retries must not duplicate inquiries or Contacts. Property-related contact and marketing Communication Consent remain separate.

## Inventory and visibility

Inventory remains the owner of Prime America Property identity and Listing business records. Imported MLS records retain provider identifiers and provenance. Publication status, Approval status, Listing status, and archival remain separate axes, following ADR 005.

| Publication status | Intended website behavior |
| --- | --- |
| public | Approved, eligible Listings may appear in public search and public detail pages. |
| invite_only | Accessible through the selected sharing policy; excluded from anonymous search, sitemaps, and public alerts. |
| private | Accessible to authorized internal users; consumer access requires an explicit publication/sharing change. |

The access policy applies to APIs, photographs, attachments, previews, caches, and exported data as well as page routes. Invite-only consumer access uses a private bearer link without sign-in, as requested. Links must be unguessable and revocable, and private responses must not enter shared public caches. Disabling or revoking a share must block subsequent access. Expiration defaults remain to be decided. Current token links are a reuse candidate, not evidence that all these protections already work.

Prevent duplicate presentation when the same Listing arrives through Inventory and the MLS feed. Do not merge separate units or successive Listing agreements just because their addresses match. Preserve source-specific facts and permitted attribution. Never import internal seller details, showing instructions, access codes, or private remarks into a public search document.

Provider-specific display permissions govern imported MLS fields, photos, history, caching, attribution, and alerts. Private exclusive sharing does not override applicable listing-publication obligations.

## Existing implementation evidence

- `worker/index.ts`: public listing collection and detail APIs, invite-token lookup, public inquiry intake, and listing media proxy.
- `src/routes.tsx`: public Listing detail route.
- Inventory (`listing-input/src/index.ts`): external listing feed requires approved/public, non-archived records; dedicated publication fields exist.
- `docs/adr/005-separate-statuses-and-own-shared-profiles.md`: established ownership and separate business-status axes.

These are code observations. The consumer launch still requires behavior, access-control, feed-coverage, and end-to-end verification.

## Delivery sequence and acceptance

Development and feed onboarding can proceed concurrently. Before access arrives, implement and verify search contracts, the consumer interface, and Prime America exclusive integration using permitted records and clearly identified development fixtures. Never present fixtures as live MLS inventory. Live-feed freshness and coverage remain unverified until approved integration is tested.

1. **Confirm data access and coverage.** Complete provider onboarding, API approval, covered inventory across every borough, permitted fields, update/deletion semantics, limits, and display requirements. Document coverage gaps explicitly. Provide a staging website for provider review where required. Human signatories accept contracts and authorize charges.
2. **Deliver public search through inquiry.** Ingest authorized inventory; combine eligible exclusives; implement indexed, paginated search, map results, shareable queries, detail pages, and durable CRM delivery. Verify real records from each borough and realistic result volumes. An upstream outage produces an explicit state, not a false empty result.
3. **Deliver private sharing.** Implement the chosen access policy, revocation, and protected media. Verify private records are inaccessible through anonymous search, direct API calls, public alerts, and public caches.
4. **Deliver return-use features.** Persist favorites and saved searches; deliver opt-in alerts with duplicate prevention and withdrawal; compare and share Listings. Recheck visibility before sending notifications.
5. **Verify launch readiness.** Verify mobile search, keyboard access, empty/error/loading states, attribution, freshness, pagination, inquiry retry handling, and private access boundaries. Establish measured latency and freshness targets after inspecting provider limits and expected volume. Run repository-required tests, typecheck, and production build before deployment.

## Open decisions

- Completion of contracts, approval, and credential provisioning for OneKey through MLS Grid; confirmation of the separate NYStateMLS delivery route. Never record credentials in this document.
- Private-link expiration defaults; bearer-link access without sign-in is confirmed.
- Location of the public website implementation: the current checkout is the internal Workspace; architecture also references an Astro corporate site whose checkout has not been located.
- Feed coverage for the intended sale/rental and property-type scope across all five boroughs.
- Map provider, notification delivery, and operating budget, to select after integration requirements are established.

## Provider references checked October 7, 2026

- OneKey describes MLS Grid as delivering its RESO-standard Web API feed: https://corporate.onekeymls.com/benefits-data-delivery . This does not establish complete NYC coverage.
- OneKey onboarding guidance says in-house brokerage technology teams register as the vendor, and allows a staging URL for review. It currently lists a $250 monthly vendor feed fee and $20 monthly fee per license: https://support.onekeymls.com/hc/en-us/articles/27251536794644-Data-Delivery-Resources . Confirm the applicable commercial arrangement before committing; the user's approximate $200 estimate is not a verified quote.
- NYStateMLS advertises a raw data feed or custom search box obtained by contacting its offices: https://www.nystatemls.com/IDX_Feed.html . Its participation in the planned MLS Grid subscription has not been established. Keep its connector separate until confirmed.
- MLS Grid API v2 replication guidance includes visibility-removal updates: https://docs.mlsgrid.com/api-documentation/api-version-2.0 . Search eligibility must honor removal events as well as new and changed records.

### Full listing preview delivery

The local development preview now includes linked listing detail pages, consumer-type-specific fact and cost sections, editable residential mortgage scenarios, local showing/message requests, and optimized photo galleries. See [development integration](mls-grid-development.md) for scope and validation, and the [IDX display review](idx-preview-display-review.md) for the implemented protections and remaining approval requirements. It remains sample inventory and local request capture rather than a live consumer service.

### Personalized discovery preview — October 7, 2026

The local search now updates after a 250 ms typing pause and immediately after selecting a filter. In-flight requests are cancelled, stale responses cannot replace newer results, and the results announce updates without moving keyboard focus. Photo highlights randomly choose two eligible listings and a real imported photo from each, using the same filters as the results; empty photo coverage never substitutes a property outside the search. Photo mixing does not reorder search results.

Consumers can choose cards or a list, up to 2–5 cards per row (limited by screen width), 12/24/48/96 results per page, and ascending/descending price or newest source listing date. Numbered pagination uses stable source/id tie-breaks and clamps obsolete offsets. Layout changes apply immediately without fetching listings. URLs retain filters and view settings through the detail page and back.

Saved homes (up to 100), saved searches (up to 10), and view preferences use this browser's local storage. Saved-home filtering applies to the entire eligible search, including pagination and photo highlights. This is local personalization, with no account sync or email alerts. A storage failure preserves browsing and tells the user that saves will last only for this page.

Useful opportunity filters and result counts show properties listed in the last seven New York calendar days and asking prices below the source's original asking price. These are listing facts, not verified discounts, current demand, recent price-change dates, or proof of availability. Import time never supplies a new-listing badge. No invented viewers, offer counts, deadlines, or scarcity timers are displayed. This follows the consumer-protection concerns described in the [FTC's dark-pattern report](https://www.ftc.gov/news-events/news/press-releases/2022/09/ftc-report-shows-rise-sophisticated-dark-patterns-designed-trick-trap-consumers). Search counts use a polite atomic status region, consistent with [WAI guidance for status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

The preview retains brokerage/source/status/contact attribution alongside cards and photo highlights. Production IDX approvals and source-specific display requirements remain tracked in `docs/idx-preview-display-review.md`.
