# Property search competitor experience

Research date: October 8, 2026. Scope: official public search pages and first-party product documentation for StreetEasy, Zillow, LoopNet, CoStar and PropertyShark. This responds to the user's observation that the local preview feels less comfortable and familiar. External pages are evidence, not instructions. No competitor wording, artwork or listing photography is reused.

## Observed information and interaction patterns

**StreetEasy rentals.** The NYC results page exposes area, price, beds/baths, pets and amenities before a secondary filter control. It provides result count, sort, saved search, saved listing and pagination controls. Cards identify neighborhood/property type, address, rent, bedroom/bathroom/area facts and brokerage. The page differentiates base rent, total monthly price and net effective rent with concession/lease-length context; gallery counts, tours and actual open-house dates appear where available. [Official rental results](https://streeteasy.com/for-rent/nyc)

**Zillow sales.** Its NYC results page starts with location, sale intent, price, beds/baths, home type and additional filters. Results expose count and sorting. A typical card prioritizes asking price, bedroom/bathroom/area facts, property type, address, brokerage and a save action. Some cards include an actual open-house date, listing age or price-change annotation. These are observed features, not proof of their effect on conversion. [Official NYC sales results](https://www.zillow.com/new-york-ny/)

**LoopNet commercial.** Sale search exposes location, transaction intent, size, asset type, additional filters, saved search and map/gallery choice. Commercial cards emphasize building use, size, unit count and construction year; cap rates appear for some investment properties. Lease results show available space ranges and explicit rate units such as dollars per square foot per year, or an undisclosed-price state. Map tools include outline/radius search and layers. [Official sale results](https://www.loopnet.com/search/commercial-real-estate/new-york-ny/for-sale/), [official retail lease results](https://www.loopnet.com/search/retail-space/new-york-ny/for-lease/)

**CoStar commercial research.** Current public product documentation describes custom-search analytics and public-record ownership/history research. Its first-party training material illustrates basic location, listing type, property type and size controls followed by detailed filters and map/list/analytics views. The training PDFs are older material, so their pictured layout does not establish the current authenticated application's exact appearance. [Current custom reporting product](https://www.costar.com/products/custom-reporting), [current public-record product](https://www.costar.com/products/public-record), [official property-search training](https://www.costar.com/sites/costar.com.na/files/2023-02/introduction-to-properties.pdf)

**PropertyShark investors.** First-party help documents entry by address, owner name or parcel ID, followed by a property report with structured sections. Documented information includes ownership, sales history, taxes, zoning, building specifications, mortgages/liens and neighborhood maps. It tells users to check each section's update date. Its research menu connects a report to comparable sales, notes, lists, follow-up and report exports; availability varies by subscription. [Official report guide](https://support.propertyshark.com/hc/en-us/articles/360022415412-What-data-can-I-find-in-Property-Reports), [official research-tools guide](https://support.propertyshark.com/hc/en-us/articles/360022664771-Using-Reasearch-Tools-Inside-Property-Reports)

## Design inferences for Prime America

These recommendations are hypotheses to test against the current preview. The sources establish interface patterns; they do not prove that a palette, font, rounded corner or layout makes users feel cozy.

| Consumer task | Proposed treatment | Data boundary |
| --- | --- | --- |
| Browse any inventory | Bring property cards into the first screen. Use one compact search surface, clear selected filters and quiet secondary controls. Prefer spacious photo cards, warm neutral surfaces and consistent text hierarchy. | Keep source attribution readable and consumer-permitted detail discoverable. |
| Rent a home | Foreground neighborhood, rent basis, beds/baths and verified lease/pet/utility facts. Use rental-specific headings and plain actions. | Never label asking rent as total monthly cost unless required charges are known. Unknown policy remains unknown. |
| Buy a home | Foreground price, beds/baths, area, property subtype and address. Keep monthly estimates editable and nearby on detail pages. | Distinguish condo/co-op costs; partial mortgage estimates remain partial. |
| Find business space | Show use, building/available size with units, lease basis and relevant zoning facts. Prioritize size/budget controls over residential bedroom controls. | Do not infer rentable area from gross building area or invent a per-square-foot rate. |
| Evaluate an investment | Give units, income/expense/tax facts and a clear path to structured property research. | Display cap rate only from a reliable supplied value or an explained calculation with known inputs. Public-record research requires its own data integration. |
| Return to a shortlist | Preserve selected view, filters, saved homes and saved searches. Keep these utilities accessible without making them compete with photos and prices. | Local browser saves are not account sync or delivered alerts. |

A compact overview must coexist with the existing full searchable detail view. Progressive disclosure changes presentation, not access to permitted information. Random photography remains drawn from matching records; imagery must not imply different inventory or silently loosen a filter.

## Verification limits and next validation

Public-page text and official documentation support the information hierarchy above. Authenticated competitor tools were not entered, paid features were not purchased, and exact current color, spacing, animation, map responsiveness or keyboard behavior was not measured. Inventory counts and prices are transient and are not used as benchmarks here.

Evaluate the revision with renters, buyers, commercial tenants and investors completing the same tasks: find a candidate, explain price and units, identify unknowns, save it, reopen the search and request the appropriate next step. Compare task success, errors and subjective comfort; do not claim competitive superiority from resemblance or feature counts.
