# Third-Party Apps — Integration Guide

This document explains how third-party vendor apps interact with the Prime America RE Workspace and clarifies what SSO integration is and is not possible.

## Overview

The RE Workspace platform controls and manages authentication for the following **Prime America-controlled** apps:

| App | Hostname | Auth Model |
|-----|----------|-----------|
| RE Workspace | `workspace.primeamericany.com` | Central auth (issues tokens) |
| Listing Inventory | `inventory.primeamericarealestate.com` | SSO via `re_session` cookie |
| Open House Portal | `openhouse.primeamericarealestate.com` | SSO via `re_session` cookie |
| Brand & Marketing Hub | `inside.primeamericarealestate.com` | SSO via `/api/sso/redirect` flow |

## Third-Party Vendor Apps — No SSO Possible

The following apps are **external vendor products**. They have their own authentication systems and **cannot participate** in Prime America's SSO. Users must log in separately to each.

### TransactionDesk
- **URL**: `https://pr.transactiondesk.com/`
- **Vendor**: Lone Wolf Technologies
- **Auth**: Separate credentials (Lone Wolf account)
- **Notes**: No API for federation or token validation is available to third parties. Users must maintain a separate Lone Wolf login. The RE Workspace links directly to it as an external URL.

### OneKey MLS
- **URL**: `https://onekey.clareity.net/layouts`
- **Vendor**: Clareity / Constellation1 (owned by Lone Wolf)
- **Auth**: NYSCAR/NAR member credentials
- **Notes**: OneKey uses a separate SSO system powered by Clareity SSO Manager, tied to MLS board membership. It is not possible to federate with Clareity without becoming an MLS member system integrator. Users log in with their NYSCAR credentials.

### CE Shop Academy
- **URL**: `https://primeamerica.theceshop.com/real-estate/`
- **Vendor**: The CE Shop
- **Auth**: Separate CE Shop account
- **Notes**: The CE Shop is a third-party continuing education provider. The Prime America subdomain is a co-branded portal created by The CE Shop for Prime America agents. No API SSO is available.

---

## Cross-App SSO Flow (Prime America-controlled apps only)

For controlled apps that need to verify the current user's identity:

### Cookie-Based SSO (Same Apex Domain)
Apps on `*.primeamericarealestate.com` share the `re_session` cookie because the cookie is set with `Domain=.primeamericarealestate.com`. These apps can:
1. Read the `re_session` cookie from the request
2. Call `GET /api/auth/me` on the workspace API with the cookie to verify the session

### Token-Based SSO (Cross-Apex Domain)
Apps on `workspace.primeamericany.com` (different apex) use the redirect flow:
1. Workspace calls `POST /api/sso/token` → gets a one-time token
2. Redirects to target app with `?sso_token=<token>`
3. Target app calls `GET /api/sso/validate?token=<token>` → gets user identity
4. Token is consumed after one use and expires in 5 minutes

```
workspace.primeamericany.com → POST /api/sso/token
                             ← { token: "abc123", expiresAt: "..." }
                             → Redirect to https://other-app.com?sso_token=abc123
other-app.com               → GET workspace.../api/sso/validate?token=abc123
                             ← { user: {...}, tenant: {...}, permissions: {...} }
```

### App Launcher SSO Redirect
The workspace's App Launcher can trigger SSO redirects via:
```
GET /api/sso/redirect?app=inventory.primeamericarealestate.com&return_to=/some/path
```
This requires the target app to be registered in the `app_registry` table with `controlled=1` and `sso_capable=1`.

---

## Adding a New Controlled App

1. Register it in the `app_registry` table:
   ```sql
   INSERT INTO app_registry (name, hostname, app_type, controlled, sso_capable, auth_model)
   VALUES ('My New App', 'newapp.primeamericarealestate.com', 'workspace', 1, 1, 'central');
   ```
2. In the new app's Worker, implement one of:
   - **Cookie SSO**: Read the `re_session` cookie and call `GET /api/auth/me` to verify
   - **Token SSO**: Accept `?sso_token` query param, call `GET /api/sso/validate?token=...`

## Adding a New White-Label Tenant

1. Insert the tenant into the `tenants` table
2. Insert the tenant's custom hostname into `tenant_hostnames`:
   ```sql
   INSERT INTO tenant_hostnames (tenant_id, hostname, is_primary, verified)
   VALUES ('tenant_newbrokerage', 'workspace.newbrokerage.com', 1, 1);
   ```
3. Point the custom domain to the re-workspace Worker via Cloudflare Dashboard → Workers & Pages → Custom Domains

---

*Last updated: 2026-07-12*
