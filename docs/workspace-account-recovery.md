# Workspace account recovery — 2026-10-08

## Root cause

The production account check confirmed Bhuwan Khatri already had an active salesperson account and a stored password, but `email_verified=0` and no recorded successful login. Impersonation checks active membership without checking the target's password or email verification, so successful impersonation did not establish normal login readiness. The pasted console showed earlier login 403s and a later login 401, consistent with the verification gate and then a rejected email/password combination. Welcome resend replaces the existing password; older temporary passwords stop working.

The production configuration omitted `APP_BASE_URL`. The welcome sender interpolated that missing value into `undefined/login`. A diagnostic using the real email sender and repository configuration reproduced that exact link.

Notifications started on the root route even while signed out. A pending reconnect timer survived effect cleanup, causing repeated unauthorized stream requests.

## Repair

- Configure explicit production and staging email origins. Validate email destinations before sending instead of emitting malformed links; use the configured origin for the post-verification welcome email as well.
- New password-reset tokens bind the user ID and recipient email. A valid redemption updates the password and verifies that same current email, without activating a disabled account. Changed-email, invalid, expired, or replayed tokens fail. Legacy ID-only reset tokens remain usable for already-verified active accounts and cannot verify an unverified account.
- Welcome resend includes a verification link when needed, validates the origin before replacing the password, and generates the replacement with Web Crypto. Correct the resend update's SQLite datetime string quoting.
- Start notifications only after authentication finishes; cancel pending reconnect timers on cleanup.

No account rows were modified during diagnosis or deployment. No email was sent: the user requested to send the recovery email themselves from Workspace.

## Verification and deployment

Regression tests exercised the real gateway and SQLite: active/unverified login rejection, emailed reset redemption, retained identity, successful login and `/api/auth/me`, replay and old-password rejection, changed-email rejection, disabled-account rejection, legacy-token restrictions, admin recovery, welcome verification links, and invalid configuration before password replacement. Notification tests exercised the provider effect and timer cleanup.

- `npm test`: 63 files, 477 tests passed. The initial sandboxed run could not bind the local HTTP test server; the full suite passed with permission to open it.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing large-chunk warning remains.
- Wrangler generated configuration types successfully to a temporary file.
- `npx wrangler deploy --keep-vars`: succeeded, preserving dashboard-managed variables and defining the configured email origin.
- New version: `e34d05a1-7299-4e40-86b2-8aa4851a3d2f`.
- Previous version: `38197a68-123d-4bd3-b83f-dc67f8157353`.
- Live login page served `assets/index-u-fKdFJZ.js`, matching the new build.
- Live synthetic invalid reset token returned HTTP 400 with the new recovery error. No real account token was used.

## Remaining account acceptance step

As an admin, open `/user-management`, find Bhuwan, and select **Force password reset email**. Bhuwan must open that newly generated email, choose his password, and sign in at `https://workspace.primeamericany.com/login`. Completing the new reset verifies his email. His current account stays unverified until he completes that step; deployment does not silently bypass inbox verification.

For application rollback, restore the recorded previous Worker version and its corresponding frontend assets together. Workers Sites removes stale assets during deployment, so a Worker-only rollback may require restoring the matching prior frontend build. No database migration was required.
