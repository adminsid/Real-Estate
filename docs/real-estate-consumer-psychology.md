# Consumer decision research for Prime America property search

Research date: October 7, 2026. Scope: all five NYC boroughs; OneKeyMLS and NYStateMLS inventory plus Prime America public and private exclusives. Demo inventory is development data, not evidence of live market coverage.

## Decision

Build the place where a shopper can confidently identify a suitable home, understand its uncertainties, and move forward with a responsible local team. Measure decision quality and fulfilled requests, rather than treating clicks or captured telephone numbers as success. Outperforming Zillow is an ambition to test; no evidence currently establishes that Prime America is ahead.

**User-directed transparency requirement:** consumers must have access to the depth of consumer-permitted property information, without artificial lead gates or an assumption that technical detail exceeds their ability. A readable overview and full, searchable property details should coexist. Preserve source values, explain terms, disclose adverse facts, and label missing versus access-restricted versus not-yet-integrated information accurately. This is a product commitment, not evidence that every consumer is more knowledgeable than every agent. The detailed acceptance criteria are in [the property-search specification](nyc-property-search-spec.md#consumer-information-transparency).

This document separates **evidence** (linked research or official guidance), **product hypotheses** (proposed behaviors to validate), and **operating requirements** (work Prime America must actually deliver). It is a research and design brief, not a legal opinion, financial recommendation, or validated NYC consumer study.

## What the evidence supports

Zillow's national prospective-buyer survey ranks floor plans first among listing features for 33% of respondents, high-resolution photos for 26%, and virtual tours for 20%. These are reported preferences, not causal conversion results; national results do not establish identical preferences across NYC boroughs. [Zillow 2025 prospective buyers](https://www.zillow.com/research/prospective-buyers-consumer-housing-trends-2025/)

Do not assert that more choice always paralyzes shoppers. A research meta-analysis found substantial variation between experiments and an average effect near zero. Our hypothesis is that explicit priorities, consistent attributes, and reversible filtering can make NYC search easier; that needs task testing. [Scheibehenne, Greifeneder, and Todd, 2010](https://doi.org/10.1086/651235)

Monthly principal and interest are insufficient to explain ownership costs. CFPB guidance distinguishes taxes, insurance, assessments, closing costs, and cash required to close. Calculators should expose assumptions and unknown components instead of presenting an incomplete payment as an authoritative total. [CFPB Loan Estimate explainer](https://www.consumerfinance.gov/owning-a-home/loan-estimate/)

The FTC identifies hidden costs, misleading urgency, disguised advertising, and designs that induce unwanted data sharing as harmful patterns. Trust-oriented product choices follow from this guidance; their effect on our retention remains a hypothesis. [FTC dark patterns report](https://www.ftc.gov/reports/bringing-dark-patterns-light)

Housing advertising must avoid stated or implied preferences based on protected classes. Use objective property facts and shopper-selected destinations, rather than demographic assumptions or descriptions such as “perfect for young families.” NYC protections are broader than federal protections. [NYC advertising guidance](https://www.nyc.gov/site/fairhousing/rights-responsibilities/real-estate-advertisements.page), [NYC protected classes](https://www.nyc.gov/site/fairhousing/rights-responsibilities/what-are-the-protected-classes.page)

## Competitive reality

Photo galleries, maps, favorites, alerts, comparison, and AI search are baseline capabilities, not evidence of an advantage. Zillow documents natural-language search including commute, affordability, and nearby destinations, plus saved search notifications. [Zillow search announcement](https://www.zillow.com/news/zillows-ai-powered-home-search-gets-smarter-with-new-natural-language-features/)

Zillow also documents comparing up to five saved homes, notes, and shareable comparison links. [Zillow Homes to Compare](https://www.zillow.com/learn/home-comparison-tool-zillow-app/)

Its March 2026 AI mode announcement describes conversational discovery connected to tour scheduling and agents. This verifies an announced capability, not universal rollout, product quality, or performance on NYC tasks. [Zillow AI mode](https://www.zillow.com/news/zillow-debuts-ai-mode/)

Our plausible wedge is reliable NYC-specific information and accountable local execution. Validate it with the same concrete shopper tasks on both services; do not declare victory from feature counts.

## The journey: psychology hypotheses translated into product and operations

| Stage | Shopper question | Product hypothesis | Required operating handoff |
| --- | --- | --- | --- |
| Discovery | “Can this help me find something relevant?” | Search leads the homepage; borough and neighborhood entry points offer real available inventory, with coverage explained. Marketing links preserve the advertised criteria. | Inventory owner checks coverage, permission, attribution, and refresh health. Campaign owner verifies destination matches copy. |
| Search | “What should I prioritize?” | Show clear filter chips, result counts, a reset, and URL-preserved state. Ask for must-haves separately from preferences; avoid a lengthy mandatory onboarding quiz. Zero-results suggestions say exactly which criterion changes. | Product monitors common failed searches and missing field coverage. No invented matches or silently relaxed criteria. |
| Evaluation | “Can I picture using this space?” | Real property photography and a floor plan appear before lengthy sales copy. Room labels and media order help shoppers orient themselves. Show unavailable media honestly. | Listing team validates photos, room labels, rights, order, dimensions, and material edits. |
| Affordability | “What would living here actually cost?” | Editable estimates distinguish mortgage, taxes, insurance, condo common charges/co-op maintenance, assessments, and cash to close. Unknown means unknown. Avoid double-counting tax when maintenance includes it. | Agent verifies building-specific inclusions and requirements; lender supplies actual finance terms. Financial records stay outside generic analytics. |
| Building fit | “What could disqualify this home?” | Source-labelled pet, sublet, financing, occupancy, accessibility, and approval facts appear alongside their verification date. HDFC/restrictions are explained when confirmed. | Agent confirms policies against authorized current documents. Never infer board rules or eligibility from property type alone. |
| Comparison | “Which tradeoffs matter to us?” | A compact shortlist compares monthly components, layout, building facts, and missing information. Shared notes support co-decision without publishing private annotations. | Consent controls determine what an agent or collaborator can see. Private exclusive access does not grant general access to other listings. |
| Return | “What changed since I last checked?” | Saved searches offer explicit channel/frequency choices; alerts explain the match and material change. Browsing remains possible without subscribing. | Alert service rechecks display permission, deduplicates, suppresses removed listings, and honors opt-outs. |
| Inquiry | “Who answers, and what happens next?” | Distinct actions: ask a question, request a tour, and discuss selling. Explain the recipient and give a realistic response expectation. | CRM stores source listing, source key, question, preferred channel, consent, assigned owner, and acknowledgement. Retry safely; never show success for a failed submission. |
| Tour | “Is this worth the trip?” | Tour requests clearly distinguish requested from confirmed. A preparation sheet captures priorities and unanswered questions; after-tour notes inform the shortlist. | Agent confirms availability, access and appointment with the listing side; CRM records request, confirmation, completion, cancellation, and follow-up. |
| Offer | “What am I agreeing to?” | A shared checklist surfaces actual deadlines, contingencies, documents, and responsible people. Do not gamify urgency or estimate acceptance odds without evidence. | Agent, attorney, and lender own their respective decisions. Transaction workflow records confirmed milestones and unresolved blockers. |
| Closing | “What remains before keys?” | Status updates show the next action and owner. Estimates and final documents remain visibly distinct. | Closing team reconciles required documents and deadlines. CFPB describes the Closing Disclosure as final loan and closing-cost information. [CFPB](https://www.consumerfinance.gov/owning-a-home/closing-disclosure/) |
| Post-close | “Will they still help?” | Useful move-in resources and an optional check-in support a continuing relationship. Ask for a review only after service; obtain separate marketing consent. | CRM records service follow-up and referrals without automatically enrolling people into campaigns. |
| Seller acquisition | “Will they market and handle my home well?” | Show actual media examples, a transparent preparation plan, service responsibilities, and attributable outcomes rather than unsupported reach claims. | Seller lead becomes an owned appointment; signed listing and sharing permissions control publication. |

These proposed interactions are hypotheses, not claims that a specific psychological trigger guarantees a sale.

## Media system

1. **Capture:** prioritize truthful, well-lit property images, a legible floor plan, and usable captions. For exclusives, commission missing essential media before expensive lifestyle films. Record rights and provenance.
2. **Organize:** exterior/arrival, principal living area, layout, kitchen, bedrooms, bathrooms, outdoor/building features. Let shoppers jump to rooms. Preserve the full authorized gallery; never hide a material issue through ordering or selective cropping.
3. **Explain:** room names, dimensions only when verified, and date/source. Do not use AI to alter factual property photos. If a provider supplies authorized staged imagery, preserve its disclosure and access to accurate original imagery where available and permitted.
4. **Deliver:** responsive sizes, stable image aspect ratios, lazy loading beyond the first meaningful image, useful failure states, and no autoplay video. A beautiful gallery that stalls search is a failed experience.
5. **Distribute:** a listing remains the canonical destination. Social clips answer one factual question and link to that listing or an equivalent preserved search. Do not send private exclusive imagery into public feeds automatically.
6. **Evaluate:** test whether shoppers can identify layout, a suitable room, and unresolved questions. Gallery click counts alone cannot prove a better decision.

**MLS media pipeline:** immediately download authorized media on the server, store the permitted local asset, and serve that asset to the browser. MLS Grid's current media documentation describes signed, single-use URLs expiring after one hour; it explicitly says not to store/cache raw URLs for later download. The token-required download stays server-side. Track media keys and changes, and remove records/assets when display permission is lost. Local replication enables a dependable gallery; it is not permission to republish into arbitrary marketing channels. [MLS Grid API 2.0 media and replication](https://docs.mlsgrid.com/api-documentation/api-version-2.0)

Accessibility is part of the media experience: meaningful captions/alternative text, keyboard controls, announced gallery state, visible focus, reduced-motion support, and a text/list alternative to map navigation. W3C guidance requires operable carousel controls and user control over rotation. Prefer a manually controlled gallery. [W3C carousel guidance](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/)

## Ten prioritized differentiation hypotheses

All ten require a comparison against the existing experience, not an assertion that competitors lack them.

| Priority | Hypothesis and minimum experiment | Primary measure | Guardrail / dependency |
| --- | --- | --- | --- |
| P0 / 1 | A clear listing source, update time, and unavailable/unknown facts increase confidence. Moderated tasks followed by a freshness panel test. | Correct availability interpretation; resolved-question rate | Accurate timestamps; removed listings cannot remain actionable. |
| P0 / 2 | Layout-first media helps people reject unsuitable homes earlier. Compare photo-only versus room-labelled gallery plus floor plan. | Correct layout understanding; suitable shortlist rate | Media permission and completeness; no fabricated floor plan. |
| P0 / 3 | An itemized NYC monthly estimate prevents price-only misranking. Test price ordering versus editable cost comparison. | Correct cost interpretation; number of avoidable affordability mismatches | Assumptions exposed; missing fees visible; no approval promise. |
| P0 / 4 | Condo/co-op distinctions and verified policy facts reduce wasted inquiries. Test a brief building-fit panel. | Policy questions answered; tours cancelled for known policy mismatch | Field coverage and agent verification; unknown is not “allowed.” |
| P0 / 5 | A named, accountable inquiry route beats a generic lead form. Test question/tour actions with transparent recipient and acknowledgement. | Human response time; question resolution; fulfilled tours | Delivery failures, unwanted contact, agent capacity. |
| P1 / 6 | Reversible filters and transparent zero-result relaxations help shoppers reach useful results. Task test exact needs across boroughs. | Task success; time to first suitable shortlist | No silent relaxation; preserve user control and inventory recall. |
| P1 / 7 | A NYC tradeoff comparison with shared notes improves co-decisions. Prototype with pairs before implementation. | Ability to explain preferred choice; repeat shortlist use | Privacy permissions and revocation; compare is already a Zillow feature. |
| P1 / 8 | Change-focused alerts at chosen cadence drive useful returns. Test opt-in daily summary versus chosen material-change alerts. | Alert-to-qualified-return rate; useful-change rating | Unsubscribe/complaint rate; no public dissemination of private records. |
| P1 / 9 | Confirmed tour preparation and post-tour notes improve progression. Pilot an agent-owned tour workflow. | Confirmed-to-attended tours; unresolved questions after tour | Requested is not confirmed; cancellation and agent workload. |
| P2 / 10 | Proof of media quality and service accountability earns seller appointments. Test a real case study/marketing plan versus generic valuation CTA. | Qualified seller appointment and signed-listing rate | Verifiable outcomes, consented case studies, appointment completion. |

## Validation and measurement plan

Start with 12–15 moderated research sessions across boroughs and relevant property types, including first-time buyers, experienced buyers, renters if in scope, co-shoppers, and assistive-technology users. This is a proposed discovery sample, not statistically representative evidence. Recruit around actual tasks and housing needs; never use protected-class assumptions to rank listings or steer people.

Ask participants to find a candidate, explain why it fits, estimate what remains unknown, compare two homes, and request a next step. Observe mistakes rather than asking only whether the page looks good. Run a matched Zillow task where feasible with equivalent inventory and record platform limitations. Acknowledge coverage differences instead of attributing them to interface quality.

Instrument `search_submitted`, `results_returned`, `filter_changed`, `listing_opened`, `media_opened`, `shortlist_saved`, `comparison_opened`, `inquiry_submitted`, `inquiry_delivered`, `human_response`, `tour_requested`, `tour_confirmed`, and `tour_completed`. Define a qualified outcome with the sales team before launch. Keep private tokens, personal notes, and financial details out of event payloads; deduplicate inquiry events.

Report search success, freshness lag, missing facts/media, question resolution, median and tail response times, confirmed and attended tours, repeat useful sessions, accessibility task success, and unwanted-contact rates. Separately report operational outcomes—offers, closings, seller appointments—because interface engagement alone cannot establish their cause.

Once traffic supports experiments, predefine the target metric, unit of randomization, minimum meaningful effect, sample-size calculation, observation period, and stop rules. Avoid repeatedly checking small samples for a winner. At demo-stage traffic, usability testing and operational pilots are more useful than claiming statistical conversion uplift.

## Delivery order

**First:** truthful media, source/freshness states, usable search, clear listing facts, accessible detail pages, working inquiry delivery, and agent ownership. **Next:** itemized NYC costs and verified building-fit information, followed by shortlist/comparison and consented alerts. **Then:** tour and transaction continuity, seller evidence, and targeted advanced search where data quality supports it.

Private exclusives are link-accessible by the user's specified policy. Treat the link as a bearer capability: explain that recipients can forward it, support revocation, and prevent inclusion in public search, sitemaps, social distribution, shared analytics payloads, and public caches. This product rule comes from the project scope, not from a psychological study.

The strongest marketing promise is one operations can fulfill: relevant homes, clear tradeoffs, and a local person who follows through. Publish superiority claims only after measured evidence supports a specific, fairly compared outcome.
