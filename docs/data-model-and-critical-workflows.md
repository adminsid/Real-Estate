# Connected workspace data model and critical workflows

Updated 2026-09-06. This describes local source, not a claim that every change is deployed. Deployment and verification evidence belongs in [the delivery evidence ledger](connected-workspace-delivery-evidence.md). The [September 1 snapshot](history/data-model-2026-09-01.md) is preserved for history and contains superseded findings.

## Ownership

| Record | Owner and relationships |
| --- | --- |
| Tenant and active membership | Workspace users and permissions; satellite profiles do not grant central membership |
| Property | Inventory properties; tenant-scoped identity keys distinguish units and support relisting (ADR 003) |
| Listing | Inventory projects reference Property; listing, approval, publication and archive are separate axes |
| Person and relationship | CRM contacts with stable tenant-scoped source links and listing/event attribution (ADR 004) |
| Open House event | Open House; an optional listing link and versioned snapshot coexist with manual event details |
| Attendance | Open House guests; durable CRM delivery state is separate from the saved attendance fact |
| Deal | Transactions; references Inventory and captures its source version; a verified business event permits import |
| Commission | Shared Workspace ledger; earned, adjustments, advances and payments remain distinct (ADRs 007–008) |
| Documents | Owning app's metadata and R2 object; backing up only one loses recoverability |
| Brand assets and social requests | Brand Hub dedicated tenant deployment; local profiles are checked against active Workspace membership |

## Delivery contracts implemented locally

Attendance is saved before CRM delivery. A scheduled replay takes a lease, retries failures with backoff up to eight attempts, and leaves exhausted or invalid assignments for operator review. Manual events require valid tenant/host attribution, not a fictional listing. Contact ownership conflicts return review responses instead of transferring ownership.

Transaction imports are explicit POST commands. Inventory ownership alone does not qualify: a broker records an executed agreement or accepted offer with a listing-owned evidence document and current source version. Repeated import does not duplicate an existing deal. GET requests only read.

Deal revision checks protect concurrent updates. Deal changes, commission corrections and CRM lifecycle updates share a database batch. Posted ledger entries cannot be updated or deleted. Outline party links, newly captured contacts/network records and delegated audit entries also share the batch. Existing canonical contact facts are preserved; another owner’s or inactive contact requires review. Clearing an outline party removes its deal link.

Results use actual close dates, the brokerage timezone and the shared server period implementation. Missing or invalid actual dates appear in a repair list. UI and CSV use the same report rows. Existing deals retain legacy workflow history; new sale and lease templates are versioned.

## Offline boundary

The `/offline` page enrolls a tenant/account vault protected by a local passphrase. It encrypts notes, prepared assigned contacts/tasks/events and host-captured attendance in IndexedDB. Preparation expires after seven days. Browser restart preserves saved ciphertext; logout/account changes lock access and retain undelivered work. Local saves are not server backups. Browser storage eviction or losing the passphrase can lose unsent changes.

Replay rechecks current account, tenant, permissions and event assignment/version. Exact acknowledgments mark commands server-saved; authentication or conflict responses retain them for review. Signing, sending, payment and first-time uncached guest pages require connectivity. Full cold-start and role-by-role browser verification remain open.

## Identity and provider boundaries

Brand Hub uses opaque expiring SSO sessions and validates live membership against Workspace. Its existing storage is explicitly dedicated to one configured tenant; it is not a general multi-tenant asset store. Agent submissions are saved locally for broker approval before provider calls. Uncertain provider acknowledgments retain review state and recorded provider IDs. Social account failures return a dated cached snapshot or unavailable response.

The auth migration remains hybrid: central legacy users and JWT routes coexist with Better Auth. Do not infer complete identity migration from the existence of an auth Worker. Full route/role and provider coverage is tracked separately, not certified by these changes.
