# Posted commission facts are corrected by linked entries

Status: Accepted for implementation, 2026-09-06. Supersedes ADR 007's permission to update an already posted earned entry.

A closed deal's first posted earning remains immutable. A later correction or reopening creates an adjustment linked to that earning, retaining the effective plan and calculation inputs; a unique deal revision prevents duplicate posting. Rewriting the original amount would lose the evidence needed to reconstruct prior balances. Deal state, commission entries, and the related CRM lifecycle change commit in one shared-database batch. Earned amounts remain distinct from payments and tax-reportable compensation.
