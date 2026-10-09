# Deals financials release

The existing deal layout gains a Financials tab, a concise left-side summary, and a CDA generated from the saved revision. Offers remain in Offers. Accepting an offer no longer executes a contract. Asking, accepted, contract, sold, and seller credits have separate meanings.

## Operating workflow

1. In HR → Commission, configure named agent plans. Confirm only agreed settings; unresolved Expert/Pro settings remain pending. Existing company contributions can be recorded for the relevant cap period.
2. In Deal → Financials, review legacy amounts, set prices and representation, record the compensation agreement and document reference, allocate outside brokerage compensation when applicable, and reconcile expected funding.
3. Allocate the Prime America pool among participating agents. Document any fixed deduction before that allocation, including its recipient and calculation basis.
4. Close the deal with its actual date, confirm sold price, and finalize compensation as broker/admin. Saving a revision alone does not post earnings.
5. Record actual brokerage receipts and agent payments separately. Reportable payment amounts are explicitly recorded. Agent account charges can be billed separately in HR or withheld in a deal payment under a configured policy.
6. Use the existing CDA action to print the saved calculation. Drafts are labeled and cannot masquerade as approved settlements.

## Configurable policies

Expert cap reset/date and opening contributions; Pro fee at exactly $20,000 and per-agent/per-deal basis; Team Leader profit-sharing percentage, basis, and schedule; account charge collection method, setup fee, monthly fee. None of these settings initiates bank activity. Profit-sharing and recurring monthly charge posting are explicit reviewed operations, not automatic scheduled jobs.

Financial editing, approval and cash records require broker/admin access. Salespersons see their own compensation on accessible deals; assistants do not see agent compensation. HR permissions additionally protect plan/account administration.

## Migration and recovery

Apply only 058_deal_financials.sql after verifying its prerequisites. Preserve legacy deal values and posted commission history. Review legacy values before adopting Financials; do not infer whether a legacy gross amount includes outside compensation. The new plan engine does not reinterpret legacy payout caps.

Deploy the Transactions Worker before the gateway/frontend. Keep additive tables on rollback. Any prior Transactions Worker that ignores financials_version can incorrectly post legacy earnings on adopted deals: do not roll it back while allowing financial writes. Pause transaction writes during a backend rollback and reconcile versions before resuming. Never reverse migration by deleting financial or payment history.

## Verification

Unit and SQLite integration coverage includes brokerage allocation, external MLS compensation, funding, configured Pro boundaries, cap crossing, concurrent cap guards, immutable approved history, stale revision rejection, reopening without deleting payments, charge withholding, duplicate billing/payment protection, and tenant/role isolation. Run npm test, npm run typecheck, npm run build, plus a Worker-specific TypeScript check. Inspect the local isolated UI fixture at .scratch/deal-financials-preview.html; fixture data never ships in the production build.

## Production release — September 28, 2026

- Validation: 48 Vitest files, 345 tests passed; app and financial Worker TypeScript checks passed; production build passed (existing large-chunk warning). Local fixture verified price editing and responsive layout.
- Applied migration 058 only, including its d1_migrations entry. Migration 056 remains outside this release. Verified the new financial tables remotely.
- Before migration bookmark: `00000242-00000000-000050f4-c0ac031909056f4d6d91e9867cc9aaf2`.
- After migration bookmark: `00000242-00000008-000050f4-f1f8ae24161672cad9f77be169c5ac90`.
- Transactions Worker version: `6cbae82a-66ef-4984-8fcc-40f2c8c971a3`.
- Workspace gateway/frontend version: `4a3d226e-e034-442b-afa2-222d9dd6987e`.
- Live workspace HTML serves `index-1UefT56U.js`; unauthenticated financial-plan API returns HTTP 401. No production demo transactions or payments were created. Authenticated production financial writes were not smoke-tested; those flows were covered by SQLite integration tests and the isolated local UI fixture.
