# Prime America Real Estate — Website vocabulary and presentation guide

Status: proposed consumer website standard, October 7, 2026. This guide specifies copy and design; it does not mean the features below have been built. Applies to search across Manhattan, Brooklyn, Queens, the Bronx, and Staten Island, MLS listings, and Prime America exclusives.

Related: [consumer research](real-estate-consumer-psychology.md), [marketing playbook](nyc-real-estate-marketing-playbook.md), [product specification](nyc-property-search-spec.md).

Legal terminology, agency/contact roles and rights-sensitive copy also follow the proposed [search trust and language guide](search-trust-and-language-guide.md). Its moderation safeguards qualify the source-preservation rules below; neither guide certifies production compliance.

## Voice: clear, capable, helpful

Treat people as capable decision makers. Make the wording easier to understand without reducing the information available. Use real estate terms when they name a real concept; explain unfamiliar terms beside the facts. Keep every consumer-permitted supplied detail available in **All property details**.

- Lead with what the person can do: “Search homes,” “Compare homes,” “Request a showing.”
- Use familiar words, active verbs, short sentences, and sentence case. Address the person as “you.”
- Name the result of an action. Replace “Submit” with “Send question” or “Request a showing.”
- Use precise promises. A tour request is a request until someone confirms it.
- Explain uncertainty: distinguish source facts, estimates, missing data, and unavailable data.
- Avoid pressure and unsupported claims: “exclusive opportunity,” “act now,” “perfect investment,” “best neighborhood,” and invented popularity counts.
- Preserve lawful, authorized source remarks and unfavorable facts; put explanations alongside them. Potentially discriminatory or deceptive remarks require broker review before publication under the [moderation policy](search-trust-and-language-guide.md#7-imported-mls-language-needs-supervision-too). Do not silently sanitize a feed or automatically republish harmful language merely because it came from an MLS.

Plain language supports understanding for the intended audience; it does not require removing technical information. See [Digital.gov: Write for the reader](https://digital.gov/guides/plain-language/principles/write-for-reader) and [Short and simple](https://digital.gov/guides/plain-language/principles/short-simple).

## Navigation and search

| Context | Preferred wording | Avoid |
| --- | --- | --- |
| Main navigation | Buy · Rent · Sell · Saved homes | Inventory · Acquisition · Disposition |
| Homepage heading | Find your next place in New York City. | Unlock unparalleled living |
| Search label | Neighborhood, address, ZIP code, or MLS number | Enter query |
| Search action | Search homes | Explore opportunities |
| Location choices | Manhattan · Brooklyn · Queens · The Bronx · Staten Island | Borough abbreviations alone |
| Price filter | Price · Minimum price · Maximum price | Financial parameters |
| Rental price | Monthly rent | Price without a time period |
| Rooms | Bedrooms · Bathrooms | BD/BA without an explanation |
| Property filter | Home type | Asset classification |
| More controls | More filters · Show results · Clear filters | Refine parameters · Execute |
| Search views | Map · List | Geographic visualization |
| Sort | Price: low to high · Price: high to low · Newest listings | Ascending · Descending |
| Empty result | No homes match these filters. Try a wider price range or another area. | No records found |

“Homes” is appropriate for residential searches. Use “Properties” for a search that includes commercial property, land, or mixed inventory. Never label all five boroughs “New York” if that could be mistaken for Manhattan.

Display friendly property-type labels while retaining exact source values in the details: **Homes for sale** (Residential), **Homes for rent** (Residential Lease), **Multi-unit investment properties** (Residential Income), **Commercial properties for sale**, **Commercial properties for lease**, and **Land**. Do not infer a condo, co-op, studio, or legal unit count from an ambiguous field.

## Buttons: name the action and its outcome

| Task | Button | Result or supporting copy |
| --- | --- | --- |
| Open a listing | View home | Use View property for nonresidential inventory |
| Open photography | View 24 photos | Use the actual available count |
| Open a floor plan | View floor plan | Label each plan and its source |
| Read source remarks | Read listing description | Preserve authorized remarks subject to the broker's publication review |
| Inspect all fields | All property details | Searchable, grouped facts with source labels |
| Save | Save home | Saved; action becomes Remove from saved homes |
| Compare | Add to comparison | Compare 3 homes when three are selected |
| Share public listing | Share home · Copy link | Link copied |
| Share private exclusive | Copy private link | Anyone with this link can view this listing and forward the link. |
| Inquiry | Ask a question · Send question | Your question was sent only after successful delivery |
| Showing request | Request a showing | Choose preferred times. The appointment is confirmed only after the responsible professional confirms it. |
| Tour confirmed | View tour details | Include confirmed time, time zone, address, and cancellation action |
| Alerts | Create search alert | Explain delivery channel and frequency before activation |
| Alert removal | Turn off alerts | Alerts are off |
| Seller contact | Tell us about your property | Use Request a pricing review for an actual pricing-review service |
| Retry | Try again | Preserve entered information |
| Modal exit | Close | For an unsent form use Cancel and explain any discarded changes |

Use one primary action per decision area, with quieter secondary actions. Avoid vague “Continue” unless the next step is named nearby. Do not show controls for features that cannot yet complete the promised action.

## Listing status: readable labels, exact source meaning

Keep the RESO StandardStatus value available in All property details. The plain-language explanation must not claim more than the source establishes; provider-specific meanings should be reviewed before release.

| Source status | Consumer label | Brief explanation |
| --- | --- | --- |
| Active | For sale / For rent | Currently listed. Availability can change; verify before making plans. |
| Coming Soon | Coming soon | Not yet active. Check the listing's availability and showing information. |
| Active Under Contract | Under contract | A contract is in place. Ask whether additional offers or tours are being considered. |
| Pending | Pending | The transaction is awaiting completion. |
| Closed | Sold / Rented | Completed transaction; choose wording from the transaction type. |
| Hold | On hold | Listing activity is paused. |
| Withdrawn | Withdrawn | Removed from active marketing. |
| Canceled | Canceled | The listing was canceled. |
| Expired | Expired | The listing period ended. |
| Delete / unknown | No consumer status inference | Apply feed permissions; do not invent availability. |

Do not turn “Under contract” into “Sold,” or “Active” into “Guaranteed available.” Unknown transaction types retain “Closed.” Status must appear as text, not just a colored dot.

## Real estate terms with a useful explanation

These are short interface explanations, not substitutes for the specific listing, building documents, lender terms, or contract.

| Keep this term | Explain it this way |
| --- | --- |
| MLS number | The listing's reference number in its multiple listing service. |
| Listing brokerage | The company identified as listing this property. Explain its representation role separately. |
| Prime America exclusive | A listing marketed exclusively by Prime America. Use only when verified. |
| Condo | You own the apartment and a share of the building's common areas. |
| Co-op | You buy shares in a corporation and the right to occupy an apartment. Building approval may be required. |
| Condop | A building with a condominium and cooperative ownership structure. Check the specific ownership and rules. |
| Common charges | Recurring condominium charges for shared building expenses. Property taxes may be separate. |
| Maintenance | Recurring co-op charges. What they cover varies; check the building's breakdown. |
| HOA fee | A homeowners association charge. Show the frequency and what is included when supplied. |
| Assessment | An additional building or association charge. Show its amount, frequency, and end date when known. |
| Property taxes | Taxes charged on the property. Show the period and whether an exemption or abatement applies when known. |
| Tax abatement | A reduction in property taxes that may have conditions or an expiration date. |
| Down payment | The portion of the purchase price you pay upfront, excluding closing costs. |
| Preapproval | A lender's preliminary assessment of borrowing eligibility; final approval depends on its requirements. |
| Contingency | A contract condition that must be met or addressed for the purchase to proceed. |
| Closing costs | Transaction expenses beyond the purchase price and down payment. |
| Board approval | Approval required by the building's board under its rules. |
| Sublet policy | The building's rules for renting your apartment to someone else. |
| Sponsor sale | A sale by the building's sponsor. Check the listing's approval requirements and terms. |
| As-is | Offered in its current condition, subject to the contract. It does not explain the condition by itself. |
| Square footage | The reported floor area. Show the source and measurement basis when available. |

Do not merge maintenance, common charges, taxes, and assessments into one unexplained “HOA” number. Avoid describing schools or neighborhoods through assumptions about who belongs there. Present objective, attributed facts and let people choose their own priorities.

## Facts, money, dates, and missing information

- Prices: **$850,000**; rent: **$3,200/month**; fees: **$950/month**; taxes: **$7,800/year**. Preserve the original period before calculating equivalents.
- Cost heading: **Estimated monthly cost**. Show mortgage assumptions, taxes, building charges, insurance, assessments, and exclusions separately. An unreported charge is **Not provided**, not $0. Avoid a “total” that silently omits unknown costs.
- Counts: **2 bedrooms · 1 full bathroom · 1 half bathroom**. Never combine half baths into a misleading full-bath count.
- Area: **1,200 sq ft**, with “Reported by the listing brokerage” when appropriate. Do not claim verified measurements without verification.
- Dates: **October 7, 2026** in details; concise **Oct 7** where the year is unambiguous. Tour times: **Tuesday, Oct 13 at 2:00 PM ET**, using daylight-aware New York time handling.
- Freshness: **Listing updated [source timestamp]** and, where useful, **Last checked [sync timestamp]**. These are different events. Avoid “Updated today” based only on a page refresh.
- Preserve supplied zero, false, and negative values. Display **No** distinctly from **Not provided**.

| Data state | Copy |
| --- | --- |
| Not supplied by the source | Not provided in this listing |
| Source intentionally withholds address | Address withheld by the listing source |
| Consumer display is restricted | Not available for public display |
| Integration does not yet support the field | Not available in this preview yet |
| Demo inventory | Demo listing — not verified current inventory |
| Estimate | Estimate based on the assumptions below |

Explanations must match the actual reason. Show restriction notices only in an authorized context; do not reveal protected values or the existence of a private listing to unauthorized visitors. Never use “Contact us for details” as a replacement for facts already approved for public display.

## Forms and service messages

| Situation | Copy |
| --- | --- |
| Inquiry introduction | Ask about this property. Tell us what you would like to know. |
| Contact labels | Name · Email · Phone (optional) · Your question |
| Email validation | Enter an email address like name@example.com. |
| Required question | Add your question so we know how to help. |
| Loading search | Finding matching homes… |
| Search failure | We couldn't load the listings. Try again. |
| Sending failure | Your question wasn't sent. Your message is still here. Try again. |
| Tour request received | We received your tour request. We'll contact you to confirm a time. |
| No photography | Photos haven't been provided / Photos aren't available in this preview yet — choose the true reason |
| Alert opt-in | Email me new listings that match this search. |
| Private listing unavailable | This private link is no longer available. |

Keep labels visible rather than using placeholders alone. Put specific errors beside the affected field and preserve the person's work. Separate an inquiry response from optional marketing enrollment. Do not promise response deadlines until the operation can meet them. These practices follow [W3C form labeling guidance](https://www.w3.org/WAI/tutorials/forms/labels/).

## Presentation baseline

The consumer research supports useful information, clear costs, usable media, and honest next steps. It does **not** establish a winning color, font, image size, or conversion lift for Prime America. The following are design starting points to test with NYC buyers, renters, and sellers, including experienced consumers.

| Element | Starting standard | Purpose |
| --- | --- | --- |
| Color | Deep navy #17243B; white #FFFFFF; light background #F4F5F7; restrained gold #B19029 accent | Consistent brand hierarchy; gold is decorative until its particular contrast pairing is verified |
| Primary action | White text on a deep navy button | Clearly distinguish the next action |
| Status | Text plus optional color/icon | Meaning survives color blindness and monochrome display |
| Font | System UI sans-serif initially; consider a self-hosted font after readability testing | Readable, fast, familiar interface |
| Body | 16–18 px, roughly 1.5 line height | Comfortable reading; support zoom rather than enforcing a fixed size |
| Supporting text | Start at 14 px; keep fees, attribution, and disclosures legible | Important facts deserve usable type |
| Headings | 32–48 px desktop; 28–36 px mobile, responsive to available space | Clear hierarchy without pushing search below the fold |
| Actions | Aim for at least 44 × 44 CSS px targets with spacing | Comfortable touch interaction |
| Listing cards | One column on narrow screens; two or three when space permits | Scan price, location, status, rooms, and recurring costs |
| Detail page | Summary → photos/floor plans → costs → building/location facts → all details → next steps | Fast orientation with complete information still available |
| Photos | Real listing media, useful sequence, explicit staging disclosures | Help people assess the property accurately |
| Floor plans | Full readable plan with zoom; preserve supplied labels and dimensions | Support layout decisions |
| Gallery | Manual navigation, photo count, captions, keyboard support, close control | Keep the visitor in control |

Check every actual color pairing and interactive state. WCAG 2.2 AA specifies 4.5:1 contrast for normal text, 3:1 for qualifying large text, and a 24 CSS px minimum target rule with exceptions; 44 px is our proposed more comfortable baseline. Also verify focus visibility, non-text contrast, keyboard operation, zoom, and reflow. See [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

Use crops only when they preserve useful property information; let the gallery reveal the complete original image. Never remove staging watermarks or make AI-generated interiors look like actual listing photography. Label proposed renovations, virtual staging, and neighborhood illustrations. Use descriptive alternative text based on known content rather than invented room features. Keep public-display media permissions and source attribution intact.

## Review and testing

Before releasing a screen, check that its buttons say what happens, the facts retain their source meaning, every cost has a period, missing data is explicit, and all consumer-approved details remain available. Test keyboard, mobile, zoom, and screen-reader labels.

Ask participants to find a home, explain its status and monthly costs, compare two properties, share a listing, and request a tour. Observe whether they understand the result before clicking. Measure task completion, mistakes, time to find key facts, and confidence grounded in correct answers. Test presentation variants against these outcomes; conversion alone does not prove understanding.

### Comfort and browsing revision — October 8, 2026

Use a calm, task-specific heading: “Find a place to call home” for buyers, “Find your next New York home” for renters, and business or property-research language for commercial and investment searches. Keep location and budget immediately available. Extended filters and viewing preferences use explicit expandable controls, not separate dashboard panels. The main results show price, a few appropriate supplied facts, address, source attribution, and a clear next step.

“Rent from” and “Rent up to” filter the source asking amount; they do not claim a monthly total. Lease cards identify supplied price frequency or explicitly state that it was not provided. Building area retains its source units and is not renamed available or rentable space. Investment summaries do not invent annual income periods or cap rates. Missing facts remain available as unknowns on the full details page.

Hearts have accessible Save/Unsave labels naming the property. Inline previous/next photo controls have property-specific labels and announce photo position. Full photos and every permitted imported detail remain available through the listing page. Cozy presentation is a design hypothesis; it does not establish usability or conversion results without consumer testing.

## Implemented local reading and contact vocabulary — October 8, 2026

| Consumer intent | Label | Meaning in this preview |
| --- | --- | --- |
| Scan multiple properties | Cards at a glance | Several cards; available density depends on screen width |
| Compare facts in rows | Detailed list | A wide row per property |
| Focus on one match | One property at a time | Previous/Next property advances through the filtered results |
| Read the essentials first | Key facts first | Additional sections and the full source description remain expandable |
| Read all sections together | Every section open | Opens the supplied property facts, costs and imported field groups |
| Investigate a field | Find a detail | Searches human labels, original field names and supplied values |
| Visit a property | Request a showing | Preferred date/time; no claim of confirmed availability |
| Save a showing in the demo | Save demo showing request | Saves locally; does not contact anyone or reserve a time |
| Save a question in the demo | Save demo question | Saves locally; no message or email is sent |
| Reach supplied public contact | Email listing contact / Call listing brokerage | Opens the consumer’s email or phone app; no guessed contact data |

Production receipt and confirmation language elsewhere in this guide must only be used when the corresponding delivery or confirmation has actually occurred. The local preview’s success text states that the record was saved locally and no appointment, message or email was sent.
