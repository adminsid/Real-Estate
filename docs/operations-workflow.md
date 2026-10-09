# Operations project workflow

Operations is the team's execution view for an engagement. Journey retains the seller engagement plan; CRM owns people, Inventory owns property/listing facts and the document vault, and Transactions owns deal stages and contractual dates.

## Team experience

Workspace navigation groups Projects, Deals and CMA under Operations. Deals and CMA keep their `/transactions/pipeline` and `/transactions/cma` routes and existing transaction access checks; grouping them does not grant Operations project access to assistants. The sidebar carries forward the old Deals group's expansion preference to Operations.

- Projects provides searchable project cards, current phase, actual task completion, next deliverable, overdue work, a personal work queue, and a review queue.
- A project opens to the next deliverables, MLS requirements and its own current-week agenda. Deliverables, Calendar, Assets, and Activity are views within that project. There is no separate portfolio calendar.
- Inventory's evidence-backed agreement verification automatically creates an active, linked Operations project. Repeating the same verification reuses the project and preserves customized work. The signing date uses New York time; the initial launch target is signing plus seven days and should be confirmed in project settings. Manually created projects require a signed date and human confirmation. The first-week procedure generates 12 preparation deliverables, five MLS deliverables and 21 content placeholders. Publication dates anchor to target launch; creation deadlines anchor to signing.
- Under Contract and Closing procedures are applied with confirmed contract/closing dates. Reapplying a procedure adds only missing preset items. Existing customized work is preserved.
- Tasks have one responsible workspace user, instructions, deadline, phase, blocker, attached assets, and optional reviewer. Dependencies cannot contain cycles.
- Work states are To do, In progress, In review, Changes requested, Approved, and Done. Required approval can be granted by the assigned reviewer or a broker/admin. Changing reviewed content or asset versions invalidates approval. Brokers/admins control required reviewers.
- The calendar supports week/month views, clickable work and publication items, and dragging dates. Tasks with dependents open the editor so users can review affected work. Date inputs provide the equivalent action on mobile.
- Assets accept HTTPS links and JPEG/PNG/WebP/PDF/MP4 uploads up to 20 MB. Large media and canonical property documents remain in Inventory's vault. Project files require a workspace session and tenant access.
- Content placeholders store platform, caption, assets, creation deadline, publication date, scheduling link, and planned/scheduled/published state. CSV export supports transfer to the selected social scheduler.
- Comments are append-only, server-attributed to the authenticated user, and may belong to a task. Work-status changes are preserved in Activity.
- Project results include sold, leased, withdrawn, expired, and cancelled. Progress reflects completed deliverables; phase changes do not add arbitrary progress.
- Admins/brokers may delete a project in Project settings after typing the exact word `delete`. The API enforces role, tenant, confirmation and current version. Deletion removes its tasks/comments; linked CRM, Inventory and Deal records are preserved.

## MLS launch requirements

Each project shows the five OneKey requirements and links to their official guidance. New marketing presets include five MLS deliverables; existing projects can add only the missing items. Inventory completion and MLS drafting now start on signing day, ahead of the week-long marketing preparation.

- [Mandatory entry (Rule 302)](https://support.onekeymls.com/hc/en-us/articles/37010139901204-Rules-and-Procedures-Violation-Overview): use the Listing Date, with the next calendar day's midnight deadline in New York time. A later date requires an explicit provision in the agreement.
- [Clear Cooperation](https://support.onekeymls.com/hc/en-us/articles/35177831768596-2-27-25-From-the-Desk-of-the-CEO-Ensuring-Fair-Housing-and-Equitable-Access-with-Compliance-to-Clear-Cooperation): record the confirmed one-business-day deadline when public marketing begins. The broker confirms the business-day calendar and applicable exceptions; a planned launch does not confirm actual public marketing.
- [Front exterior photo](https://support.onekeymls.com/hc/en-us/articles/43263101370388-Photograph-Required-for-All-Listings): recording the actual MLS entry timestamp displays an exact 24-hour deadline, including across daylight-saving changes. Applicable business listings and written seller instructions are documented in the deliverable.
- [Data accuracy](https://support.onekeymls.com/hc/en-us/articles/43272204762388-Substantially-Complete-and-Accurate-Information): verify address, tax ID, facts and required fields against official records before submission.
- [Original Listing Date (Rule 310.5)](https://support.onekeymls.com/hc/en-us/articles/43263287640596-Original-Listing-Date-Retained): track the retained date and evidence for re-lists by the same broker in the same property class before original/extended expiration. A withdrawn/cancelled property off market for at least 60 days may qualify for a new signed agreement and date.

MLS dates are recorded in Project settings. Updating them recalculates open MLS deliverable deadlines; completed work remains in history. These records track team confirmation; there is no direct MLS submission or verification integration.

## Access and integrity

Operations currently follows its established tenant-wide collaboration access for admins, brokers, and salespersons. Assistants are not granted broad access to client projects. Assigned users and reviewers must be active members of the same tenant. Links are validated against tenant records and Inventory where configured.

Project updates use an optimistic version with a unique command ID. The version claim and all task/comment writes run in one D1 batch; dependent writes are guarded by the winning command. A conflict returns HTTP 409, leaves the other person's work intact, and preserves the local editing form until the user reloads/retries.

The portfolio endpoint returns pages of 100 projects and loads associated tasks/comments in two queries per page rather than per project. The frontend loads remaining pages as needed.

## External integration boundaries

The listing detail page no longer includes the manual business-event verification panel. The backend verification endpoint still starts a project for an evidence-backed executed agreement; retries cannot duplicate the project or agenda. Projects can also be created manually with a signed date and human confirmation. Direct e-signature-provider ingestion is not configured. A signature-provider webhook must validate its evidence and tenant identity before recording the verified business event.

Automatic social publication is not configured. Planned dates are not a posting service. Users schedule approved work in their external scheduler and save the link; Scheduled and Published are explicit user-confirmed states. No credentials or invented publishing-success states are used.

Asset-creation links open the existing Brand Hub and Inventory tools. Operations coordinates and reviews deliverables rather than duplicating their creative editors or canonical vault.

## Release and verification

Apply Operations migrations `042_operations_projects.sql` and `061_operations_workflow.sql` in order. Existing projects retain IDs, tasks, and comments; added workflow/detail fields default to empty objects. Deploy the gateway and built frontend together after `npm test`, `npm run typecheck`, `npm run build`, and a Wrangler dry run.

Regression coverage includes invalid calendar dates, local calendar-day keys, template date anchors and idempotent application, concurrent writes, approval forgery, review invalidation, append-only comments, unsafe URLs, cross-tenant links, and cyclic dependencies. Browser QA uses fictitious client fixtures.

The October 5, 2026 release passed 55 Vitest suites (408 tests), the repository typecheck and production build, scoped frontend ESLint, and Wrangler's bundle dry run. Agreement coverage includes gateway kickoff, New York date boundaries, duplicate verification preserving customized tasks, tenant/role rejection, unavailable property metadata, and explicit recovery after database failure. Desktop browser QA confirmed task editing and saving; mobile QA confirmed the project layout at 390 px without page overflow. Production smoke checks cover the Operations page and assets, health endpoint, authentication rejection, and required database columns.

The follow-up sprint passed 56 suites (417 tests), typecheck, build, scoped Operations lint and the Wrangler dry run. Added coverage verifies deletion role/tenant/confirmation/version checks and cascading task/comment removal while linked records survive; MLS deadline anchors, timestamp validation and the exact 24-hour clock across DST are also covered. Browser fixtures confirmed removal of portfolio calendar/intro copy, sidebar Feedback placement, project MLS deadlines and typed deletion gating.

## Project collaboration and linked records

The phase strip uses Pre-Listing Due Diligence, Listing Agreement Signed, Marketing, Under Contract, Closed, and Completed. Signed manual and evidence-created projects start at Listing Agreement Signed. Existing Marketing Plan and Launch phases display as Marketing; existing Closing preparation displays as Under Contract. Legacy procedure keys are retained to avoid duplicating customized deliverables. Closing preparation tasks belong to Under Contract and confirmed closing/follow-up tasks to Closed.

Project settings searches tenant-scoped active CRM contacts and Deals, and Inventory listings by name/address. Inline creation uses each owning application's API; selecting a record is staged until project settings are saved. The creation button creates a real canonical record immediately, even if the settings dialog is subsequently cancelled. No linking action verifies a business event.

Selected collaborators are active workspace users, independently of deliverable assignees and reviewers. Profile photos and initials identify project collaborators, task assignees, comment authors and Deal chat participants. New comments store the authenticated user ID while existing author text is preserved for history. Legacy comments use a profile photo only when their name uniquely matches a current member.

Deliverable details keeps assignment, work status and deadline prominent. Instructions, dependencies/review, files and publication details expand independently. Project assets include a generic Link type for Drive references and other HTTPS resources; editable comma-separated tags are normalized and support search and filtering. Tags organize assets and do not change their document scope or canonical ownership.
