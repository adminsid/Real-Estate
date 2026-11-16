# OneKey Member media check

October 26, 2026. Private preview deployment: `31220c9f-b6ac-4ade-873e-fcf21d4b1679`.

The owner-only `/ops/mls-members` diagnostic uses the existing Cloudflare-held credential and sends one request to the production Member resource with `OriginatingSystemName eq 'onekey2' and MlgCanView eq true`, `$expand=Media` and `$top=10`. It never follows pagination, downloads image bytes, imports members, or returns raw member records. Responses are limited to 1MiB and 10 members. Only controlled aggregate counts and boolean error classifications reach the browser; names, contacts, identifiers, signed URLs and raw errors are excluded.

Live result at 2026-10-26T12:23:06.197Z (8:23AM America/New_York):
- HTTP200; Member access verified.
- 10 sampled members; all 10 had identifiers and IDX permission.
- 0 sampled members contained media; 0 public media entries.

This establishes access and absence of media in the sample only. It does not establish that every OneKey member lacks a photo. The initial request included an optional `$select` and returned HTTP400. The minimal documented request without that selection succeeded. Exact unsupported field was not established.

The route uses existing owner-only Access JWT validation, same-origin POST protection, replication lease, pacing and request/byte budgets. GET and HEAD perform no provider request. A manual check consumes a conservative response-byte reservation; it is not a background importer. No access policies, public release gates, production Worker deployment or database schema were changed for this diagnostic.

Validation: 512 tests in 67 suites, Workspace and both Worker typechecks, Workspace and production search builds passed. Existing Workspace bundle-size warning remains. Independent review found no Required/Critical issues; the reviewer independently ran the three Member tests. Live browser verified the owner session and actual HTTP200 aggregate result. Screenshot: `/private/tmp/onekey-member-feed-result.jpg`.

Deployment used an isolated copy of committed `24f9595` plus the Member-check files. The unrelated, unfinished smart-import edits, migrations0005/0006, and 96-attempt/concurrency settings were excluded. Previously applied migration0005 remains in the live database; this check did not apply migrations. Existing importer reconciliation remains unresolved.

Reference: https://docs.mlsgrid.com/api-documentation/api-version-2.0.md#resource-naming
