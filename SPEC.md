# Specification: Central Workspace Realignment & RESO Standard Architecture

## Problem Statement

The Prime America multi-project ecosystem had divergent naming, inconsistent role-based dashboards, jittery header search rendering, and loose integration contracts between the Central Workspace and satellite applications (Listing Input, Open House, Brand Hub). Users and agents need a cohesive, predictable, and resilient workspace where every role sees relevant metrics, deals follow standard MLS/RESO listing and transaction stages, and navigation between internal tools and external software is unified.

---

## Solution

1. **RESO Data Dictionary 2.0 Standardization**:
   - Align all listing and deal pipeline stages to the canonical RESO standard (`Coming Soon`, `Active`, `Active Under Contract`, `Pending`, `Hold`, `Closed`, `Expired`, `Canceled`, `Withdrawn`).
   - Enforce stage-gates requiring target close dates and price before transitioning deals to `Active Under Contract` or `Pending`.
2. **Unified 4-Section Dashboard Architecture**:
   - Establish a standard 4-section layout across all 6 roles (`Super Admin`, `Managing Broker`, `Licensed Salesperson`, `Assistant/TC`, `Vendor`, `Partner`).
   - Standardize micro-widgets with isolated retry fallbacks so failures in sub-services never crash the entire view.
3. **Clean Header & Command Palette**:
   - Replace backdrop blur distortion on sticky headers with solid, high-contrast framing.
   - Centralize global search into a floating ⌘K Command Hub.
4. **My Listings Scope Filter**:
   - Provide a 1-click filter in the MLS/Inventory explorer showing only properties where the logged-in agent is the listing agent or co-listing agent.
5. **Role-Based Permissions & Attribution**:
   - Attain strict user role hierarchy enforcement across navigation, HR roster sync, tenant configuration, and CRM lead ingestion.

---

## User Stories

1. As an agent, I want a clean, solid top header with a ⌘K search bar so that I can quickly jump to deals, contacts, or tools without visual blur glitches.
2. As an agent, I want to filter the MLS inventory by "My Listings" so that I can view and manage only my active and pending listings.
3. As an agent, I want to click "Create Listing Draft" and be seamlessly redirected into the Listing Input application with single sign-on authentication.
4. As an agent, I want to click "Host Open House" and be automatically authenticated into the Open House portal to manage visitor sign-ins.
5. As an agent, I want leads generated from my shared property links to automatically create attributed contacts in my CRM.
6. As a broker, I want to view brokerage-wide transaction volume, active pipelines, and closing dates across all agents.
7. As a broker, I want to synchronize the agent roster with the NY Department of State licensing database to ensure active compliance.
8. As a transaction coordinator, I want to see stage-gate checklists for deals in escrow so that missing appraisals, inspections, or titles can be resolved prior to closing.
9. As an admin, I want to configure tenant settings and inspect system logs without affecting daily agent operations.
10. As any user, I want dashboard metric cards to load independently with per-card retry buttons so that a temporary API hiccup never breaks the entire page.

---

## Implementation Decisions

- **Architecture**:
  - Central Gateway Worker (`worker/index.ts`) coordinates identity, SSO token handoffs, and CORS policies.
  - React 18 frontend uses modular components with TypeScript type-safety and isolated fetch hooks.
- **RESO Standards**:
  - `StandardStatus` enum values map directly to MLS feeds and internal deal pipelines.
- **Security & Session**:
  - All authenticated API calls enforce `{ credentials: 'include' }`.
  - SSO token exchanges use one-time 5-minute UUIDs verified with `INTERNAL_API_SECRET`.
- **Testing Seam**:
  - Component-level and logic unit tests executed via Vitest at the UI and Worker API boundaries.

---

## Testing Decisions

- Tests verify external behavior, status transitions, role hierarchy evaluation, and resilience against upstream network failures.
- Zero mock leakage into production code.

---

## Out of Scope

- Direct billing/credit card payment gateway processing (handled via external vendor portal).
- Modifying legacy MLS RETS XML feeds (replaced by modern RESO Web API).
