# Next seller journey

Open `/next`, or use Open Next from CRM, a Contact, Listing or Transaction. The imported seller template preserves the supplied HTML's complete four phases, 23 milestones and 182 outcomes, including post-closing check-ins. `scripts/extract-next-template.mjs` extracts the source data; `src/domain/next-seller-template.json` is the versioned template.

Users can create and switch journeys, edit titles/descriptions, add/edit/delete milestones and outcomes, collapse cards, hide and restore work, and set outcomes not applicable with a reason. The offer-acceptance outcome cannot be deleted or manually completed. Hidden work still counts toward progress. Checklist edits use an explicit Save changes button and preserve unsaved edits on a conflict.

Team members receive outcome assignments and due dates, with comments recorded under the actual author. Prime View’s My Day tab shows assigned work and active journeys; dashboards do not duplicate Next. Assistants must have both journey membership and active delegation. Related Contacts supports reciprocal relationship labels and notes on existing or newly created CRM contacts.

Offers and Showings use canonical records after linking. Inventory links can be customized. Import accepts the original prototype export and Next exports as new journeys, clearing assignments and business links. Export omits restricted business logs for collaborators. Reset affects only the selected checklist and retains linked records and comment history.

Verification covers the actual SQLite migration and handlers: tenant isolation, membership/revocation, stale writes, template counts, legacy import, linked-log promotion, locked transactions, accepted-offer gating, comments, reset and reciprocal relationships. Browser checks use an isolated in-memory preview; demo records are not production records.

## Delivery verification — 2026-09-14

- 44 test files / 322 tests passed; frontend typecheck, dedicated Next Worker typecheck, production build and Wrangler dry run passed. The build retains the existing large-chunk warning.
- Browser preview verified creation, adding an outcome, completion progress, save/reload persistence, and accepted-offer unlocking.
- Migration 057 applied successfully after validation against the production database backup, with zero foreign-key violations in the copied database.
- Deployed gateway version `2e769cdf-2ae6-4685-81f8-6a1ada2b1a3a`. Production `/next` returns 200 and the unauthenticated journey API returns 401. The live browser reaches sign-in; authenticated production UI validation requires a user session.
