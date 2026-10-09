# Domain discovery and phased hosting: provider research

Research date: October 8, 2026. This note distinguishes provider facts from proposed design. No DNS, account, feed, deployment, or external communication changes were made. It does not establish our current DNS settings, Placester plan entitlements, origin configuration, or MLS permissions.

## Verified provider facts

### Search URLs and rendering

- Google treats the subdomain/subdirectory choice as a business and organizational decision. A hostname choice alone does not promise rankings. [Google SEO starter guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide).
- Redirects and canonical link annotations are strong canonicalization signals; sitemap inclusion is weaker. Google ultimately selects the canonical. Align those signals rather than presenting competing public copies. [Google canonical guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).
- Google processes JavaScript but rendering adds complexity. Its guidance favors a canonical in the original HTML and warns against changing it to a different URL with JavaScript. [JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).
- An iframe is not inherently unindexable: Google supports `indexifembedded` with `noindex` for embedded content. This is a specific Google control, not a guarantee of indexing, a canonical URL replacement, or a cross-engine contract. [Google embedded indexing announcement](https://developers.google.com/search/blog/2022/01/robots-meta-tag-indexifembedded).
- Arbitrary filter combinations can create excessive crawling and delay discovery. Canonicals can reduce this over time but are less effective crawl controls than preventing unnecessary faceted crawling. Useful indexable facets need predictable parameter/path ordering and correct errors for invalid combinations and nonexistent pages. [Google faceted navigation guidance](https://developers.google.com/crawling/docs/faceted-navigation).
- URL-changing migrations need an old/new mapping, server redirects, updated internal links and sitemaps, and monitoring. Google recommends retaining redirects generally at least one year and warns of temporary search fluctuations. [Google site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).
- IndexNow informs participating engines of additions, changes and deletions; it does not guarantee indexing. Submit meaningful changes rather than every unchanged import. [IndexNow FAQ](https://www.indexnow.org/faq).

### Current AI discovery guidance

- Google's current generative-AI guide retains ordinary SEO requirements: indexed, snippet-eligible, accessible content; useful original information; good experience. It explicitly says Google Search ignores `llms.txt` for visibility/rankings and requires no special AI schema. Indexing and serving remain unguaranteed. [Google generative AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
- That guide now links to a Search Console inclusion control. The corresponding help page says it rolled out globally August 31, 2026 under **Settings > Search generative AI**. Include is the default, or properties inherit their parent's setting. It affects links/grounding in AI Overviews, AI Mode and generative Discover; it is separate from ordinary search ranking and AI training controls. Check effective parent/child settings rather than assuming a subdomain is included. [Search Console control](https://support.google.com/webmasters/answer/16908024).
- The older [AI features page](https://developers.google.com/search/docs/appearance/ai-features) still says no additional requirements. The newer linked control documentation provides the more specific operational requirement; recheck it at rollout.
- OpenAI distinguishes **OAI-SearchBot** (ChatGPT search discovery) from **GPTBot** (content that may be used for foundation-model training). Their robots choices are independent. **ChatGPT-User** performs some user-directed requests, is not the automatic search crawler, and robots rules may not apply. IP ranges are published; allowing a bot is not a promise of citations. [OpenAI crawler reference](https://developers.openai.com/api/docs/bots).
- `llms.txt` is a proposed agent-friendly guidance convention, not a ranking entitlement or an access-control mechanism. Its own specification describes background/guidance/links and optional Markdown alternatives. [Proposal](https://llmstxt.org/).

### Placester capabilities and unresolved prerequisites

- Current Site Editor documentation supports a Custom Code HTML module and iframe embeds, with preview/publish steps. Separate Custom JS settings support head/footer snippets, optional preview execution and loading delay. [HTML and embeds](https://support.placester.com/article/1yzonhulzx-embedding-html-forms-and-files), [Custom JS](https://support.placester.com/article/ojx6n1gyd4-adding-tracking-codes-and-custom-code).
- Legacy Codeless HTML tooling explicitly permits HTML, not JavaScript, and requires secure embed sources. Do not assume a script loader can be pasted into its page HTML field. [Legacy HTML embed help](https://support.placester.com/article/qmu58g6lk1-customizer-adding-html-to-a-page).
- Placester publishes Cloudflare domain-mapping instructions involving apex A / www CNAME records and a Placester custom-domain setting. The page contains copied registrar wording and is not proof that every proxy/CDN configuration is supported. Do not apply its historical record values as an account-specific migration recipe. [Placester Cloudflare mapping](https://support.placester.com/article/8akvjf99hc-mapping-your-cloud-flare-domain-to-placester-codeless).
- These public pages do **not** verify this account's editor generation, subscription entitlement, CSP, custom route/canonical controls, or approval for an intervening reverse proxy. Those are prerequisites to confirm in the account/provider configuration.

### Cloudflare coexistence

- A **Worker Route** runs before an existing origin and requires a proxied DNS record for its hostname. A **Custom Domain** makes the Worker the origin for the whole hostname, with Cloudflare-managed DNS and certificates. It matches all paths, not a particular prefix. [Routes and domains](https://developers.cloudflare.com/workers/configuration/routing/), [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
- A narrow path Route can support phased coexistence **only if** the consumer hostname can safely be proxied. DNS by itself does not dispatch `/homes/*` to a Worker. Assigning the consumer apex/www as a Worker Custom Domain would affect every path and is not an incremental Placester embed operation. This is an architectural inference from those routing definitions.
- Full (strict) TLS requires an unexpired trusted origin certificate matching the requested/target hostname, and HTTPS port 443; otherwise a 526 error is possible. Verify origin Host/SNI, redirect behavior and certificate renewal before proxying Placester. [Cloudflare TLS requirements](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).
- Some CDN-associated CNAME targets cannot be proxied and can cause connectivity errors. Support and actual testing must settle this account's feasibility. [Proxy limitations](https://developers.cloudflare.com/dns/proxy-status/limitations/).

### MLS rights boundary

MLS GRID publishes a master license, AI addendum and separate IDX/VOW rules. [Provider resources](https://www.mlsgrid.com/resources). Its linked AI PDF and wiki could not be retrieved by this research tool. The user's supplied correspondence describes permitted search/response use and own-listing marketing, with other AI uses needing written approval. That correspondence is context, not proof of this account's executed license.

**Proposed control:** separate search-engine display/index permission, third-party AI grounding permission, and training permission by content class and source. Authorizing our own AI search does not establish that we may authorize an unrelated crawler to retain, ground on, train on, or redistribute every MLS record. Do not publish a bulk MLS Markdown export or relax crawler protections until the executed agreements resolve those questions. Robots directives cannot secure private information; private conversations require authentication and authorization.

## Proposed mapping and rollout — design inference

**Subsequent user clarification:** `primeamericarealestate.com` remains the corporate site and `primeamericany.com` remains the consumer site. The user prefers a quiet public launch once MLS display approval is ready and would rather avoid the Placester editor, potentially using a separate search domain. The [current architecture proposal](public-domain-and-communications-map.md) consequently recommends `search.primeamericany.com` as a durable canonical host retained through the consumer-site replacement, rather than making main-host proxy integration a launch prerequisite. The alternatives below remain provider research, not the selected deployment recipe.

Choose one durable consumer listing address and keep hosting replaceable behind it. Prefer the existing consumer canonical host after checking its real apex/www redirects, links and search history; do not change www/apex merely for appearance.

| Surface | Proposed address pattern | Purpose |
| --- | --- | --- |
| Public discovery | `<consumer-host>/homes/`, `/rentals/`, `/commercial/` | Curated, useful landing pages with crawlable listing links |
| Listing identity | `<consumer-host>/property/<stable-public-id>/<optional-address-slug>` | Canonical public listing episode; the ID survives slug changes |
| Filter state | `<consumer-host>/search?...` | Shareable interactive state; not every combination becomes an indexable landing page |
| Private exclusive | `<consumer-host>/private/<opaque-share-token>` | Revocable bearer link, excluded from indexes/sitemaps; forwarded links remain usable by recipients |
| Consumer conversations | `<consumer-host>/messages/` | Signed-in UI; authenticated records, no index or public transcript |
| Professional work | `workspace.primeamericany.com` | Existing authenticated workspace; private services stay behind bindings |
| Isolated transitional engine | `search.primeamericany.com` | Only if same-host routes are blocked; can remain an operational embed/API host later |

These are proposed names, not existing routes or DNS records. Avoid borough subdomains, one domain per property, price in URL identity, or making each preference/filter variant a competing property page. Preserve source attribution and distinguish a physical property from its changing listing episodes.

1. **Inventory first:** confirm authoritative DNS, proxied status, origin host/certificates, apex/www redirect choice, current URLs, Placester editor/plan and embed capability, public/private rights, Search Console properties and robot/CDN rules. Export a rollback snapshot; preserve existing workspace, auth and email records.
2. **Quiet preview:** Access-protected staging and a draft/unlinked Placester embed; users and crawlers receive the same content when accessible. A non-indexed preview does not grow search visibility. Test responsive height, keyboard navigation, direct listing links, CSP and authentication behavior.
3. **Preferred coexistence:** after origin/proxy verification, use narrow consumer-host Worker Routes for the chosen new search/property paths. Leave existing Placester paths to its origin. Serve complete HTML, correct HTTP statuses, canonical and social metadata at the direct property URL. Own robots/sitemap integration explicitly; unhandled `/robots.txt` remains Placester-controlled without a dedicated route.
4. **Fallback coexistence:** if safe same-host routing is unavailable, launch canonical public pages on `search.primeamericany.com` and embed the search UI in Placester. Either retain those canonical URLs after the full-site replacement or plan a real redirect migration. Do not canonicalize to an unimplemented future apex URL.
5. **Full replacement:** keep established paths where possible; map genuinely changed URLs individually, avoid blanket homepage redirects, monitor status/index selection and conversion events. Update links/sitemaps and retain redirects. Public obsolete content follows MLS retention/display permissions even when a URL previously ranked.

Measure indexed canonical pages, crawl errors, listing freshness/removal latency, direct shares, organic/AI referral conversions and delivered inquiries. Domain elegance helps maintainability and sharing; it cannot guarantee being first in search or model answers.
