# GitHub preparation and staging audit — October 8, 2026

The local projects were not fully represented on their default GitHub branches. This audit prepares review branches for the current source and tests; it does not approve merging the entire backlog or deploying the professional applications.

## Repository state before preparation

| Project | GitHub repository | Visibility | Commits ahead / behind main | Prepared branch |
| --- | --- | --- | --- | --- |
| Workspace and consumer search | adminsid/Real-Estate | Public | 5 / 0 | codex/workspace-audit-search-staging |
| Listing Input | adminsid/listing-input | Private | 4 / 0 | codex/listing-input-audit |
| Open House | adminsid/open-house | Public | 17 / 0 | codex/open-house-audit |
| Brand Hub | adminsid/prime-america-hub | Private | 0 / 0 | codex/brand-hub-audit |

These counts follow a fresh fetch, before the new snapshot commits. There were also uncommitted source, tests, specifications and migrations in every repository. None of the existing source work was reset or discarded. Draft review branches preserve these changes separately from main.

## Validation

| Project | Tests | Type check | Production build |
| --- | --- | --- | --- |
| Workspace | 64 files / 483 tests passed | Passed | Passed; existing large-chunk warning |
| Listing Input | 10 files / 62 tests passed | Passed | No build script declared |
| Open House | 14 files / 158 tests passed | Passed | No build script declared |
| Brand Hub | 5 files / 34 tests passed | Passed | Passed |

Total: **737 tests passed**. The search Worker also passes its dedicated type check and deployment dry run. New integration tests cover native Access signature validation and rejection, all-route denial before binding reads, D1 search parameter limits, withheld addresses/captions, unavailable listing/media behavior, and demo inquiry persistence with origin/body limits. Tests run locally; GitHub CI results must be verified separately. The Workspace workflow now validates the build, tests and search adapter without holding deployment credentials or deploying automatically.

## Publication hygiene

Audited candidate source files and added lines of commits outside origin/main for credential assignment patterns and matches against available local secret values. No matching local secret was detected. Literal candidates were test fixtures or dynamic browser variables, not embedded credentials. This is a targeted credential check, not a guarantee that every historical secret or vulnerability has been found.

Local MLS databases, inquiries, imported photographs, .dev.vars variants, .env files, Wrangler state, generated staging assets/fixtures, scratch files, operating-system metadata and Hub temporary exports/screenshots are excluded. Ignore rules were strengthened in all four projects. No local credential file or MLS export belongs in these review branches.

## Search deployment

Only `prime-property-search-staging` was deployed. Version: `46a5a5c3-725e-477f-b623-4da23e9af95e`. Host: `https://preview-search.primeamericany.com`.

The dedicated D1 database contains 60 explicitly fictional listings, 120 listing-media references to two synthetic SVG illustrations, and zero demo inquiries at verification. The dedicated R2 bucket remains private. No binding targets the Workspace database or its operational services. No MLS token, MLS record or MLS photograph was uploaded. This staging dataset is for verifying infrastructure, not representing market inventory.

Anonymous requests return HTTP 403; pages, assets, APIs and media also reject forged assertions. Worker responses set private/no-store and noindex/nofollow. Workers.dev and version preview URLs are disabled. Access application creation returned HTTP 403 with the current Wrangler identity. The team-domain and application-AUD configuration remains empty, so the deployed site is closed to everyone until the account owner completes the setup described in [the staging runbook](search-staging-runbook.md). Authenticated remote browsing has not yet been verified.

## Release limitations

- The backlog spans auth, permissions, CRM, operations, transactions, commissions, inventory, branding and consumer search. Passing suites are useful evidence, but this preparation is not a full manual review of every changed line. Draft PRs are review/backup artifacts.
- Operational Workspace staging bindings, service dependencies and deployment commands require a separate environment audit. The generic Workspace deployment command must not be used as a substitute for the explicit search config.
- Pending migrations include duplicate numeric prefixes in the existing Workspace backlog. Their applied production state, ordering, rollback and cross-application compatibility have not been verified. No operational database migration was applied by this staging task.
- Auth authority cutover, production brokerage communications and the linked satellite rollout require separate verification. No Workspace, Listing Input, Open House or Brand Hub deployment was performed.
- Licensed MLS replication, freshness/removal processing in the Cloudflare adapter, remote branding administration and public IDX display remain pending. The staging Worker deliberately rejects production/non-synthetic configuration.
- Live remote authenticated search, gallery and inquiry checks await Access setup. Until then, continue visual work through the existing local preview.

## Next actions

Complete Access configuration, verify the private deployed preview, and continue page-by-page design work against local and staging builds. Review the backlog in smaller feature groups before merging or releasing the professional applications. Keep public consumer launch separate from staging and contingent on the required MLS display permissions.
