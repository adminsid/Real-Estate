# IDX display review — local listing preview

Reviewed October 7, 2026 against [MLS Grid IDX rules](https://www.mlsgrid.com/resources) and [OneKey's MLS Grid rules resource](https://support.onekeymls.com/hc/en-us/articles/43268287278996-MLS-GRID-IDX-and-VOW-Rules). The linked Grid rules PDF is dated October 29, 2025. This is an implementation inventory, not MLS approval or certification. The signed agreement and applicable MLS governing documents determine the production requirements.

| Requirement | Local implementation | Production work still needed |
| --- | --- | --- |
| IDX eligibility and removals | MlgCanView must be true; MlgCanUse must include IDX; entire-listing opt-out removes listing and media access | Approved live subscription and continuous replication |
| Address restrictions | Withheld address/coordinates excluded; source remarks and legal description suppressed when address is withheld; media captions suppressed at read time | Review source's safe address-withheld description policy and local fields |
| Consumer field policy | Explicit versioned development allowlist in client.mjs; no arbitrary raw JSON exposure, seller/occupant details, showing instructions, security codes, listing agreement type, signed photo URLs, or agent-only remarks | Obtain each MLS's authorized/confidential field inventory, review local fields, expand all permitted facts, and audit additions |
| Listing attribution | Brokerage, MLS number, source, source status, supplied public contact adjacent to card/details; agent name when supplied | Verify each MLS's attribution requirements and typography in approved final design |
| Source and hosting brokerage | Prime America Real Estate visible; OneKey MLS and MLS GRID identified | Approved MLS Grid icon/logo and any OneKey/NYStateMLS required marks |
| Data freshness | Source modification timestamp; per-record obtainedAt recorded on future imports; source checkpoint timestamp on results | Automated refresh at least every 12 hours under current Grid rules, outage monitoring, removal checks, per-record freshness for legacy imports |
| Data integrity | Original remarks retained unless address protection requires suppression; exact numbers in All imported property details; friendly labels alongside original field names | Confirm allowed RESO normalization and local status rules; document source corrections |
| Supplemental content | Calculator marked as a user-input estimate, not an appraisal or rate offer; unknown costs remain excluded and visible | Add monitored accuracy/copyright contact; mortgage assumptions and fee policies reviewed for production |
| Combined sources | Source filter included; OneKey identified per listing | Integrate NYStateMLS and exclusives only with appropriate permissions and distinct source attribution |
| Notices | Readable personal-use, accuracy, source, availability, other-brokerage, and demo notices | Install exact approved mandatory wording, end-user terms where applicable, DMCA notice and designated contact; current preview paraphrases are not substitutes |
| Seller-controlled comments/value estimates | No third-party comments or automated market valuation | Honor seller opt-outs before adding either feature |
| Search limits | 24 records per page with pagination over the imported slice | Enforce applicable query limits; Grid rules specify up to 2,500 per search and prohibit certain lower caps; pagination is not a total result cap |
| Photos | Locally replicated public media; aspect-preserving WebP variants; original access; staging disclosures retained; eligibility checked before bytes and 304 responses | Approved production media pipeline, responsive variants on ingestion, any MLS-specific sold-photo restrictions, storage lifecycle |
| Private exclusives | Not included in this preview | Do not treat a private link as an exemption from seller directions, license rules, or applicable marketing/submission requirements |
| Security and scraping | Loopback only; host/origin checks for writes; strict CSP; bounded request body; public projections; no inquiry inbox exposed | Live security, monitoring, abuse controls, MLS-required reporting, retention and privacy operations |

The demo is not a live IDX launch. Do not publish it as an approved feed site until the pending rows are resolved. NYStateMLS requires its own agreement and policy review; OneKey/MLS Grid permissions do not automatically cover it.

## Consumer cost estimates

The fixed-rate calculator uses an amortizing principal-and-interest formula and supports zero interest and cash purchases. Taxes and association charges are converted only when their periods are supplied; unknown charges are excluded and the result is labeled partial. For co-ops, separate taxes begin blank to avoid automatically double-counting taxes that may already be in maintenance. The interface explains exclusions, loan/down-payment amounts, total loan interest, and that the illustrative interest rate is not APR or a live quote. See [CFPB: rate versus APR](https://www.consumerfinance.gov/ask-cfpb/what-is-the-difference-between-a-mortgage-interest-rate-and-an-apr-en-135/) and [CFPB: comparing rate scenarios](https://www.consumerfinance.gov/owning-a-home/explore-rates/).
