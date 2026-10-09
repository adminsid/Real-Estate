# ADR 013: Separate consumer search presentation from brokerage identity

**Status:** Accepted for local development; production integration pending  
**Date:** 2026-10-08

The consumer listing search needs its own branding and an embedded view without becoming another authority for brokerage, agent, Property, or Listing records.

Keep a validated Search Brand Kit in the presentation service. Standalone pages and the iframe view use the same kit and reviewed public Listing projection. Brand changes cannot alter MLS attribution or display eligibility. Production kits must reference a versioned Workspace Tenant Brand Profile snapshot and authorize service-specific presentation overrides, preserving ADR 005’s identity ownership. Inventory remains the owner of Property identity (ADR 003); canonical public listing routes identify source and Listing record, not a new Property identity.

Every public Listing has one full-page URL with server-rendered content and canonical/share metadata. The embed opens that page for full details and sharing. Select the production canonical origin once per installation. Brokerage-domain SEO requires a server-rendering adapter or proxy there; an iframe alone is not that integration. Private exclusive URLs will require a separate non-indexable publication path and access-token policy before that feature is implemented.

The local Node preview is an adapter for development, not an additional production gateway or identity service. Its local brand-save API and demo inquiry store must not be exposed as production endpoints. Production inquiries must connect to canonical CRM Contacts and Listing Inquiries under ADR 009, with existing consent and appointment rules.
