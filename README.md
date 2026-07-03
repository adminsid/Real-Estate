# RE Workspace

> **Your Real Estate Command Center** — A globally available, mobile-friendly PWA built on Cloudflare for real estate professionals.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)

---

## Overview

RE Workspace is an all-in-one workspace for real estate salespersons, brokers, and teams in New York. It unifies the tools you need every day — MLS listings, CRM, CMAs, education resources, and networking — so you never have to juggle multiple tabs or websites again.

### Core Modules

| Category | Apps |
|---|---|
| **Transactions** | CMA (Comparative Market Analysis), TransactionDesk *(in progress)* |
| **Inventory** | MLS Listings, Listing Manager *(in progress)* |
| **Marketing** | Custom Website, CRM, Marketing Hub *(in progress)* |
| **Learning** | Academy (CE courses), NY License Law (Article 12-A) |
| **Network** | Professionals, Brokers, Vendors, Partners |

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS (custom navy/gold brand palette)
- **PWA:** `vite-plugin-pwa` with Workbox service worker
- **Routing:** React Router DOM v6
- **State:** React Context + Zustand
- **Backend:** Cloudflare Workers (TypeScript)
- **Storage:** Cloudflare KV (sessions), D1 (database), R2 (file assets)
- **Deployment:** Cloudflare Pages + Workers

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (for Cloudflare deployment)

### Local Development

```bash
# Install dependencies
npm install

# Start frontend dev server (http://localhost:5173)
npm run dev

# Start Cloudflare Worker dev server (http://localhost:8787)
npm run worker:dev
```

### Build

```bash
# Build the frontend PWA
npm run build

# Preview the production build
npm run preview
```

### Deploy to Cloudflare

```bash
# 1. Deploy the frontend to Cloudflare Pages
npm run pages:deploy

# 2. Deploy the Worker API
npm run worker:deploy
```

---

## Cloudflare Bindings

After deployment, create and bind the following Cloudflare resources in `wrangler.toml`:

| Binding | Type | Purpose |
|---|---|---|
| `WORKSPACE_KV` | KV Namespace | User sessions & preferences |
| `DB` | D1 Database | Contacts, listings, transactions |
| `ASSETS` | R2 Bucket | Documents, images, exports |

```bash
# Create resources
wrangler kv:namespace create WORKSPACE_KV
wrangler d1 create re-workspace-db
wrangler r2 bucket create re-workspace-assets
```

---

## Features

- ✅ **Dashboard** — Unified app hub with quick stats
- ✅ **CMA Tool** — Comparable Market Analysis with adjustments
- ✅ **MLS Listings** — Browse and filter NY property listings
- ✅ **CRM** — Manage buyers, sellers, vendors, and leads
- ✅ **Network** — Directory of professionals and partners
- ✅ **Learning Hub** — CE resources + NY Real Estate Article 12-A
- ✅ **Branding** — Customizable company name, colors, and tagline
- ✅ **PWA** — Installable on mobile and desktop, works offline
- ✅ **Auth** — Login / Signup with role selection (salesperson, broker, vendor…)
- ✅ **Privacy Controls** — Data export, visibility settings
- 🔜 **TransactionDesk** — Digital forms & e-signatures
- 🔜 **Listing Manager** — Create & publish new listings
- 🔜 **Marketing Hub** — Email campaigns & social scheduling
- 🔜 **Finance** — Earnings tracker (future module)

---

## NY Real Estate Compliance

This workspace includes resources for NY-licensed professionals:

- [NY Real Estate Article 12-A](https://www.dos.ny.gov/licensing/re_salesperson/re_salesperson.html)
- [eAccess NY — License Management](https://www.eaccessny.ny.gov/)
- CE Requirements: **22.5 hours every 2 years** (incl. 3 hrs Fair Housing + 1 hr Agency)
- Academy: [Prime America × The CE Shop](https://primeamerica.theceshop.com/real-estate/)

---

## Project Structure

```
/
├── src/
│   ├── components/
│   │   ├── auth/        # Login & Signup pages
│   │   ├── apps/        # AppTile component
│   │   ├── common/      # Badge, UnderConstruction
│   │   └── layout/      # Sidebar, Header, Layout
│   ├── context/         # AuthContext, WorkspaceContext
│   ├── pages/           # All route pages
│   ├── types/           # TypeScript types
│   ├── utils/           # Constants, app modules
│   ├── App.tsx
│   ├── routes.tsx
│   └── main.tsx
├── worker/
│   └── index.ts         # Cloudflare Worker API
├── public/              # Static assets, favicon, PWA icons
├── wrangler.toml        # Cloudflare configuration
├── vite.config.ts       # Vite + PWA configuration
└── tailwind.config.js   # Tailwind theme
```

---

## License

Private — Prime America Realty © 2024. All rights reserved.