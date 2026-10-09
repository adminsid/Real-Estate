# ADR 010: Seller journeys connect CRM and transaction work

Next is a seller engagement workspace with four phases. It can exist before either a Listing or Transaction and is reachable from CRM Contacts, Listings, Transactions, and assigned work on dashboards. Creating a journey does not create a Transaction or change a business status.

Journey checklists are revisioned documents because their milestones and outcomes are editable and template content must remain stable for existing journeys. Explicit membership controls collaboration; assistant membership additionally requires a current delegated contacts scope for the owner. Related Contacts is a separate relationship between people and conveys no permission. Linked business logs keep the existing business record's permissions.

Offers and showings begin as journey records. Linking a Transaction or Listing promotes those records atomically into canonical offers and showings. Established links cannot be silently replaced. Accepted offer evidence controls the Contract and Closing gate; the checkbox cannot invent acceptance. This gate does not change transaction stages or MLS statuses.

Every checklist update requires the last revision, and dependent writes require a unique winning command ID. Prior checklist revisions and comment authorship are retained. Reset restores the seller template while preserving links, logs, membership and comments. Removed-outcome comments remain visible in the earlier-version section.
