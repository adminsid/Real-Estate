# Connected workspace: audit findings and delivery plan

Date: 2026-09-04
Status: Full delivery authorized by the user; implementation and verification in progress as of 2026-09-06. See [delivery evidence](connected-workspace-delivery-evidence.md). No production rollout has yet been recorded.

## Scope and evidence limits

This is the initial source-code audit of Workspace, CRM, Transactions, Inventory, Open House, and Brand Hub. Findings describe the current local working trees, which contain substantial existing modifications. They do not establish what is deployed. Production data, role-by-role browser behavior, security controls, performance, backup scheduling, and restoration have not been independently verified. This is not a completed security certification or exhaustive functional audit.

The accepted objective is one connected business system: shared identities, consistent rules, visible freshness, recoverable cross-app work, and explicitly supported offline workflows. A durable server save, a save on one device, and successful delivery to another app are different acknowledgments.

## Existing foundations to preserve

- Inventory resolves tenant-scoped Property identities in `../listing-input/src/property-identity.ts`; the earlier data-model document's claim that Property does not exist is outdated.
- Workspace migration 048 adds durable CRM source relationships, listing/event attribution, and professional-license identity.
- Open House migrations 012 and 013 add listing/property/agent references, CRM sync state, and listing snapshot provenance.
- Open House already has a durable media-operation outbox and reconciliation code in `../open-house/src/lib/media-ops.ts`. Reuse its lessons; do not assume the same mechanism covers attendance or all apps.
- Workspace migration 050 separates earned commission, payments, advances, and other ledger entries; source-key uniqueness is a useful duplicate-processing safeguard.
- ADRs 003–007 already establish much of the intended ownership, evidence, consent, and accounting vocabulary.

## Prioritized findings

Priority here sets implementation order; it is not a claim of an observed production incident.

| ID | Priority | Evidence and consequence | Planned correction and acceptance check |
| --- | --- | --- | --- |
| CW-01 | P1 | `../open-house/src/index.ts:296` returns from `syncGuestToCrm` when listing ID or agent ID is absent. Manually entered events without Inventory links therefore cannot complete this CRM path. | Make listing attribution optional while requiring valid tenant/assignment context. Manual-event attendance must create or link a contact and preserve event attribution without inventing a listing. Missing assignment needs a visible repair state. |
| CW-02 | P1 | The same function records CRM failures, but the inspected callers invoke it only during submissions. No attendance replay worker was found in the inspected source. A saved visitor can remain unsynced after an outage. | Commit attendance and its pending delivery together, replay with bounded retries, and provide reconciliation. Disable CRM during submission, restore it, and prove eventual contact linkage without another visitor submission. |
| CW-03 | P1 | `workers/transactions/index.ts:1311` updates the deal before separately writing commission entries and updating CRM lifecycle. CRM failures are caught and logged. A partial failure can leave business records inconsistent. | Use a database transaction/batch for related writes in the same database where appropriate; persist pending cross-app consequences with the business write. Inject failure after each step and prove recovery without duplicate earnings. |
| CW-04 | P1 | `workers/transactions/index.ts:1360` updates an existing earned ledger row on source-key conflict. This supports repeat processing, but changing a closed deal can replace previously posted monetary facts despite the intended auditability. | Define posted-entry correction rules using linked adjustments/reversals and preserve the calculation inputs and plan version. Editing a closed deal must leave a reconstructable financial history. |
| CW-05 | P1 | `vite.config.ts:41` precaches assets and has an API cache pattern matching `https://api.*`; Workspace calls relative `/api` routes through `src/utils/api.ts`. No business-write queue or IndexedDB persistence was found in the inspected Workspace code. Installation as a PWA does not establish offline business continuity. | Build scoped local storage and a command queue for selected workflows. Test cold/warm offline starts, browser restart after an unsynced save, reconnect, expired sessions, and account changes. Show exactly which records are available offline. |
| CW-06 | P1 | `src/pages/transactions/Transactions.tsx:150` substitutes closing, target, and creation dates for actual close date; missing/invalid dates can become the current year. Results can be assigned to the wrong reporting period. | Introduce an explicit date basis and reusable period contract. Closed results require actual close dates; missing dates go to a repair queue. Verify identical rows and totals in UI and exports across year/timezone boundaries. |
| CW-07 | P1 | `workers/transactions/index.ts:364` imports owned Inventory listings without a visible executed-agreement or accepted-offer eligibility check in that handler. This conflicts with the agreed business-event trigger. | Validate the permitted event before creating a deal; use a stable event key for repeat imports. Ownership or a draft save alone must not create a transaction. |
| CW-08 | P2 | `src/constants/pipeline.ts` and the Transactions page apply one phase structure; Closed YTD remains compatible with Kanban. Different deal types and reporting tasks need different presentations. | Version workflow templates; separate lifecycle, phase, and reporting period. Pipeline uses appropriate stages; Results defaults to a table grouped by month/agent/type. Preserve legacy phase history during migration. |
| CW-09 | P1 verification | `scripts/d1-backup.sh` covers the Workspace database and uploads its SQL into Workspace R2. This is evidence of a backup script, not proof of scheduling, successful restoration, satellite/media coverage, or independence from the same provider account. | Inventory all databases, media, configuration, and recovery dependencies. Verify backup execution and restore into isolated targets; record measured recovery time and recoverable data age. Establish separately protected copies where required. |
| CW-10 | P2 | `docs/data-model-and-critical-workflows.md` contains claims superseded by Property identity, event links, and command-based Inventory import. Architectural planning against that document alone would duplicate completed work. | Reconcile each claim against current code and deployed migration state. Label intended, implemented, deployed, and verified behavior separately. |

## Cross-app contract to implement

Owning apps remain responsible for their records. Consumers reference tenant-scoped stable IDs and cache permitted snapshots with source version and refresh time. Historical signed documents and deal/event facts remain snapshots; current listing presentation follows the owner's current data unless an explicit override applies.

Each retriable business command needs a stable command ID, actor and tenant, expected record version, occurrence time, and captured inputs. The receiving app checks authorization again when replay occurs and records the result for duplicate submissions. Conflicting changes need explicit handling; different fields can sometimes merge, but monetary values, permissions, consent, and signed facts need stricter rules.

Business events carry an event ID, tenant, source record/version, event type/version, occurrence time, and limited necessary payload. Record the event with the owning write, track delivery per consumer, and tolerate duplicate or out-of-order delivery. Expired retries remain visible and repairable. The design does not require replacing all databases with event sourcing.

Keep these UI facts distinct: locally saved, server saved, downstream pending, synchronized, stale, and needs review. No app should present an unavailable data source as an empty successful result.

## Time relevance across apps

| App or record | Operational relevance | Historical/reporting basis |
| --- | --- | --- |
| Inventory Listing | Listing lifecycle, agreement expiry, approval, publication | Actual lifecycle event dates; retain past listings under their Property |
| Open House | Scheduled start/end, cancellation, timezone | Attendance occurrence date; follow-up remains actionable after the event |
| CRM | Next action and active relationships | Source/relationship history; closing one deal must account for other active relationships |
| Transactions | Workflow phase, deadlines, expected close | Actual close date; terminated date separately |
| HR and commissions | Plan effective dates, license expiry, pending compensation | Earned and paid dates remain separate; reporting rules require separate validation |
| Marketing/Brand Hub | Campaign schedule, listing eligibility, asset validity | Publication and campaign history with referenced source versions |

Support YTD, quarter to date, current month, last 30/90 days, previous year, custom, and all time where meaningful. Define whether “last three months” means rolling calendar months or a fixed number of days; label each explicitly. Use the brokerage timezone and one server-side period definition for screens and exports. Passing a date changes relevance; it does not automatically prove a business event occurred.

## Offline scope and failure behavior

Start with selected contacts, recent tasks, prepared open-house event data, notes, drafts, and attendance capture. Preload the records needed for a host's event. A guest opening an uncached link for the first time without internet cannot obtain that page; host-device capture is the practical fallback.

Keep offline storage scoped by tenant and user. Define device enrollment, retention, local unlock, logout cleanup, and treatment of unsynced work. Browser storage can be evicted and a lost device can lose changes never uploaded; local confirmation must not imply server backup. Replay must handle expired access and permission changes without dropping the user's draft silently.

External enrichment failures should return an allowed last-known snapshot with age, or an explicit unavailable state. Signing, sending, payment, and permission-sensitive actions requiring online verification remain pending until their requirements are met. Provider outage handling needs timeouts and bounded retries. Recovery from a full hosting-provider outage requires separately accessible recovery assets and a tested runbook; a PWA alone cannot provide that.

## Remaining comprehensive audit coverage

These checks remain open rather than being reported as passed:

- Per-route tenant and ownership enforcement across Workspace, service bindings, public links, SSO, documents, media, and all satellite apps.
- Broker/admin/agent/assistant role journeys, assignment visibility, revocation, and account switching.
- Listing expiry/cancellation/publication transitions, manual event overrides, photos, and public preview consistency.
- CRM duplicate resolution, multi-role people, concurrent active deals, and channel-specific consent withdrawal propagation.
- Brand Hub listing/audience/asset relationships, campaign ownership, and disconnected-provider behavior.
- Commission calculation variants, advances/caps/team splits, corrections, payment reconciliation, and report/export consistency. Tax rules require current authoritative validation before implementation.
- Document scope, signed versions, provenance, retention, upload recovery, access links, and restore of media plus metadata together.
- Mobile/PWA layouts, accessibility, print views, load performance, large datasets, and error-state behavior.
- Deployed migrations, monitoring/alert delivery, backup schedules, independent restore drills, and infrastructure recovery dependencies.

## Delivery sequence and completion gates

1. Finish the read-only audit coverage above and reconcile current source with deployed schema/configuration. Maintain a coverage matrix with evidence and unknowns. Avoid publishing tickets or changing production as part of planning.
2. Fix attendance linkage/replay and deal/commission consistency first (CW-01–04, CW-07). Establish a shared delivery contract through these concrete workflows.
3. Implement transaction workflow variants and the common date-period contract (CW-06, CW-08), then adopt appropriate time relevance in other apps.
4. Add offline persistence, conflict handling, and visible synchronization states to the selected workflows (CW-05).
5. Extend snapshot refresh and provider-failure behavior across the remaining apps; verify permissions and documents throughout.
6. Prove recovery, backups, and outage behavior (CW-09). Define availability/recovery objectives based on business tolerances and measured drills rather than unverified guarantees.

Each implementation slice requires focused failure/duplicate/conflict checks, followed by the repository-required tests, typecheck, and production build before any completion/deployment claim. Deployment additionally requires verifying migration compatibility and rollback/recovery readiness. The user subsequently authorized the full delivery program. Completion requires the gates above; local changes alone do not establish completion.
