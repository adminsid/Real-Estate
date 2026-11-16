# Listing card photo totals — 2026-11-15

Cards now show the listing's current public photo total rather than the number
of successfully downloaded originals. Search summaries still return one cover.

The total counts all entries in the current permission-filtered manifest,
including pending and failed downloads. A newer core record cannot reuse a stale
manifest's count. While its manifest is pending, a validated MLS `PhotosCount`
can supply the total. Unknown totals remain unknown; confirmed empty manifests
return zero. Consumer responses expose one resolved `photoCount` instead of two
potentially conflicting fields.

The count appears on initial server HTML, embedded results, normal cards and
photo highlights. Card navigation or download failure does not replace the total
with the number loaded. Metadata is aggregated for only the requested listing
IDs using the existing parent index; no photo download, feed request, database
migration or paid transformation is added.

Live read-only metadata check, eight NYC active residential results:

| Listing | Public photo total | Imported |
| --- | ---: | ---: |
| KEY418194503 | 50 | 3 |
| KEY418194691 | 36 | 36 |
| KEY424235539 | 19 | 1 |
| KEY424934181 | 33 | 1 |
| KEY427310781 | 1 | 1 |
| KEY427371770 | 2 | 1 |
| KEY427623303 | 14 | 1 |
| KEY427667307 | 38 | 1 |

This bounded verification query read 622 rows, wrote none and took 7.65 ms in D1.
That is a database query measurement, not an end-to-end search latency claim.

Verification: 586 tests / 76 suites passed, root and search typechecks passed,
root build and production search asset build passed. Independent review covered
public/private totals, initial HTML and highlights. Tests cover partial imports,
failed downloads, duplicates/private entries, stale manifests, photo removal,
MLS count validation, unknown versus zero and initial/embedded HTML.

Deployed to private preview Worker `prime-property-search-staging`, version
`2540132c-3fcc-4ea5-8a0f-f44ecfb5a2ae`. Paid transformations remain disabled;
public release settings are unchanged.
