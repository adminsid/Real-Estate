# Deal financial revisions separate compensation agreements from settlement

Deal prices and compensation are saved as immutable financial revisions, with outside brokerage allocations removed before internal agent compensation. Broker approval posts linked earnings or corrections into the existing commission ledger; closing, brokerage receipts, agent payments, and account charge settlements remain distinct events. This extends ADR 008 without rewriting historical posted entries or interpreting ambiguous legacy fields automatically.

Named agent plans are immutable, effective-dated versions. They are separate from legacy plans because the Expert company-contribution cap has different semantics from the old per-deal payout cap. Cap movements use database revision guards in the same batch as earnings so competing approvals cannot consume the same remaining allowance. Original plan inputs remain in approved snapshots.

The user elected to keep business rules configurable: cap period and opening contributions, Pro fee boundary and allocation basis, profit-sharing basis/schedule, and charge collection policy. Unresolved rules block affected compensation approval. Profit-sharing calculations and account billing are explicit reviewed entries; saving a plan never initiates payment or silently creates charges. Monthly charge keys prevent billing a period twice.
