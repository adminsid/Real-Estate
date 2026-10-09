# Prime America Real Estate — Component & Feature Specification

This document details the functional behavior, RESO standards, button actions, and micro-interactions for every major screen in the Central Workspace.

---

## 1. Global Layout & Header (`Header.tsx` & `CommandPalette.tsx`)

### Visual Standard
- **Header Bar**: Solid white background (`bg-white border-b border-gray-200 shadow-xs`), no backdrop blur jitter, fixed at the top of the viewport.
- **Search Trigger**: Compact input box with keyboard badge `⌘K`. Clicking or pressing `⌘K` / `Ctrl+K` opens the floating Command Hub modal.

### Command Hub (`CommandPalette.tsx`)
- **Backdrop**: Clean dark scrim (`bg-black/60`) without double-blur compositing distortion.
- **Keyboard Navigation**: `↑` / `↓` moves highlight; `Enter` executes action; `ESC` dismisses.
- **Supported Slash Commands**:
  - `/new-deal` $\rightarrow$ Launches deal creation modal.
  - `/new-contact` $\rightarrow$ Opens CRM quick contact modal.
  - `/my-listings` $\rightarrow$ Routes to `/inventory/mls` with "My Listings" active.
  - `/open-houses` $\rightarrow$ Routes to `/marketing/openhouses`.
  - `/brand-hub` $\rightarrow$ Opens `https://inside.primeamericarealestate.com`.

---

## 2. Standardized 4-Section Dashboard Blueprint

Every role dashboard follows the exact same 4-tier visual hierarchy:

```
┌───────────────────────────────────────────────────────────┐
│ 1. Executive Greeting & Do Now / Alert Exceptions         │
├───────────────────────────────────────────────────────────┤
│ 2. Four Primary KPI Micro-Widgets (Isolated Retry State)  │
├───────────────────────────────────────────────────────────┤
│ 3. Active Workload & Deals Closing in 14 Days             │
├───────────────────────────────────────────────────────────┤
│ 4. Quick Actions & Satellite Launchers (1-Click SSO)      │
└───────────────────────────────────────────────────────────┘
```

1. **Top Section — Executive Greeting & Do Now**:
   - Dynamic time-based greeting (*Good morning / afternoon / evening, <Name>*).
   - Alert exceptions: *Overdue follow-ups*, *Stage-gate missing milestones*, *Closings within 14 days*.
2. **Metrics Section — 4 Primary KPI Micro-Widgets**:
   - Independent micro-fetchers.
   - If one sub-service is down, shows `—` with an unobtrusive "Offline" status and `Retry` button.
3. **Operational Section — Workload & Closings**:
   - Lists up to 8 prioritized deals closing soon with clickable route to detail view.
4. **Bottom Section — Quick Actions Launchpad**:
   - Fast access cards for *Deals Pipeline*, *MLS Listings*, *CRM*, *Open Houses*, *Brand Hub*, and *Settings*.

---

## 3. Deals & Pipeline Component (`/transactions/pipeline`)

### RESO Standard Deal Stages
Pipeline columns strictly adhere to RESO standard listing/contract states:
1. `Coming Soon / Lead` — Prospective transaction / pre-listing agreement.
2. `Active` — On market or active buyer representation.
3. `Active Under Contract` — Accepted offer, inspection / appraisal in progress.
4. `Pending` — Contingencies cleared, attorney approval, clear to close.
5. `Closed` — Transaction completed, commission disbursed.
6. `Paused / Fallen Through` — Archived or cancelled deals.

### Stage-Gate Enforcement
- Dragging a card to `Active Under Contract` or `Pending` triggers validation:
  - Requires `target_close_date` and `price`.
- Moving to `Closed` verifies:
  - Closing date, final gross commission, and compliance checklist check.

### Card & Action Controls
- **Quick Menu (3 dots)**: *Edit Deal Details*, *Manage Checklist*, *Split Calculator*, *Archive*.
- **Summary Bar**: Displays *Active Volume ($)*, *Projected Commission ($)*, and *Closings (14 Days)*.

---

## 4. Property Inventory & MLS Component (`/inventory/mls`)

### Scope Selector Tabs
- **`All Brokerage Listings`**: Entire brokerage inventory fetched from MLS / D1.
- **`My Listings`**: Automatically filtered view matching the logged-in agent by `listAgentEmail`, `listAgentFullName`, `coListAgentEmail`, or `assigned_to`.

### Search & Filtering
- Search by MLS Number, Street Address, City, or Zip Code.
- Status filters: `Active`, `Pending`, `Sold`, `Rented`, `Coming Soon`.
- Property Type: `Residential`, `Condo / Co-Op`, `Commercial`, `Land`.
- View mode switcher: `Grid View` (image cards) vs `Table View` (dense spreadsheet style).

### Action Buttons
- **`Create Listing Draft`**: Direct SSO link into `https://inventory.primeamericarealestate.com` for entering new property forms.
- **`Add to Pipeline`**: Converts property into an active buyer deal card.
- **`Share Listing Link`**: Copies agent-branded URL with instant CRM lead capture.

---

## 5. CRM & Lead Management Component (`/marketing/crm`)

### Client Lifecycle Stages
- `New Lead` $\rightarrow$ `Contacted` $\rightarrow$ `Nurturing` $\rightarrow$ `Active Showing` $\rightarrow$ `Under Contract` $\rightarrow$ `Past Client / Closed`.

### Key Actions
- **`Log Activity`**: Record phone call summaries, emails sent, and showing notes.
- **`Create Deal`**: 1-click conversion from a CRM contact into an active Deals Pipeline card.
- **`Lead Ingestion`**: Leads captured from shared listing links are automatically created and assigned to the referring agent. Open House attendees can be reviewed and manually imported.

---

## 6. Open House Portal (`/marketing/openhouses`)

- **Host Open House Action**: Launches `/api/sso/redirect?app=openhouse&return_to=/admin` for immediate pre-authenticated access to create and manage digital QR sign-in kiosks.
- **Events Grid**: Shows scheduled and live open house events with address, date, and assigned hosting agent.
