# Modular property search — local implementation

The consumer search is an independent presentation service in `scripts/mls-grid`, with two working adapters: full pages and an iframe view. It reads the reviewed public MLS projection; neither adapter receives an MLS token or access to the private Workspace. This is a local development boundary, not a production service deployment.

## Brand kit

Open **Brand settings** in the preview header. Four presets, service name/descriptor/tagline, accent/page colors, editorial/modern headings, three corner styles, photo spacing, and adaptive/signature search colors update the preview. Saving writes the validated kit atomically to ignored `.mls-grid-demo/brand.json`; reloads and embeds read the same kit. Undo restores the saved kit. JSON import/export makes it portable. Color checks enforce at least 4.5:1 for accent links/buttons and regular page text; this does not replace a complete accessibility audit.

The kit controls the search service’s presentation. It does not rename the brokerage, modify its canonical Tenant Brand Profile, replace MLS attribution, or change display permission. Production should initialize permitted brokerage branding from a versioned Workspace Tenant Brand Profile snapshot (ADR 005) and authorize service-specific overrides through an administrator interface. The loopback-only `/api/brand` editor is not a production administrator API.

## Website integration

- `/` is the standalone search.
- `/listing/:source/:id` is a full listing page; public links remain stable when filters, layout, branding, or the host website change.
- `/embed` hides the service’s site navigation/footer and brand editor, preserves disclosures, and opens full listing links in a new tab.
- `/embed-demo` demonstrates the search inside another website’s header and content, with copyable installation code.
- `/embed-loader.js` mounts an iframe in each `data-property-search` container and receives bounded height updates. Host CSS remains outside the iframe. Messages verify exact service origin and frame identity; the child verifies parent origin and parent identity. No wildcard origins or listing/customer data are sent in resize messages.

Install the loader as a classic deferred script, not as a module. `data-query` supplies initial public filters; those filters still go through normal server validation. A manual iframe also works with a fixed height.

For a future deployment, `MLS_GRID_PUBLIC_URL=https://chosen-search-domain.example` establishes the canonical origin; the local default is the actual loopback origin. `MLS_GRID_EMBED_ORIGINS=https://brokerage.example,https://www.brokerage.example` sets an exact parent allowlist. Production host CSP must allow the service script and frame. These configuration values must be trusted operator inputs; they are not consumer-editable brand fields. The preview still only accepts the loopback Host header and always sends noindex.

## SEO and sharing

Listing HTML includes escaped permitted facts, remarks, first photo, brokerage, MLS number, status, and public contact before JavaScript. Unavailable or ineligible listings return HTTP 404, with no stale photo/share URL metadata. Server-generated title, description, canonical URL, Open Graph listing photo/title/URL, and Twitter card metadata use the configured public origin. “Copy listing link” excludes current search parameters. No public tunnel was created, so third-party social crawlers cannot access this local preview.

Google recommends server-side rendering for users and crawlers that cannot execute JavaScript, descriptive metadata, meaningful HTTP status codes, and an unambiguous canonical URL. These guide the full-page implementation; they do not guarantee indexing or rankings. [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

Choose one canonical URL per public listing, and use it consistently in links, share tags, and future sitemaps. Canonicalization is a signal, and Google can choose a different canonical. [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls). The share markup uses the Open Graph protocol’s title, type, URL, and image fields when an eligible image exists. [Open Graph protocol](https://ogp.me/).

**An iframe is the browsing integration, not a complete brokerage-domain SEO integration.** If listings should rank under the brokerage domain, the production website needs a server-rendering adapter or reverse proxy for the public listing routes there, including correct asset/API paths and a consistent canonical URL policy. That routing is not implemented by this localhost demo. If the search has its own domain, let that domain own the full listing pages and link there from the brokerage. Avoid simultaneously treating both domains as primary copies.

Before licensed launch: resolve the public domain/routing choice; implement authenticated tenant-scoped configuration and versioned brand snapshots; complete MLS display approvals, private-exclusive publication rules, crawl/parameter policy, sitemap/lifecycle handling, and public accessibility/performance/share-crawler checks. Demo pages and sample data remain noindex regardless of configured origin. The current public projection and local inquiry limitations still apply.

## Validation

### Search page readability and browsing pace — October 8, 2026

The results toolbar now exposes **Browse your way**: cards at a glance, a detailed list, or one property at a time. Focus browsing renders one listing from the current result page, crosses page boundaries with Previous/Next property, and preserves its position in the URL. Switching presentation reuses the already fetched result page. Filters, sorting, source permissions and attribution remain shared across modes.

View settings offer standard or larger text alongside card density and page size. Preferences remain local to the browser and travel in search URLs. At narrow widths the cards reflow to one column; disabled density controls explain through the selected mode that density applies to cards. Every listing has a level-three property heading, with focus moved to that heading when navigating within a focus page. Page transitions return focus to the results heading. There is no timed advancement or global arrow-key interception.

Search controls, photo navigation, saves and pagination have roomier targets; supporting copy has a readable baseline. Selected filters use text/pressed states and borders as well as color. Focus indicators include a light separation ring, and forced-color styling preserves control boundaries. Invalid numeric filters receive an adjacent error and `aria-invalid`; fixing the range clears both the visible error and its descriptive text. These are scoped improvements, not a certification of complete WCAG conformance. Standards reference: [W3C reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html).

Browser verification covered focus navigation from property 12 to 13 and back across a 12-result page boundary, switching all three views, larger-text reflow at 320 CSS pixels, invalid-price recovery, keyboard activation and focus destination, reload/restored position, photography, and embedded search. The search and listing-page presentation are now updated; live agent delivery, analytics, account alerts and licensed AI integration remain separate work. Demo notices and local-only inquiry behavior remain in place.

Automated checks cover portable-kit validation, preset contrast, CSS/HTML injection, permitted public origins, server-rendered metadata and withheld-location protection, origin-checked saves, persisted-kit reload, strict frame policy, public link targets, and HTTP 404 on revoked listings. Browser checks exercise live presets, save/reload, full listing sharing, embedded live filtering, and responsive sizing. Required repository tests, type checking, and build are run after implementation.

### Listing details and local inquiries — October 8, 2026

Listing pages offer **Read your way**: Key facts first or Every section open. The first mode keeps the price, photos, primary facts and description excerpt visible, with native expandable sections for property-type facts, costs and the imported-field inventory. The second opens those sections and the entire source description. Consumers can also open or close individual sections. The full description is available verbatim through Read full description; no AI rewrite or claims are added to another brokerage’s remarks. Text size carries between search and listing pages through browser preferences and the return URL.

Section links open their target and move keyboard focus to its heading. Searching imported details reports the matching field count and opens matching groups. On narrow screens, the contact card follows the facts in the normal reading order; a Contact listing brokerage link near the heading provides a direct route to it. Contact attribution remains visible before the actions. The page explains that listing contacts come from the MLS and that making an inquiry does not establish buyer representation; agency roles are not guessed from a name.

**Request a showing** replaces ambiguous booking language. The form identifies the supplied listing contact and explicitly says that the preview does not deliver requests there. Date/time choices are preferences in New York time, with an explicit Choose a time prompt. Question and showing submissions retain entered details for review, focus the outcome, and disable repeat submission until the form is edited. Inputs are unavailable during the save, and a response from an older dialog cannot overwrite a newly opened dialog. Closing either dialog returns focus to its trigger. Direct email and phone links still use only supplied public contacts.

Browser checks covered expandable/expanded modes, searchable heating details, section focus, gallery keyboard navigation and focus return, fictional local inquiries, rental-specific costs without a home-mortgage calculator, and larger-text reflow at 320 CSS pixels. The embedded search showed one-card browsing, full-page link targets and frame resizing. No browser console errors were observed. Required checks passed: **61 Vitest files / 460 tests**, type checking, build and preview-module syntax. The existing Workspace bundle-size warning remains. These checks do not establish complete WCAG or MLS approval. Local records are not delivered leads or confirmed appointments.
