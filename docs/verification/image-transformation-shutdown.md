# Image transformation shutdown — November 15, 2026

The owner reported a current Cloudflare bill of $51.77 and explicitly requested stopping image transformations during testing. That amount is owner-reported account usage, not an independently audited Images-only charge.

Immediate containment: paused delivery of `prime-search-variants` with Wrangler, then fenced **15,599** pending, retrying or claimed D1 variant jobs as `paused` / `owner_paused_transformations`. Ready files and job history were preserved. The November attempt counter was **77,332** before and immediately after containment; counters were not reset or inflated to simulate a limit.

Persistent controls:

- Both search Worker configurations set `IMAGE_TRANSFORM_LIMIT=0`, have no Images binding and have no variant queue producer connection. The preview also removes the variant consumer.
- Missing/zero budgets default to disabled. Preparation returns `paused` before reading originals, reserving budget or calling Images. Old queue messages cannot claim new transformation work.
- Cron stops derivative warmup/cursor advancement. Gallery/cover completions and consumer reads do not enqueue new preparation. Ordinary listing synchronization and original photo downloads remain independent.
- Already-prepared images remain reusable; the preview falls back to retained originals when needed. Current listing/media eligibility checks remain in effect. The gated public configuration preserves its prepared-only size restriction.
- Paused jobs do not automatically resume next month. Any later activation needs a new owner-approved scope and budget, deliberate bindings and queue reconnection, and an explicit recovery decision.

Verification: **566 tests / 73 suites**, Workspace and both search typechecks, Workspace build and production search asset build passed. Regression tests cover a zero limit despite a mocked Images binding, calendar rollover, cached derivative reuse, absence of new jobs/reservations and continued original photo imports. Read-only independent review found no blocking transformation or permission bypass. The existing Workspace bundle-size warning remains unrelated.

This stops new transformations from these search deployments. It does not erase accrued charges, cancel the account-wide Images subscription, or stop other Cloudflare compute/storage usage. No unrelated Cloudflare services were changed.
