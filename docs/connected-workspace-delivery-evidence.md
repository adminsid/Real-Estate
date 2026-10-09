# Connected workspace delivery evidence

Updated 2026-09-06. Full program authorized. **Not complete or deployed.** Existing uncommitted work across all four repositories has been retained. The original audit plan remains the acceptance contract.

## Implementation and verification

| ID | Local change | Evidence | Remaining gate |
| --- | --- | --- | --- |
| CW-01 | Manual-event CRM attribution allows absent listing; host/tenant required | Open House attendance tests | Deployed manual-event journey |
| CW-02 | Durable attendance lease, bounded replay, operator retry/status | Outage/recovery, exhausted retry and no-consent tests | Cron deployment and alert delivery |
| CW-03 | Atomic deal revision, earning, CRM lifecycle, outline parties and delegated audit writes | SQLite rollback, duplicate posting, party clearing and inactive/other-owner contact tests | Deployed correction journey; exhaustive failure injection |
| CW-04 | Posted-entry mutation guards, linked adjustments and calculation snapshots | Ledger regression tests; restored production migration check | Deployed correction/reopen and HR calculation variants |
| CW-05 | Encrypted account vault, preparation, notes and attendance commands | Browser encryption, replay and page-reload persistence harness; note/attendance receipt tests | Cold/warm shell and account/role/revocation journeys |
| CW-06 | Shared actual-date periods, repair queue, Results table/CSV | Period and report/export tests | Production representative totals and timezone boundary browser check |
| CW-07 | Evidence-backed Inventory event command and broker UI; explicit eligible import | Import tests and listing tenant enforcement | Event-recording concurrency/negative tests; deployed evidence journey |
| CW-08 | Versioned sale/lease templates, legacy history, Results grouping | Workflow migration restoration and phase tests | Production browser verification of all stage controls |
| CW-09 | Four SQL exports restored; referenced media recovered with hashes | See recovery section | Protected destination, schedule, RPO/RTO acceptance, full service failover |
| CW-10 | Current model rewritten; old snapshot archived; ADR 008 records immutable corrections | Source compared to initial remote schema snapshot | Update deployment evidence after rollout |

## Security and provider coverage

Focused independent review identified and led to fixes for Brand Hub anonymous storage/API access, untrusted profile field names, method spoofing, agent scheduler access, live membership revocation, and social submission validation. Offline receipt tests cover tenant/actor binding, assignment revocation, stale event versions, captured consent, acknowledgment identity and conflicting duplicate IDs. These checks are not an exhaustive security certification.

Still open: the complete per-route matrix; broker/admin/salesperson/assistant browser journeys; public and signed document scope; channel-specific consent withdrawal propagation; listing override refresh; all provider freshness/error surfaces; accessibility, mobile/print/performance and large datasets; monitoring notification delivery. Transactions now return an explicit unavailable response when Inventory ownership cannot be resolved for ordinary users, rather than a misleading incomplete success.

## Recovery evidence

On September 5, four live D1 exports were restored into isolated local SQLite databases: Workspace, Open House, Inventory and Brand Hub. All returned integrity `ok` and zero foreign-key violations. Measured SQL restore times were approximately 1.13, 0.13, 0.40 and 0.17 seconds respectively. These measure local SQL loading only, **not application recovery time**. Exports were taken at different times and are not a globally consistent snapshot.

The media drill downloaded and hashed 595 objects. Of 597 initially detected references, one was a Workspace folder placeholder (now excluded by the scanner), leaving 596 actual candidates. The remaining Inventory image download returned a Cloudflare 403 during an authorized retry on September 6. Its absence from the backup is unresolved; this is not evidence that the original was deleted.

Private exports, recovered objects and hashes are under `/tmp/cw-recovery` with restrictive permissions. This temporary local copy is independent of Cloudflare access once downloaded, but it is **not a separately protected, scheduled or durable backup destination**. No personal records, SQL dumps or secret values are copied into this document or the repository.

Resources include four D1 databases, four R2 buckets, Workspace/Open House/Hub KV, Transactions OutcomesRoom, Worker configuration, deployment versions, migrations, DNS and identity/provider secrets. The referenced-object scan is not a full bucket inventory; unreferenced objects, KV values, Durable Object state and external provider records are not yet covered.

Workspace migrations 052–055 and Open House 014 were applied successfully to isolated restored production copies, with no FK violations. The remote Workspace migration registry lagged its actual schema (registry through 045, schema included 046–050). Never blindly replay the full migration directory. Inspect migration 051 and current remote schema before targeted production application.

## Rollout gates

1. Resolve remaining correctness/security findings and run required unit tests, typechecks, frontend builds and Worker dry runs.
2. Capture current Worker deployment versions and confirm required secret names/bindings without logging values.
3. Inspect remote schemas; apply only missing compatible migrations. Pause transaction writes while introducing posted-ledger guards; deploy the compatible worker before reopening writes. Keep data migrations forward-compatible and do not restore a stale database over new business writes.
4. Deploy and verify service bindings, auth/membership, agent/broker journeys, attendance replay, results and provider repair using controlled fixtures.
5. Record deployment IDs and smoke evidence. Verify independent backup destination, schedule, restore of metadata/media together and agreed recovery objectives.

No production migration or deployment is recorded as completed by this ledger.

## September 6 verification update

Workspace: 41 suites / 292 tests, typecheck and production build passed. Open House: 14 suites / 157 tests and typecheck passed. Inventory: 6 suites / 41 tests and typecheck passed. Brand Hub typecheck and production build passed; its security regression tests run in Workspace's suite. Worker dry runs succeeded for Transactions, CRM, Open House, Inventory, Gateway and Brand Hub.

The unsynced synthetic note survived browser page reload and was removed after verification. This is page-restart persistence evidence, not a simulated device-loss or full cold-offline startup test.

Transactions' last recorded production version before this rollout is `8d8ca8a8-b9ba-4d69-8d4d-df86aa778c2e` (September 3). Brand Hub secret-name inspection found `BETTER_AUTH_SECRET`, `ONLYSOCIAL_TOKEN`, and `ONLYSOCIAL_WORKSPACE_UUID`; the new membership path additionally needs `INTERNAL_API_SECRET` provisioned before its deployment. Hub and Inventory 014 migrations also passed isolated restored-database integrity and FK checks.


## Additional authorization fixes

Workspace JWT sessions now reload active membership and current role from the database on authenticated gateway routes, including impersonator role checks. A stale admin claim cannot preserve revoked access. Cookie-authenticated cross-site mutations are rejected. Focused tests cover role downgrade, deactivation, tenant transfer and cross-site mutation rejection.

Raw-key document downloads now require document metadata belonging to the caller's tenant before R2 is read. A regression test verifies another tenant's known key never reaches storage. This fixes that cross-tenant bypass; full entity/assignment authorization for all document operations remains a separate open review item.

Internal Open House enumeration now requires an explicit tenant. Public gateway calls resolve the verified hostname tenant and forward it; unavailable Open House reads return 503. Public listing inquiry calls likewise forward the hostname tenant and reject mismatched source attribution. The broker evidence UI uses a dedicated authenticated evidence response, because the normal presentation DTO intentionally omits document metadata.

## Current external requirements and open work

- Primary backup storage direction is now R2, per the user’s Cloudflare preference. See [the storage design](connected-backup-storage-design.md). Implement/provision the dedicated bucket and backup module; independent account/provider protection and measured recovery objectives remain open.
- Resolve live gateway access for the shared-secret preflight. Python's original certificate-store error was corrected by using the system trust store, after which the endpoint returned a non-JSON error. The shared secret is therefore still unverified. Do not provision the Hub with an unverified secret or claim a live membership smoke test passed.
- Recover the remaining Inventory object that returned Cloudflare 403; retain its private manifest entry and do not silently discard its metadata.
- Finish the comprehensive route/entity, role-browser, provider, snapshot-refresh and device/offline coverage listed above, then execute the migration/deployment sequence and collect production evidence. No deployment has occurred.

Independent review passed the corrected outline, attendance permission and social-delivery scope. A subsequent broader satellite audit attempt could not run because the review agent reached its usage limit; it provides no additional coverage. The later gateway authorization changes were checked locally with regression tests, not by that independent reviewer.

See [the recovery runbook](connected-workspace-recovery-runbook.md) for capture, protection, isolated restore and rollout prerequisites.


September 6 storage direction: R2 is selected as the primary backup destination behind a replaceable storage adapter. This is a documented design, not a deployed backup service. The existing live data stores are unchanged.


## Offline navigation refinement

Removed the full-width preparation banner. Settings now has a directly linkable Offline access tab (`/settings?tab=offline`) hosting the existing encrypted device workflow. A compact header connection indicator links there when connected and to the standalone `/offline` page when disconnected. It reflects browser connectivity, not a claim that all records are synchronized. Existing vault storage and pending commands are unchanged. Workspace's 292 tests, typecheck and production build passed for this refinement.

This Workspace refinement was deployed on September 6, 2026 as Worker version `8375fe91-f3fc-40d9-ad04-8021d11b731d`. Before migration, a fresh production D1 export was restored locally with integrity `ok` and zero foreign-key violations. Migration 053 added `personal_notes`; a post-deployment schema query confirmed the table exists. Live checks confirmed `/settings?tab=offline` serves the deployed asset, the Offline access copy and connection indicator are present, and the old banner is absent. The recorded pre-deployment Workspace version is `5ad349c7-513d-4fd1-91f6-52eac67c859b`.

The user accepted automatic R2 backups with manually exported copies on an external hard drive. This resolves the independent-copy destination approach; the downloadable complete archive, schedule and restore validation still need implementation. A manual export only protects data through its capture date.
