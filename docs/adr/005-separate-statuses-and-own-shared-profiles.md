# ADR 005: Separate Business Statuses and Own Shared Profiles

**Status:** Accepted  
**Date:** 2026-09-01

## Context

CRM, Inventory, Transactions, and Open House historically reused broad status fields and copied agent, tenant, and listing data without an explicit ownership or version contract. This made values such as `active`, `converted`, `overdue`, and `public` ambiguous and allowed satellite copies to drift silently.

## Decision

Each business axis has its own field and vocabulary:

- Transactions use the canonical Transaction Stage transition contract; `is_active` remains the independent retention flag.
- CRM stores Contact Lifecycle Stage, Qualification Status, activity history, derived follow-up timing, and archive state independently.
- Inventory stores Property record status, Listing status, Approval status, Publication status, and archive state independently.
- Applications that copy data from another owner store source system, source ID, source version, synchronization time, and a snapshot payload.

Ownership is assigned as follows:

| Data | Owner | Satellite behavior |
|---|---|---|
| Login identity and tenant membership | Central identity / Workspace | Reference canonical user and tenant IDs |
| Agent name, business email, phone, avatar | Workspace Agent Profile | Cache only as a versioned snapshot |
| License number, jurisdiction, expiration | Workspace Professional License | Reference license ID; copy only for historical output |
| Tenant name, logo, colors, address, phone, domains | Workspace Tenant Brand Profile | Read or cache as a versioned snapshot |
| Listing-specific agent presentation and office attribution | Inventory Listing | Other apps store versioned listing snapshots |
| Creative files, templates, campaigns | Brand & Marketing Hub | Reference canonical tenant, user, property, and listing IDs |

## Consequences

- A record can be approved but invite-only, or active in the market but still awaiting review; these are no longer contradictory states.
- Follow-up due/overdue is calculated from dates and is not stored as qualification.
- Existing APIs retain selected legacy aliases during migration, but new writes are normalized.
- Snapshot consumers can detect staleness and refresh intentionally without overwriting historical deal or event facts.
- Satellites must not become competing authorities for agent or tenant identity fields.

## Rejected alternatives

- One universal `status` field was rejected because the state dimensions change independently.
- Live joins for every satellite screen were rejected because they make satellite availability depend on the owner and erase historical context.
- Unversioned copies were rejected because consumers cannot distinguish current data from stale data.
