# Prime America Real Estate — Agent Guidelines

These guidelines define the engineering workflow, domain architecture, and standards for all AI coding agents working in this repository.

---

## Agent Skills

### Issue Tracker
Issues and tracer-bullet tickets are tracked via GitHub Issues (`gh`). See [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

### Domain Docs
Single-context layout rooted at [`CONTEXT.md`](CONTEXT.md) and [`docs/adr/`](docs/adr/). See [`docs/agents/domain.md`](docs/agents/domain.md).

---

## Core Architecture & Stack
- **Central Workspace**: React 18 PWA + TypeScript + TailwindCSS.
- **Gateway Worker**: Cloudflare Worker (`worker/index.ts`) managing routing, CORS, and service bindings.
- **Sub-Workers**:
  - `re-crm` (`workers/crm`): Private CRM service binding (`env.CRM`).
  - `re-transactions` (`workers/transactions`): Private Transactions service binding (`env.TRANSACTIONS`).
  - `prime-america-auth` (`workers/auth`): Central Better-Auth identity service (`auth.primeamericarealestate.com`).
- **Database**: Cloudflare D1 SQLite (`re-workspace-db`).
- **Standardized MLS Statuses**: RESO Data Dictionary 2.0 (`StandardStatus`).

---

## Quality & Verification Loop (Non-Negotiable)
Before proposing completion or deploying:
1. **Unit & Integration Tests**: `npm test` (All Vitest suites must pass).
2. **Type Safety**: `npm run typecheck` (`tsc --noEmit` with 0 errors).
3. **Production Build**: `npm run build` (Clean compilation).
4. **Deploy**: `npx wrangler deploy` (via `wrangler` skill).
