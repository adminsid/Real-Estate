# Specification: Dedicated Central Auth Service (`prime-america-auth`)

## Problem Statement

Authentication and session management are currently fragmented across multiple satellite applications and the Central Workspace. This leads to redundant login prompts, disconnected user records, and complex token-passing logic. Agents in the field need a frictionless, secure single sign-on experience supporting Passkeys (FaceID/TouchID), Google OAuth, and cross-subdomain sessions across all company tools.

---

## Solution

Build and deploy a dedicated **Central Auth Worker** (`prime-america-auth`) hosted at `auth.primeamericarealestate.com` powered by **`better-auth`**:
1. **Shared Wildcard Cookie (`.primeamericarealestate.com`)**: Log in once at `auth.primeamericarealestate.com` to gain authenticated access to Inventory, Open House, Brand Hub, and the Workspace when served from `app.primeamericarealestate.com`. The legacy `workspace.primeamericany.com` hostname requires a signed redirect/session exchange because it is on a different parent domain.
2. **Modern Auth Methods**: Email + Password, Passkeys (WebAuthn / Biometrics), and Google OAuth.
3. **Two-Tier Role Schema**: Global platform role (`admin`, `broker`, `salesperson`, `assistant`, `vendor`, `partner`) combined with Better-Auth Organization plugins for brokerage teams.
4. **Seamless User Migration**: Existing accounts in `re-workspace-db` are migrated into the canonical Better-Auth D1 schema.
5. **SSO Legacy Gateway Fallback**: Provide `/api/sso/validate` and OIDC-style token verification for third-party or external origin domains.

---

## User Stories

1. As an agent on mobile, I want to log in using FaceID/TouchID (Passkey) so that I can quickly access client deals without typing long passwords in the field.
2. As an agent, I want to log in once on `app.primeamericarealestate.com` and automatically be authenticated on `inventory.primeamericarealestate.com`, `openhouse.primeamericarealestate.com`, and `inside.primeamericarealestate.com` via wildcard cookies; when using `workspace.primeamericany.com`, the system performs a signed session exchange.
3. As an agent, I want to sign in using my Google Workspace account (`@primeamericany.com` or `@primeamericarealestate.com`) with 1-click Google OAuth.
4. As a broker, I want to assign and update agent roles in one central admin dashboard and have the permissions reflect instantly across all satellite applications.
5. As an assistant, I want my principal agent delegation permissions to be authenticated centrally so I can manage transactions securely.
6. As a compliance officer, I want centralized audit logging for all login attempts, password resets, and session revocations.

---

## Implementation Decisions

### 1. Service Architecture
- **Package Location**: `workers/auth` inside the `dev/real-estate` repository (or standalone worker directory).
- **Core Dependencies**:
  - `better-auth`: Core authentication engine.
  - `@better-auth/cli`: Database migration generator for Cloudflare D1.
  - `better-auth/plugins`: Passkey plugin, Organization plugin, Multi-Session plugin.
- **Database**: Dedicated D1 Database `prime-america-auth-db`.

### 2. Cookie & Domain Configuration
- `BETTER_AUTH_URL`: `https://auth.primeamericarealestate.com`
- `crossSubDomain`: `{ enabled: true, domain: ".primeamericarealestate.com" }`
- `basePath`: `/api/auth`

### 3. Satellite Integration Seams
- **Central Workspace (`re-workspace`)**: Uses Better-Auth React client and server session validation on `app.primeamericarealestate.com`; the legacy `workspace.primeamericany.com` hostname uses a signed redirect/session exchange.
- **Brand Hub (`dev/branding hub`)**: Points its existing Better-Auth client to `https://auth.primeamericarealestate.com`.
- **Open House & Inventory**: Validates session cookie or calls `auth.primeamericarealestate.com/api/auth/get-session`.

---

## Testing Decisions

- Unit test Better-Auth configuration, role checks, and session cookie generation via Vitest.
- Integration test cross-origin token validation and session retrieval endpoints.

---

## Out of Scope

- Self-hosted SMS telephony gateway for SMS 2FA (Email OTP and WebAuthn Passkeys used instead).
- Third-party social logins other than Google (e.g. Facebook/Apple).
