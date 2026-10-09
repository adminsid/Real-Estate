# ADR 007: Commission Ledger and Payment-Based Tax Reporting

**Status:** Accepted  
**Date:** 2026-09-03

## Context

Closed Deals currently expose projected gross commission, while HR applies browser-local split settings and treats that estimate as 1099-NEC compensation. A closing, an earned obligation, an advance, and an actual payment are different events. Recalculating historical compensation from a user's current plan also changes prior-period results.

## Decision

Commission Plans are effective-dated and copied by reference onto immutable Commission Ledger entries. Closing a Deal creates or updates one earned entry; it does not imply payment. Advances, payments, repayments, adjustments, and chargebacks are separate entries. Each entry records both its accounting amount and the amount designated as taxable compensation.

The 1099-NEC report is an internal preparation report based on posted taxable amounts with a payment date in the selected tax year. It never derives Box 1 from Deal close dates. Full taxpayer identification numbers are not stored in this workspace; only W-9 readiness and the last four digits are retained.

## Consequences

- Historical payouts retain the plan and calculation used when earned.
- Pipeline GCI, earned compensation, cash paid, advances, and tax-reportable compensation can be reconciled independently.
- Missing plans or W-9 data appear as review items instead of silently defaulting to a final tax amount.
- Producing or filing an official information return remains a separate reviewed workflow.

## Rejected alternatives

- Using closed Deal commission as Box 1 was rejected because closing is not evidence of payment.
- Browser-local split settings were rejected because they are neither shared nor auditable.
- Storing complete taxpayer IDs in the operational workspace was rejected to reduce sensitive-data exposure.
