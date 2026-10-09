# ADR 001: Central Authentication & Identity Service with Better-Auth

## Status
Accepted; migration in progress (2026-08-31)

## Context
Prime America Real Estate operates multiple applications across subdomains:
- Central Workspace (`workspace.primeamericany.com` / `app.primeamericarealestate.com`)
- Listing Inventory (`inventory.primeamericarealestate.com`)
- Open House System (`openhouse.primeamericarealestate.com`)
- Brand & Marketing Hub (`inside.primeamericarealestate.com`)
- Public Corporate Site (`primeamericarealestate.com`)

Currently, auth logic, session cookies, and user stores are fragmented or duplicated across Workers. `dev/branding hub` already uses `better-auth`, while `dev/real-estate` manages its own JWT sessions.

## Decision
We will extract all authentication, role management, MFA, Passkeys, and SSO brokerage into a dedicated Cloudflare Worker:
- **Worker Name**: `prime-america-auth`
- **Domain**: `auth.primeamericarealestate.com`
- **Engine**: `better-auth` (with Cloudflare D1 + KV + Passkey plugin + Organization plugin)
- **Cookie Scope**: Cross-subdomain wildcard cookie (`domain: ".primeamericarealestate.com"`)
- **User Migration**: Ingest and map existing accounts from `re-workspace-db` into the canonical `user`, `account`, `session`, and `verification` tables.

The Central Workspace remains the active identity authority until the migration boundary below is satisfied. Applications must not independently create a second password store or permanently accept both authorities.

## Migration Boundary

1. Harden `prime-america-auth` so missing secrets, untrusted browser origins, and unauthenticated service validation fail closed.
2. Dry-run and reconcile the mapping from every legacy user to one canonical user ID, tenant membership, and role. No credential or role dual-write is permitted.
3. Shadow-validate central sessions at the Workspace gateway while legacy sessions remain authoritative; record mismatches without changing user access.
4. Cut over one application at a time behind a reversible configuration flag. Rollback restores legacy session validation without reversing migrated business data.
5. After all applications consume canonical identity reliably, disable legacy credential mutation and expire remaining legacy sessions.

Cookies scoped to `.primeamericarealestate.com` can be shared only by hosts under that parent domain. `workspace.primeamericany.com` therefore requires a signed redirect/session exchange (or a move to `app.primeamericarealestate.com`); it cannot receive the wildcard cookie directly.

## Consequences
### Positive
- Single Sign-On across all subdomains without token redirection overhead where shared domain cookies apply.
- Built-in Passkey (FaceID / TouchID) support for mobile real estate agents.
- Centralized user administration, role assignment, and organization team management.
- Complete decoupling of application business logic from identity infrastructure.

### Considerations
- `re-workspace` Gateway Worker will act as a Better-Auth client, validating sessions via shared cookie or service binding RPC.
- Application databases continue to own business profiles and tenant-scoped authorization data, referenced by the canonical identity ID; they do not own credentials after cutover.
