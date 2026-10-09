# Prime America Real Estate — System Context & Architecture

## Domain Language

**Seller Journey**:
The plan for one seller engagement, from preparation through post-closing follow-up. It can begin before a Listing or Transaction exists and remains connected to those records when they become available.
_Avoid_: Transaction stage, listing status

**Outcome**:
A concrete piece of work within a seller milestone, with optional responsibility and a due date. Hiding an Outcome does not complete it; marking it not applicable requires a reason.
_Avoid_: Offer acceptance evidence, automatic business event

**Operations Project**:
The shared execution plan for a signed client engagement, coordinating responsible people, deliverables, deadlines, assets, and review while linking to the engagement's Journey, Listing, and Transaction when available.
_Avoid_: Property, Listing status, duplicated Transaction

**Deliverable**:
A piece of team work within an Operations Project, with a responsible person, work state, and optional deadline, dependencies, assets, and approval requirement.
_Avoid_: Project Result, automatic business event

**Project Result**:
The final business disposition of an Operations Project, such as sold, leased, withdrawn, expired, or cancelled. It is distinct from completion of individual deliverables.
_Avoid_: Outcome, task completion percentage

**Related Contact**:
An existing CRM Person connected to another Person by a named relationship. The relationship describes the people and does not grant access to either person's records.
_Avoid_: Team member, delegated access

**Property**:
A stable, separately marketable real-world premises. Units in the same building are separate Properties; a later relisting of the same premises reuses the Property.
_Avoid_: Listing, project, address record

**Building**:
A physical structure that can contain several independently marketable Properties, such as condominium, cooperative, or rental units.
_Avoid_: Unit, Listing

**Listing**:
A time-bounded agreement and marketing record for one Property.
_Avoid_: Property, inventory project

**Property Identity**:
The tenant-scoped normalized parcel-and-unit key, or normalized address key when parcel data is unavailable, used to resolve a Property.
_Avoid_: Raw address, listing name

**Professional License**:
A stable, tenant-scoped credential record linked to a user by ID. License number, jurisdiction, and expiration are attributes of this record, not a substitute for user identity.
_Avoid_: Agent email, agent name

**Inquiry Attribution**:
The durable relationship connecting a CRM Contact to the Listing and submission that produced an inquiry. Replaying the same submission must reuse this relationship rather than create another Contact.
_Avoid_: Duplicated lead, source text only

**Person**:
A single human identity that may hold several CRM roles at once, including lead, open-house guest, buyer, seller, vendor, and agent.
_Avoid_: Separate contact per role

**Business Event**:
A verified occurrence that permits a downstream workflow to begin, such as execution of a Listing agreement or acceptance of an offer. Creating or editing a draft is not a Business Event.
_Avoid_: Page view, draft save, inferred milestone

**Evidence Priority**:
The rule for resolving conflicting facts: a signed document is strongest, then an owner- or agent-confirmed value, then a public observation. Lower-priority evidence never silently overwrites higher-priority evidence.
_Avoid_: Latest value wins

**Document Scope**:
The durable business record a document belongs to: Property, Listing, or Transaction. Source organization, form type, required signatures, and signed versions are separate document attributes.
_Avoid_: Folder location, application name

**Communication Consent**:
A Person's explicit permission by channel—phone call, email, or text—with source, capture time, and withdrawal history. Contact information is not sold.
_Avoid_: One marketing boolean, implied consent

**Marketing Audience**:
A reusable set of Person IDs selected for a permitted communication purpose and channel. It references CRM Persons rather than copying their data.
_Avoid_: Spreadsheet export, duplicated contact list

**Network Connection**:
A professional relationship card owned by one Workspace user and optionally visible to the brokerage. The structured fields are the reusable record; an uploaded business-card image is supporting evidence, not the primary interface.
_Avoid_: CRM client, public marketplace listing, image-only business card

**Client Introduction**:
A private, tracked referral event connecting one canonical CRM Person, the sending Workspace user, and a Network Connection. Brokerage management may oversee introductions with explicit sender context.
_Avoid_: Referral exchange marketplace, duplicated client contact, unowned referral row

**Open House Attendance**:
A visitor's RSVP or sign-in relationship with one Open House Event. Attendance keeps its own consent and event facts while referencing the resulting CRM Contact.
_Avoid_: Contact, lead copy

**Transaction Stage**:
The operational position of a Deal: `lead`, `offer_received`, `contract_out`, `under_contract`, `board_package`, `closing_prep`, `closed`, or `fallen_through`. Archival is a separate retention state.
_Avoid_: Active, cancelled, archived status

**Commission Plan**:
An effective-dated agreement defining how an agent’s allocated portion of Prime America commission becomes compensation owed to that agent.
_Avoid_: Current split, browser setting

**Prime America Commission**:
The brokerage compensation owed to Prime America under the applicable agreements, after any outside brokerage allocation and before internal agent compensation.
_Avoid_: Unqualified gross commission, agent payout

**Financial Revision**:
A preserved version of a Deal’s prices, compensation agreements, funding sources, and agent allocation. Broker approval finalizes its compensation calculation without implying payment.
_Avoid_: Closing payment, mutable settlement total

**Company Contribution Cap**:
The maximum qualifying company split collected from an agent within the configured cap period. It does not limit agent earnings.
_Avoid_: Agent payout cap, per-deal ceiling

**Agent Account Charge**:
An amount owed by an agent for a service or expense, settled separately or explicitly offset against a commission payment under the agent’s agreement.
_Avoid_: Automatic commission deduction

**Commission Ledger Entry**:
An auditable monetary fact classified as earned compensation, payment, advance, adjustment, repayment, or chargeback. Earning and payment are separate events.
_Avoid_: Recalculated deal total, commission estimate

**Tax-Reportable Compensation**:
The posted taxable portion of payments made to a contractor during a tax year, supported by payment dates and W-9 readiness.
_Avoid_: Closed GCI, earned commission, projected commission

**Contact Lifecycle Stage**:
The CRM relationship phase: `inquiry`, `lead`, `active_client`, or `past_client`.
_Avoid_: Qualification, follow-up timing, archive state

**Qualification Status**:
The current evidence of client readiness: `unqualified`, `attempted_contact`, `engaged`, `qualified`, or `disqualified`.
_Avoid_: Overdue, needs follow-up, converted

**Listing Status**:
The RESO-oriented market lifecycle of a Listing. It is independent of review approval, publication visibility, and record archival.
_Avoid_: Approval status, publication status

**Approval Status**:
The broker review state of a Listing: `draft`, `pending_review`, `approved`, or `changes_required`.
_Avoid_: Public, active

**Publication Status**:
The Listing audience: `private`, `invite_only`, or `public`. Public feeds additionally require broker approval.
_Avoid_: Listing status, approval status

**Source Snapshot**:
A point-in-time copy from an owning application, stored with source system, source record ID, source version, synchronization time, and the copied payload.
_Avoid_: Canonical record, unversioned copy

**Agent Profile**:
The Workspace-owned canonical business profile for a user. Professional credential facts belong to Professional License; listing-specific presentation is an Inventory snapshot.
_Avoid_: Satellite login identity, copied event agent fields

**Tenant Brand Profile**:
The Workspace tenant's canonical name, logo, colors, contact information, addresses, and domains. Brand Hub assets and templates may reference it but do not redefine it.
_Avoid_: Creative asset, satellite branding copy

## 1. Domain Vocabulary & Roles

- **Central Workspace (`re-workspace`)**: The core platform gateway and PWA (`workspace.primeamericany.com` / `app.primeamericarealestate.com`). Serves the web frontend, JWT auth, tenant resolution, HR/users, deals pipeline, and delegates to micro-services.
- **Identity Authority**: The service that owns canonical user identity, credentials, and session issuance. During migration the Central Workspace remains the active authority; `prime-america-auth` becomes the authority only after an explicit, reversible cutover.
- **Application Profile**: Business data associated with a canonical user inside an application, such as brokerage role, license information, preferences, or assignments. It references an identity but does not own login credentials.
- **Tenant Membership**: The relationship granting a canonical user a role within a brokerage tenant. A user identity alone never implies access to tenant data.
- **Legacy Workspace Session**: The transitional session issued by the Central Workspace before central-auth cutover. It must not be treated as a second permanent identity authority.
- **Roles**:
  - `admin` (Super Admin): Full access to HR, user management, system settings, all pipeline deals, and tenant config.
  - `broker` (Broker / Manager): Office-level oversight, compliance reviews, deal approvals, agent team tracking.
  - `agent` (Licensed Real Estate Agent): Personal pipeline, CRM leads, listing submissions, open house host tools.
  - `tc` (Transaction Coordinator): Manages documents, checklists, closing milestones, and compliance packets.
  - `compliance` (Compliance Officer): NY Article 12-A audits, fair housing compliance, file retention review.
- **Satellites**:
  - `Inventory / Listing Input` (`inventory.primeamericarealestate.com`): MLS listing data entry, canonical property data, and Listing Document Vault (replacing Google Drive).
  - `Open House Portal` (`openhouse.primeamericarealestate.com`): QR code sign-ins and lead capture for active listings.
  - `Brand & Marketing Hub` (`inside.primeamericarealestate.com`): Marketing collateral, company assets, and social templates.
  - `Corporate Site` (`primeamericarealestate.com`, service `prime-america-real-estate-corp`): Public company site built on Astro; distinct from the consumer site.
  - `Consumer Site` (`primeamericany.com`): Public consumer website for property discovery and connection; currently hosted with Placester. Consumer search remains part of this domain's role when the site is replaced.
- **Consumer Search** (`prime-property-search-staging`): Separate discovery service with dedicated D1 and private R2 storage. Its staging host uses synthetic listings and requires Cloudflare Access; it does not bind to the professional Workspace.
- **Listing Document Vault**: Structured, category-based property document and media repository hosted within Inventory Admin (R2 bucket storage + external streaming links + vendor upload tokens + public media kits). Replaces unstructured Google Drive workflows.

---

## 2. Architectural Decisions (ADRs)

- [`ADR 001: Central Auth`](docs/adr/001-central-better-auth-service.md)
- [`ADR 002: Inventory Document Vault (Replacing Google Drive)`](docs/adr/002-inventory-document-vault-replacing-drive.md)
- [`ADR 003: Inventory Owns Canonical Property Identity`](docs/adr/003-inventory-owns-canonical-property-identity.md)
- [`ADR 004: Cross-App Sources Link to Canonical CRM Contacts`](docs/adr/004-cross-app-sources-link-to-canonical-crm-contacts.md)
- [`ADR 005: Separate Business Statuses and Own Shared Profiles`](docs/adr/005-separate-statuses-and-own-shared-profiles.md)
- [`ADR 006: Person, Evidence, Documents, Events, and Consent`](docs/adr/006-person-evidence-documents-events-and-consent.md)
- [`ADR 007: Commission Ledger and Payment-Based Tax Reporting`](docs/adr/007-commission-ledger-and-tax-reporting.md)
- [`ADR 015: Private Cloudflare Search Staging`](docs/adr/015-private-cloudflare-search-staging.md)

---

## 3. Reference Specifications

- **Role & Privilege Matrix**: See [`ROLE_MATRIX.md`](ROLE_MATRIX.md) for full role hierarchies, screen layouts, and action permissions.
- **Component & Feature Blueprint**: See [`COMPONENT_SPEC.md`](COMPONENT_SPEC.md) for button-by-button actions, RESO listing stages, search bar standards, and CRM ingestion rules.
