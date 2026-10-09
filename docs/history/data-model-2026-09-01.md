# Historical Data Model Snapshot — superseded

Do not use this file as the current specification. See ../data-model-and-critical-workflows.md.

**Snapshot date:** 2026-09-01  
**Scope:** Central Workspace, Inventory / Listing Input, Open House Portal, Brand & Marketing Hub, and central authentication code.

This document describes the current model and stabilization decisions. Production schema and data were inspected before the P2 normalization migration.

## P2 domain normalization

P2 establishes explicit contracts for concepts that previously shared overloaded fields:

| Domain | Canonical axes |
|---|---|
| Transactions | Transaction Stage plus independent `is_active` retention |
| CRM | Contact Lifecycle, Qualification Status, derived follow-up timing, Activity, and Archive |
| Inventory | Property Record Status, Listing Status, Approval Status, Publication Status, and Archive |
| Cross-app copies | Source system, source record ID, source version, synchronized-at time, snapshot payload |

Canonical agent and tenant brand ownership remains in the Workspace. Inventory owns listing-specific presentation; Open House and Transactions keep versioned snapshots. Brand Hub owns creative assets and templates, not canonical identity or tenant branding. See ADR 005.

## Executive summary

The system already has a strong data-first direction:

- Inventory enriches addresses from NYC GeoSearch and NYC PLUTO.
- HR enriches brokerage and license information from the New York State active-license dataset.
- Public listing pages enrich the local area from OpenStreetMap / Overpass.
- Listings are exposed in a RESO-oriented format for reuse by the Workspace and external sites.
- CRM contacts can become transaction parties instead of being retyped.
- Transactions reference Inventory listing IDs.
- The Workspace provides one-time SSO links into controlled satellite applications.

The main structural limitation is that there is no canonical **Property** record shared across the system. Inventory's `projects` record currently combines several different concepts: property, listing agreement, MLS submission, public marketing record, and media package. Other applications then copy the address, agent, price, and status into their own databases.

There is also no fully completed canonical identity model. The central Workspace's legacy `users` table and JWT routes remain active while Better Auth tables and a dedicated authentication Worker exist alongside them. The Marketing Hub also keeps its own Better Auth user profiles, and Inventory keeps a separate agent directory.

The practical result is a connected group of applications, but not yet a unified data platform. Most links are API calls, copied text, email matching, or SSO identity hand-offs rather than stable cross-application entity relationships.

## System and storage map

```text
                         PUBLIC DATA SOURCES
       NY license roster | NYC GeoSearch | PLUTO | OpenStreetMap
                              |
                              v
+-------------------------------------------------------------------+
| CENTRAL WORKSPACE / GATEWAY                                       |
| re-workspace-db (D1)                                              |
| tenants, legacy users, permissions, CRM, deals, tasks, documents, |
| notifications, network, settings, SSO tokens, Director projects   |
|                                                                   |
| Private service bindings: CRM, Transactions, Prime View, Auth     |
+------------------+--------------------+-----------------------------+
                   |                    |
          listing ID/API         SSO + event API
                   |                    |
                   v                    v
+-----------------------------+  +-------------------------------+
| INVENTORY / LISTING INPUT   |  | OPEN HOUSE PORTAL             |
| listing_input (D1)          |  | open-house-db (D1)            |
| listing projects, media,    |  | events, guests, local admins, |
| documents, publishing,      |  | sessions, media operations    |
| agent/office lookup caches  |  |                               |
| listing-input-media (R2)    |  | open-house-photos (R2)        |
+-----------------------------+  +-------------------------------+
                   
             SSO only / no listing data contract
                              |
                              v
                  +-------------------------------+
                  | BRAND & MARKETING HUB         |
                  | prime-america-db (D1)         |
                  | local users, requests, assets,|
                  | scripts, social submissions   |
                  | prime-america-assets (R2)     |
                  +-------------------------------+
```

### Central Workspace database (`re-workspace-db`)

| Domain | Principal records | Current responsibility |
|---|---|---|
| Organization | `tenants`, `tenant_hostnames` | Brokerage identity, plan, branding, module settings, domains, license snapshot |
| Workforce | `users`, `user_settings`, `user_permissions`, `invitations` | Workspace profiles, roles, credentials, preferences, invitations |
| Delegation | `assistant_assignments`, `contact_audit_log` | Assistant-to-salesperson scope and mutation audit |
| Authentication transition | Better Auth `user`, `session`, `account`, `verification`, `passkey`, `organization`, `member`, `invitation` | Intended central identity model, currently coexisting with legacy Workspace identity |
| CRM | `contacts`, `contact_activities` | Leads, clients, inquiries, follow-up and communication history |
| CRM audiences | `mailing_lists`, `mailing_list_members`, `mailing_list_shares` | Reusable contact audiences and sharing |
| Deals | `transactions`, `transaction_parties`, `transaction_team` | Deal pipeline and relationship to CRM contacts and Workspace users |
| Deal execution | `transaction_tasks`, `transaction_templates`, `transaction_offers`, `transaction_outcomes`, `outcome_templates` | Checklists, compliance, offers, advice and outcomes |
| Documents | `documents` plus Workspace R2 | Files related by a generic `entity_type` and `entity_id` |
| Showings | `showings` | A Workspace-side showing log linked to an external Inventory listing ID |
| Professional network | `network_connections`, `network_referrals` | Vendors, colleagues, professional relationships and referrals |
| Notifications | `notifications` | User or tenant notices and action links |
| Application control | `app_registry`, `sso_tokens` | Controlled-app registry and one-time cross-domain SSO |
| Listing presentation | `listing_map_settings` | Map coordinates and amenity display preferences for Inventory listing IDs |
| Audit | `audit_logs`, `impersonation_audit_log` | Selected entity changes and administrator impersonation |
| Prime View | `prime_view_overrides` plus KV | Role expectations, overrides and self-reported progress |
| Director | `director_*` tables | AI marketing projects, messages, artifacts, drafts, quotas and settings |

### Inventory database (`listing_input`)

| Record | Responsibility |
|---|---|
| `projects` | Listing intake and status; most listing/property fields are stored in `data_json` |
| `project_media` | Listing photo/video metadata; binary objects live in Inventory R2 |
| `project_documents` | Listing-related document metadata and external links |
| `project_platforms` | MLS and publishing destinations, external IDs, URLs and verification dates |
| `project_activity_logs` | Listing activity history |
| `project_comments` | Listing review conversation |
| `project_presence` | Collaborative editing presence |
| `agents` | Local agent autocomplete cache, upserted by agent name from listing form data |
| `offices` | Local office autocomplete cache, upserted by office name from listing form data |
| `api_keys` | External API credentials where provisioned by the migration script |

The `projects.data_json` payload contains RESO-oriented fields such as address components, BBL/parcel number, price, property characteristics, listing-agent details, office details, seller details, status, remarks, and access tokens. This is flexible, but it prevents the database from enforcing most uniqueness, relationship, provenance, and validation rules.

### Open House database (`open-house-db`)

| Record | Responsibility |
|---|---|
| `events` | Event details, copied property address, copied agent profile, schedule, listing URL and access tokens |
| `guests` | RSVP/sign-in identity, contact details, attendee classification and follow-up state |
| `admins` | Legacy/local portal administrators |
| `admin_sessions` | Local authenticated sessions, including central SSO sessions |
| `admin_audit` | Administrative mutation audit |
| `media_ops` | Recoverable R2 media operations |

An event does not currently store a required Inventory listing ID. The Workspace attempts to match open houses to listings by a listing ID when present and then falls back to address text. The event API currently returns the address and listing URL, not a stable listing relationship.

### Brand & Marketing Hub database (`prime-america-db`)

| Record | Responsibility |
|---|---|
| Better Auth `user`, `session`, `account`, `verification` | Local Hub accounts and agent profile fields |
| `marketing_requests` | Agent requests to the marketing team |
| `assets` | Brand and marketing asset catalog |
| `scripts`, `sop_texts` | Reusable business scripts and operating procedures |
| `social_post_submissions` | Agent social content awaiting publishing workflow |
| `social_accounts_cache` | Cached OnlySocial publishing accounts |
| `allowed_emails` | Local signup allowlist |

The Hub receives Workspace identity through SSO but still stores a separate user/profile record. It does not currently consume a canonical listing, property, CRM contact, or campaign record from the other applications.

## Source-of-truth assessment

| Business concept | Current best source | Confidence | Main problem |
|---|---|---:|---|
| Tenant / brokerage | Workspace `tenants` | High | Branding/profile fields are also stored in satellite apps |
| Workspace membership | Workspace `users` | Medium | Better Auth migration is only partially adopted |
| Login identity and sessions | Unresolved | Low | Legacy JWT and Better Auth models coexist |
| NY license roster | NY State dataset snapshot in `tenants.company_agents_json` | Medium | Snapshot is JSON and users are matched by name rather than license ID |
| User license number | Workspace `users` | Medium | Filled by fuzzy name match; no provenance per field |
| Property | None | None | Property data exists only inside listings, transactions, events, contacts and text fields |
| Listing | Inventory `projects` | High | Property and listing concepts are combined in one JSON document |
| Listing media | Inventory `project_media` and Inventory R2 | High | Workspace and Open House also maintain media records/buckets |
| CRM person | Workspace `contacts` | Medium-high | Public leads and open-house guests are not consistently deduplicated or linked |
| Employee/agent profile | Workspace `users` | Medium | Inventory `agents`, Open House event fields and Hub `user` duplicate it |
| Deal | Workspace `transactions` | High | Copies listing name, price and status without a defined synchronization policy |
| Deal party | `transaction_parties` -> `contacts` | High | Some UI/forms also retain unstructured party text |
| Open house event | Open House `events` | High | Missing stable Inventory listing relationship |
| Open house visitor | Open House `guests` | Medium | Does not automatically resolve to a CRM contact |
| Marketing campaign/project | Director `director_projects` or Hub requests | Low | Two separate marketing work models with no shared campaign identity |
| Document | Context-dependent | Low | Workspace documents, Inventory documents and Open House assets use different stores |

## Critical workflows as implemented

### 1. Brokerage setup and NY license enrichment

1. An administrator enters the brokerage license number in Workspace tenant settings.
2. The Workspace queries New York's public active-license dataset.
3. It stores a brokerage/license snapshot and up to 1,000 associated agents in `tenants.company_agents_json`.
4. It compares active Workspace users to state license holders using normalized first and last names.
5. Matches update each user's license number and expiration date.

**Automation value:** high. This avoids re-entering the public license roster.

**Integrity limitation:** name matching can attach the wrong license to people with similar names, cannot reliably handle name changes, and does not record field-level provenance. License number should become the stable match key after a one-time human confirmation.

### 2. User onboarding, permissions and satellite access

1. Workspace administrators invite or manually create a user in the legacy `users` table.
2. The user authenticates through the Workspace's custom password/JWT routes.
3. Roles and database permission overrides control central modules.
4. When the user opens a controlled satellite, the Workspace issues a short-lived one-time SSO token.
5. The satellite validates the token, creates its own local session, and may upsert a local user.

**Current conflict:** ADR 001 selects Better Auth as the canonical service, and the auth Worker and schema exist, but the Workspace frontend still primarily calls the legacy `/api/auth/*` routes. The gateway's configured `AUTH` service binding is not used by those routes.

### 3. Listing intake and public-data enrichment

1. A listing is created in Inventory, normally through the Workspace proxy or Inventory UI.
2. The signed-in user's name and email may prefill the listing-agent fields.
3. NYC GeoSearch normalizes address components, coordinates and BBL.
4. When BBL is available, NYC PLUTO can fill year built, unit count, floors, assessed value, lot/building areas, zoning and owner name.
5. The listing is saved as a `projects` row plus a large `data_json` document.
6. Agent and office form values are upserted into Inventory's local autocomplete tables by name.
7. Listing media, documents, comments and publishing records are stored separately.
8. The agent can submit the listing; broker/admin review can approve or reject it.

**Automation value:** high for NYC properties.

**Model limitation:** the enriched property facts belong to a reusable Property record, but they currently belong only to this listing. A later listing, open house, transaction or marketing project for the same address has to copy or fetch them again.

### 4. Listing reuse in the Workspace and external sites

1. The Workspace proxies Inventory endpoints and converts Inventory's nested JSON into a Workspace listing DTO.
2. Public listing pages use that DTO and can display nearby amenities from OpenStreetMap / Overpass.
3. Inventory provides a public/external listing feed with selected RESO-style fields and incremental `since` filtering.
4. Listing platform records track MLS identifiers, publication URLs and verification dates.

**Boundary:** this is pull-based reuse. There is no central change event or version contract notifying Deals, Open House, CRM or Marketing when a listing changes.

### 5. Listing to transaction

There are two implemented paths:

- A user explicitly creates a deal from a Workspace listing and stores the Inventory ID in `transactions.inventory_listing_id`.
- Listing the transactions attempts an automatic Inventory import for listings associated with the current user's email.

The transaction stores a snapshot of listing name, type, status and price while retaining the Inventory ID.

**Critical mismatch:** Inventory returns agent email and price inside the nested `data` object, while the automatic import currently reads top-level fields. It can therefore fail to recognize the user's listings or import their price. It also performs synchronization during a read request, making an ordinary page load mutate the database.

**Missing rule:** the code does not define which listing changes should update a deal and which deal fields must remain historical snapshots.

### 6. Public listing inquiry to CRM

1. A visitor submits name, email, phone and a message from a public listing page.
2. The Workspace inserts a new CRM contact.
3. A tenant-level notification is created.

**Critical data loss:** the submission does not pass or store `source_listing_id`, does not explicitly set `lifecycle_stage = listing_inquiry`, and does not deduplicate by email or phone. The property relationship survives only inside free-text notes. Repeated submissions can create repeated contacts.

### 7. CRM lifecycle and conversion to a deal

1. Contacts are organized by `status`, `lead_stage`, `lifecycle_stage`, active/archive flags, assignment and follow-up fields.
2. Activities record calls, emails, meetings, notes and showings.
3. A user can merge selected duplicate contacts.
4. Converting a contact creates a transaction and a `transaction_parties` relationship.
5. The contact is marked converted/active and an activity is added.

**Strength:** the person is referenced by ID in the deal instead of being retyped.

**Critical mismatch:** conversion creates a transaction status of `prospect`, which is not part of the current transaction pipeline taxonomy. If the contact originated from a listing inquiry, the conversion also does not carry its `source_listing_id` into `inventory_listing_id`.

### 8. Open house creation, visitor capture and follow-up

1. An administrator manually creates an event with property address, agent details, schedule and optional listing URL.
2. The Portal creates sign-in, RSVP and admin tokens.
3. Guests RSVP or sign in; their contact details and follow-up state remain in Open House D1.
4. Admins/agents update follow-up status or export CSV.
5. The Workspace pulls a limited event list for dashboards and listing pages.

**Critical duplication:** property address and agent details are copied rather than selected from Inventory and Workspace users. Guests are not resolved into CRM contacts, and CRM activity is not created. A CSV export/manual import is still required to reuse the leads.

**Critical integration mismatch:** the Workspace's public open-house proxy does not send the internal bearer credential required by the Open House event API, so the public listing page can silently receive an empty event list. The authenticated Workspace proxy does send the credential.

### 9. Transaction execution and compliance

1. A transaction links to an Inventory listing and CRM parties.
2. Users add team members, offers, dates, financial terms, tasks and outcomes.
3. Templates create standard task journeys.
4. Stage changes are validated by stage-gate logic.
5. Task documents and approvals support broker/compliance review.
6. Notifications and outcomes communicate changes.

**Model strength:** transaction parties, offers, tasks and team members are structured relationships.

**Taxonomy risk:** transaction status definitions differ across the database comments, TypeScript type, pipeline UI, helper functions, listing-to-deal synchronization and CRM conversion. Values such as `active`, `prospect`, `contract_out`, `board_package` and `closing_prep` are not consistently recognized everywhere.

### 10. Marketing production

The system has two separate marketing work areas:

- Workspace Director stores AI-assisted projects, messages, artifacts and Inventory drafts.
- Brand & Marketing Hub stores requests, reusable assets/scripts and social publishing submissions.

Neither currently has a stable relationship to an Inventory listing, Property, CRM audience, open-house event or shared Campaign ID. Users must often copy the address, facts, agent profile and media links into marketing work.

### 11. Dashboards, search and Prime View

- Dashboard totals fan out to CRM, Transactions and Inventory at request time.
- Global search queries central contacts/transactions and then fetches Inventory listings.
- Prime View reads CRM and transaction data through service bindings and stores some progress in KV.

This is live aggregation rather than an analytics model. It can show current counts, but it does not preserve a reliable history of how business metrics changed or why.

## Current public and external data automation

| Source | Current use | Stored or live | Main gap |
|---|---|---|---|
| NY State active real-estate license dataset | Brokerage profile, roster and user-license matching | Tenant JSON snapshot and selected user fields | Fuzzy name matching; no field provenance |
| NYC GeoSearch | Address autocomplete, normalization, coordinates and BBL | Stored in Inventory listing JSON | No reusable Property record; NYC-only |
| NYC PLUTO | Building, parcel, zoning, assessed and owner facts | Stored in Inventory listing JSON | No retrieval timestamp/source metadata per fact |
| OpenStreetMap / Overpass | Nearby amenities and transit | Live edge-cached response | Presentation data is not a durable property fact |
| OpenStreetMap map links/tiles | Property map presentation | Live | No common geospatial service across apps |
| Open-Meteo | Header weather | Live | Not business data |
| Inventory external/RESO feed | Reuse by Workspace and external sites | Live API | No schema version or durable sync cursor consumer |
| Tavily/Jina/LLM providers in Director | Marketing research and generation | Messages/artifacts | Research facts are not promoted into verified canonical records |

### Unsafe pseudo-enrichment

Inventory's `/api/projects/:id/tax-record` endpoint is not a real public-record lookup. When values are absent, it currently invents an assessed value of `$850,000`, estimates tax at `1.8%`, and generates a parcel-like ID, while labeling the result `Public record lookup`. This data must not be presented as sourced property data. It should be removed or clearly marked as a non-authoritative estimate until a real source is connected.

## Duplication and integrity hotspots

### 1. People and identity

The same agent can exist as:

- Workspace legacy `users` row
- central Better Auth `user` row
- Inventory `agents` row keyed by name
- copied agent fields in Inventory listing JSON
- copied agent fields in every Open House event
- Marketing Hub Better Auth `user` row
- copied name/email in marketing and social requests

Email and display name currently act as informal integration keys. Neither is a safe permanent identity key.

### 2. Property and address

The same property can appear as:

- Inventory listing JSON
- transaction name and price snapshot
- Open House event address
- showing `listing_address`
- CRM contact address or activity notes
- Director project/draft address
- Marketing request text

There is no normalized `property_id`, address fingerprint, parcel/BBL relationship, or history of public-record observations.

### 3. Statuses

Each domain legitimately needs its own status, but several different concepts are mixed:

- Inventory row `status` and `data_json.listingStatus`
- transaction pipeline `status`
- CRM `status`, `lead_stage`, `lifecycle_stage`, `is_active`, `is_archived`
- Open House stored and computed status
- marketing request, project and social submission status

These need explicit names and transition rules rather than loose strings.

### 4. Documents and media

Workspace, Inventory, Open House and Marketing each have separate metadata and R2 storage. Separation can be valid for security and lifecycle reasons, but there is no shared Asset ID, provenance, retention classification or relationship graph. Copying a listing photo into an open house or campaign creates another unmanaged version.

### 5. Authentication

The repositories contain three active patterns: legacy Workspace JWT, central Better Auth, and satellite-local sessions/users. The accepted central-auth decision has not yet been completed end to end.

### 6. Tenant isolation

Inventory's list query deliberately allows `tenant_id IS NULL` legacy records and does not tenant-filter for an `admin` identity. Some internal service calls use the shared secret without forwarding the originating tenant, causing Inventory to treat the caller as a global admin. This can mix listings across tenants as the platform expands.

### 7. Audit and provenance

There are several audit tables, but no universal answer to:

- Where did this field come from?
- When was it retrieved?
- What source record supports it?
- Was it later confirmed by a human?
- Which application changed it?
- What was the previous value?

That provenance is essential when public data, agent input and AI-generated output are combined.

## Recommended canonical model

This is a direction for discussion, not yet an architectural decision.

| Canonical entity | Purpose | Proposed owner |
|---|---|---|
| `Tenant` | Brokerage/company boundary | Central Workspace |
| `Person` | Human identity independent of their business relationship | Central data service / Workspace |
| `User` | A Person allowed to sign in | Central Auth |
| `Membership` | User's tenant, role and employment/association state | Central Auth + Workspace organization model |
| `ProfessionalLicense` | Verified state-issued credential with provenance | Workspace compliance/HR |
| `ContactProfile` | CRM relationship, assignment, consent and lifecycle | CRM |
| `Property` | Stable real-world place/parcel/building/unit identity | Inventory or a dedicated property module |
| `PropertyObservation` | Sourced fact with source, retrieval date and confidence | Property owner service |
| `Listing` | Time-bounded agreement/marketing of a Property | Inventory |
| `Publication` | Listing representation on MLS/site/platform | Inventory |
| `Transaction` | Negotiation-to-close business process | Transactions |
| `TransactionParty` | Person/organization role in a deal | Transactions, referencing CRM/Person |
| `OpenHouseEvent` | Scheduled event for one Listing | Open House |
| `Attendance` | Person's RSVP/check-in at an event | Open House, linked to CRM/Person |
| `Campaign` | Marketing work for a Listing, audience or brokerage goal | Marketing |
| `Asset` | Reusable file/link with ownership, sensitivity and provenance | Federated asset registry or explicit per-domain ownership |

The minimum cross-application spine should be stable IDs:

```text
tenant_id
  -> person_id / user_id
  -> property_id
       -> listing_id
            -> transaction_id
            -> open_house_event_id
            -> campaign_id
  -> contact_id (relationship with a person)
```

Satellites can retain local databases, but copied records should carry the canonical ID, source version, and synchronization timestamp.

## Rules for public-data ingestion

Every sourced field should carry, directly or through a related observation record:

- canonical entity ID
- source name and source-record ID
- source URL or dataset identifier
- retrieved timestamp
- raw value
- normalized value
- confidence or validation state
- whether a user confirmed/overrode it
- override reason and actor

Recommended validation states:

```text
sourced_unverified -> user_confirmed -> superseded
                  \-> disputed
```

Public data should prefill and assist, not silently overwrite a user's confirmed business record. Source data and human corrections should remain distinguishable.

## Prioritized stabilization sequence

### P0 — stop incorrect or unsafe data behavior

1. Remove or relabel the fabricated tax-record response.
2. Resolve the legacy JWT versus central Better Auth authority before expanding SSO.
3. Move shared secrets found in plain Worker variables into encrypted Worker secrets and rotate them.
4. Enforce tenant context on every Inventory internal request and query.
5. Repair public Open House API authentication so listing pages can retrieve events safely.

### P1 — establish reliable cross-app relationships

1. Introduce a canonical Property ID and normalized address/parcel identity.
2. Require Inventory `listing_id` on Open House events created for an internal listing.
3. Send `listing_id` with every public listing inquiry and upsert/deduplicate CRM contacts.
4. Sync Open House attendance into CRM as a contact relationship and activity, with consent/source metadata.
5. Replace agent email/name joins with stable `user_id` and professional-license IDs.
6. Make listing-to-transaction synchronization explicit and idempotent; do not mutate during GET requests.

### P2 — normalize domain language and transitions

1. Define one transaction status set and transition table.
2. Separate CRM lifecycle, qualification, activity and archival concepts.
3. Separate Inventory's Property, Listing, approval and publication statuses.
4. Add source/version metadata to copied snapshots.
5. Define which application owns each agent-profile and tenant-branding field.

### P3 — reduce repeated work

1. Let Open House create an event by selecting a Listing and prefilling property/agent/media.
2. Let Marketing select a Listing or CRM audience and hydrate verified facts/media.
3. Let new listings reuse an existing Property and refresh only stale public observations.
4. Build a shared data-quality queue for duplicates, unresolved matches, stale sources and conflicts.
5. Build historical analytics from domain events instead of request-time counts alone.

## Decisions that require business input

These cannot be settled safely from code alone:

Resolved on 2026-09-02:

1. A building may contain independently listed units; Building and Property/unit identities remain distinct.
2. CRM presents one Person with several roles.
3. Signed documents outrank owner- or agent-confirmed facts; confirmed facts outrank public observations.
4. A Transaction begins only at a defined Business Event such as an executed Listing agreement or accepted offer.
5. Listings and Transactions belong to a Property. Documents declare Property, Listing, or Transaction scope; MLS/office/state source and signature requirements are separate attributes.
6. Brand Hub and Director remain specialized tools sharing Listing, Marketing Audience, and Asset IDs.
7. Consent is channel-specific for phone, email, and text, retains capture/withdrawal history, and Person data is never sold.

## Immediate tracer workflows for verification

The following end-to-end scenarios should become the first integration tests and operational walkthroughs:

1. **New seller listing:** public address enrichment -> agent confirmation -> broker approval -> public listing -> transaction -> closing.
2. **Public buyer inquiry:** listing page -> deduplicated CRM contact -> assigned follow-up -> showing -> transaction party.
3. **Open house:** select listing -> auto-filled event -> RSVP/sign-in -> CRM activity -> follow-up -> qualified buyer.
4. **Agent onboarding:** NY license roster -> human match confirmation -> invitation -> central login -> satellite access.
5. **Listing marketing:** select listing -> verified facts/media -> campaign assets -> publication -> engagement/lead attribution.
6. **Changed public record:** refreshed source conflicts with confirmed value -> review queue -> accepted/rejected update with audit history.

These tracer workflows expose the highest-value data relationships and will reveal business-rule defects faster than auditing screens independently.
