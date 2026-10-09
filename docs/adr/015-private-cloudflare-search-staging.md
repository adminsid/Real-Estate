# ADR 015: Port consumer search to isolated Cloudflare staging

Status: Accepted for private staging on October 8, 2026. Public IDX publication remains subject to the approved installation and source rules.

Keep the consumer interface, page renderer, stable Listing paths and parameterized search filters shared between the local SQLite preview and the search Worker. The Worker has dedicated `SEARCH_DB` D1 and `SEARCH_MEDIA` R2 bindings; it does not bind the Workspace database, identity service, CRM or Transactions. This makes deployment behavior testable without changing brokerage operations or replacing Placester.

The first remote dataset is synthetic. A separate seed generator creates explicitly fictional records and labeled SVG illustrations; no MLS record, media asset, inquiry or token is exported from `.mls-grid-demo`. The search Worker contains no feed token or import endpoint. Licensed replication and removal propagation remain a later, separately verified adapter.

Protect the proposed `preview-search.primeamericany.com` host with Cloudflare Access. Independently validate Access signatures, audience, issuer and times in the Worker on all routes, before reading bindings. Missing settings or invalid tokens deny access. Disable workers.dev and version preview URLs; run the Worker before every static asset. Keep R2 private and serve only media referenced by eligible listings. Every response is noindex and private/no-store. An authenticated operator API for branding is not part of this release; staging branding is read-only.

Demo inquiries persist in the dedicated staging database and do not create CRM Contacts, schedule showings, or send messages. Tests use fictional contact information. A public production environment and the communications engine are separate releases, with separate resources and explicit publication/consent policies.

Cloudflare Access application creation was denied to the current Wrangler OAuth identity with HTTP 403. Deploying a closed Worker is safe; a usable private preview requires the account owner to provide the Access team domain and application AUD after configuring the owner-only Access application. Do not remove verification to get around this limitation.

## October 9, 2026: bounded production connection check

Following the owner’s report of OneKey approval, the search Worker now holds `MLS_GRID_ACCESS_TOKEN` as a Cloudflare secret. An operator-only `/ops/mls-grid` page verifies the approved production source through one bounded permission-field request. It requires the signed Access JWT email to match the configured owner in addition to the normal signature, issuer, audience and time checks. It does not import listings, download media, or enable scheduled replication. The synthetic search dataset remains separate. A production import adapter and source-specific display validation are still required before live publication.
