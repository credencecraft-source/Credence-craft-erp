# Master Module Performance: Stages 1 and 2

## Scope and safety

- Stage 1 addressed dropdown interactions, loading feedback, cascades, quick-create, and duplicate submissions.
- Stage 2 (points 11–20) optimized repeated dropdown option matching and dependent-option filtering.
- No Prisma schema or migration changes were made for either stage.
- Existing business rules, lookup matching precedence, source ordering, and unknown-value fallback are preserved.
- The detailed original labels for points 11–20 were not available in the active context; Stage 2 was implemented as the remaining lookup-indexing work in the original dropdown/render optimization scope.

## Stage 1: completed work

1. Added visible pending feedback to navigation actions.
2. Cancelled stale lookup requests so older responses cannot replace newer selections.
3. Prevented rapid repeat submissions from creating duplicate quick-create records.
4. Loaded independent server-side lookup data concurrently.
5. Stabilized report and lookup props to avoid unnecessary child renders.
6. Cleared dependent fields recursively when a parent selection changes.
7. Added Article quick-create lookup loading, nested return-selection, and lookup refresh/merge behavior.
8. Kept the selected newly created option available to its caller.

## Stage 2: completed work

1. Indexed option IDs, value IDs, labels, and normalized labels once per options-array instance.
2. Indexed child options by both supported parent identifiers.
3. Used `WeakMap` caching so obsolete option arrays can be garbage-collected.
4. Reused indexes for selection resolution, label lookup, and dependent filtering.
5. Preserved first-match/source-order behavior, case-insensitive label fallback, and deduplication where both parent keys match.
6. Returned a mutable copy for the no-parent case to preserve the existing `T[]` API contract.
7. Added regression tests for matching precedence, ordering, duplicate prevention, and cache invalidation when arrays are replaced.

## End-to-end verification

- Stage 1 browser checks exercised nested quick-create selection, duplicate-save blocking, and reload persistence of a created lookup record in the user-confirmed non-production environment.
- Stage 1 full QA passed: production dependency audit reported zero vulnerabilities; 155 test files and 1,072 tests passed; typecheck and production build passed; ESLint reported zero errors and three existing warnings in the master-import job report page.
- Stage 2 focused selection tests passed: 11 tests.
- Stage 2 focused route/selection/quick-create checks passed: 21 tests.
- Stage 2 targeted ESLint and TypeScript checks passed after resolving a readonly-array return mismatch.
- Stage 2 browser checks confirmed category-dependent subcategory filtering, descendant reset on category change, and lookup availability after reload without creating or modifying a record.
- The read-only Prisma migration-status check reported the database schema up to date. No migration was applied.
- Stage 2 full `npm run qa` passed: audit found zero production vulnerabilities; 155 test files and 1,075 tests passed; ESLint had zero errors and three warnings; TypeScript and the production build passed.
- After the production build, the local server restarted and the public page responded; its browser console showed an unrelated third-party RSA encryption error on the sign-in page.

## Files and behavior surfaces

- `lib/master-data/master-data-selection.ts`: cached option indexes and indexed dependent filtering.
- `lib/master-data/master-data-selection.test.ts`: selection, cascade, ordering, deduplication, and cache-invalidation regression coverage.
- Stage 1 also touched quick-create, lookup loading, editor/table, and navigation surfaces; unrelated existing worktree changes were left untouched.

## Data and workflow impact

- No existing database rows were changed or deleted by Stage 2.
- The Stage 1 lookup persistence check intentionally created one test record in the user-confirmed non-production environment; it remained present after reload and was not deleted.
- No schema migration or business workflow change was introduced by Stage 2.

## Points 21–100: current verified optimization tranche

- Reduced Master Module reads to required columns while retaining tenant, dummy-data, lookup, and display behavior.
- Hydrated lookup labels with narrow ID/value-ID/label projections.
- Reused one active dummy-batch lookup across order lookup, process-template, Size Group, workbook, Article-order, and editor fanouts.
- Loaded process-template relations concurrently and grouped/sorted related operations once.
- Loaded Article variants and sizes concurrently and removed repeated per-row lookup hydration work.
- Kept API response keys, ordering, cascade behavior, and selected-option results covered by regression tests.
- This is a verified tranche, not a claim that all 80 remaining plan items are complete; the original point-by-point wording is unavailable in this session.
- No comparative performance benchmark was run, so no percentage improvement is claimed.

## Points 21–25: dropdown and rendering optimization

- **21. Selection work:** Reuse ID/value-ID/label indexes for selection resolution; the index remains tied to immutable source-array identity.
- **22. Render isolation:** Memoize the shared single-value lookup control and reuse its mapped native option list, avoiding control rerenders when unrelated form fields change.
- **23. Cascade work:** Cache filtered child options for unchanged parent/child arrays and selections; merge dual parent-ID buckets linearly in original source order without sorting or duplicates.
- **24. Large catalogs:** Regression coverage filters 20,000 synthetic child options, verifies ordering and dual-ID deduplication, and confirms repeated calls reuse the result. Browser smoke testing changed the parent lookup repeatedly, edited another field, verified selection retention, and canceled without saving.
- **25. Measurements:** A local 20,000-option microbenchmark over 200 repeated filters measured 7.1001 ms/call for the prior map-and-sort path and 0.0005 ms/call for the warm cached path. This is a synthetic lookup microbenchmark, not a production or full-form benchmark. In the browser, ten change-to-next-frame samples on the current five-option form had a 12.9 ms median; no comparable pre-change browser baseline was captured.

## Points 21–25: final confirmed QA attempt

- Focused suites passed: 5 files, 76 tests; ESLint, TypeScript, and `git diff --check` passed.
- Production build completed successfully.
- The full QA script could not complete the production dependency audit because the npm advisory endpoint was unavailable (`ENOTFOUND registry.npmjs.org`).
- Running the full test suite separately yielded 1,083 passing tests and one failure in `master-import-service.test.ts`; its expiry fixture is dated at midnight on 2026-10-15, earlier than the current test run. This is outside the dropdown files changed here.
- Full-project ESLint completed with zero errors and three warnings in the master-import job report page.
- Read-only migration status remained current; no migration or data write was performed.
- The local app was restarted after the build and the authenticated Subcategory Master Module route loaded successfully.

## Current tranche verification

- Focused Master Module/API/workbook/order tests passed.
- Full `npm run qa` passed: 155 test files and 1,081 tests; zero production dependency vulnerabilities; strict TypeScript and production build passed.
- ESLint reported zero errors and three warnings in the existing master-import job report page.
- Browser reload confirmed the Article form and lookup options rendered; changing Category reset Subcategory correctly.
- The authenticated order-lookups API returned HTTP 200 with the expected lookup keys, Size Groups, and Article variant/size shape.
- The read-only migration-status check reported the schema up to date. This tranche made no schema or migration changes and performed no database writes.

## QA follow-up: deterministic expiry fixture

- Replaced the import-plan test's fixed expiry date with a relative future timestamp and added explicit expired-job coverage.
- The first full QA retry exposed malformed generated `.next/dev/types/validator.ts` content after the development server stopped. Restarting Next.js regenerated the route types; strict TypeScript then passed.
- The final sequential `npm run qa` passed: production audit found zero vulnerabilities; 155 test files and 1,085 tests passed; TypeScript and production build passed.
- ESLint completed with zero errors and three warnings in the existing master-import job report page.
- The authenticated Subcategory Master Module route reloaded successfully with HTTP 200 after restarting the local server.
- Read-only migration status reported all 153 migrations applied. No schema changes, migrations, or database writes were performed.

## Points 21–25: remaining dropdown profiling and cascade work

- Added a memoized quick-create lookup control. It keeps its selected string-array identity when unchanged, so unrelated quick-create field edits do not rerender that select.
- Reworked dependent-field clearing from repeated whole-list scans to a single indexed breadth-first traversal. A 5,000-field reverse-ordered dependency chain and the existing cycle/branch cases pass.
- Added a repeatable Vitest benchmark comparing legacy linear selection/filtering and repeated cascade scans with indexed lookups, cached cascade filtering, and breadth-first clearing.
- In the 20,000-option benchmark, the previous linear resolver averaged 1.0188 ms and the warm indexed resolver averaged 0.0003 ms; the previous full filter averaged 1.3874 ms and cached parent filtering averaged 0.0003 ms. Cached values are below ordinary timer resolution; these are microbenchmarks, not UI latency claims.
- In the synthetic 1,000-field reverse-order cascade benchmark, repeated full scans averaged 54.9338 ms and the new traversal averaged 0.6478 ms (approximately 85x faster in this run). This deliberately stresses an unusually deep dependency chain.
- Captured 30 browser change-to-animation-frame samples on the existing six-option Subcategory form: before median 16.55 ms / maximum 21.4 ms; after median 20.5 ms, with alternating near-one-second intervals consistent with background-tab frame throttling. These samples are not a reliable apples-to-apples UI latency result and do not demonstrate a form-level improvement.
- The Subcategory create form was opened, its category selection changed repeatedly, and it was canceled without saving; the existing report rows remained visible.
- Fixed the Article Variant lookup selection to omit `legacy_metadata`, which is not present in either the existing Prisma model or its table migration; other master lookups retain their legacy metadata filtering.
- Added regression coverage for both regular and indexed Article Variant lookups. The focused master-data suites pass (62 tests); changed-file ESLint and strict TypeScript pass.
- Browser verification now loads the Article create form and opens/closes its Brand quick-create dialog. Category selection filtered Subcategory options from seven available values to the matching one. The form was reloaded; no record was saved.
- Final `npm run qa` passed: production audit found zero vulnerabilities, all 155 test files and 1,088 tests passed, ESLint had zero errors and three existing warnings, strict TypeScript passed, and the production build completed.
- Read-only migration status reports all 153 migrations applied. No migration is needed for this fix; no schema edits, migration writes, or other database writes were performed for this tranche.

## Steps 26–50: database query execution and Prisma lookup speed

- **26. Inventory:** Traced Master Module editor, Article editor, workbook/API lookup callers, `getMasterValuesForOrganization`, Size Group link reads, and the order-lookups route. The main paths already use the shared Prisma singleton.
- **27. Baseline:** Authenticated order-lookups requests returned 200 with stable response shapes. The earlier five-key API call showed a 2.06-second lookup phase. After overlapping dependent reads, three five-key samples showed 0.57–1.35 seconds in that phase; remote-runtime variance means this is directional, not a production SLO claim.
- **28. Query plans:** Corrected the profiling tenant key: route organization IDs are public IDs, while master queries require the authorized internal ID. Read-only `EXPLAIN ANALYZE` then showed 0.047 ms Category, 0.046 ms Subcategory, and 0.137 ms Size Group link execution, with 5, 8, and 84 rows respectively.
- **29. Column projection:** Preserved the existing narrow master lookup selections; Size Group links select only required link and size fields. Dummy-reference validation selects only labels and compares via a Set.
- **30. Relations:** Root cause: Master Module GET authorization fetched full platform-version and ERP-software/module relations although lookup responses only need the internal organization ID. GET now uses the existing membership-scoped `getOrganizationShellContext`; POST behavior is unchanged.
- **31. Per-row queries:** No per-row relation query loop was found. Article variant and size reads remain batched by Article IDs and now overlap lookup-label hydration instead of waiting for it.
- **32. Dependent reads:** Lookup labels are grouped by referenced module, and order-lookups shares one active dummy-batch promise. Size Group link reads now start as soon as Size Group rows arrive, concurrently with the other requested lookup lists.
- **33. Database filtering:** Organization, active state, search, entity, Article code, and requested parent filters remain database-side where supported.
- **34. Tenant isolation:** Organization context resolves the public route ID through an active membership query; subsequent master reads use the returned internal organization ID. The corrected plans verified actual tenant rows.
- **35. Counts:** No unused lookup count query was identified; none was added.
- **36. Bounds:** API caps remain 200 general / 500 order lookup; service cap remains 500. Existing behavior is preserved.
- **37. Ordering:** Existing stable sort fields and Size Group link order are retained; grouping remains one-pass and response order is unchanged.
- **38. Pagination:** No cursor pagination was added because bounded lookup limits and current response contracts are relied upon by forms.
- **39. Labels:** Relation hydration uses required identifiers and display labels; Article Variant Color projection stays narrow.
- **40. Duplicate reads:** Shared dummy-batch resolution and batched lookup-label maps remain in place; no duplicate count or per-row fetch was found in these paths.
- **41. Transactions:** Read-only lookup calls remain outside write transactions.
- **42. Network-in-transaction:** No reviewed lookup transaction spans network work; no transaction semantics changed.
- **43. Hydration:** Article details load in parallel and group once per Article; process-template relations load in parallel and are grouped once.
- **44. Index review:** Query plans used sequential scans and in-memory sort, but only for 5/8/84 matching rows; execution stayed below 0.14 ms.
- **45. Schema/index constraint:** No index, schema, migration, or data change was made for Steps 26–50. Composite sort indexes remain optional only if realistic larger-tenant plans justify them.
- **46. Pool check:** Five concurrent authenticated Category GETs succeeded in two read-only bursts (all HTTP 200; 2.76–3.09 seconds aggregate). Sixteen `pg_stat_activity` samples saw at most three sessions; observed states were active and idle/ClientRead, with no lock or I/O wait. Prisma client-side queue-wait telemetry is not exposed, so no pool-exhaustion claim is made.
- **47. Client lifecycle:** Confirmed the application uses the global Prisma singleton; no per-request Prisma client is created.
- **48. Serialization:** Added development-only `Server-Timing` phases (`organization`, `lookup`, `json`, `total`); response bodies are unchanged and production responses receive no timing header. For a 45 KB five-key response, JSON serialization was 1.7 ms and client parsing 0.7 ms. After overlapping dependent reads, 45 KB five-key responses showed 0.9–2.9 ms JSON serialization and 0.57–1.35 seconds in lookup work. The lookup phase still combines database round trips and in-memory hydration.
- **49. Correctness:** Added regression coverage that GET uses the lean membership resolver, rejects unresolved memberships before querying masters, starts Size Group links before unrelated lookups finish, overlaps Article details with label hydration, and omits development timing headers in tests. Browser exercised repeated Subcategory category selections, canceled without saving, reloaded, and confirmed all eight records remained.
- **50. Benchmark:** Re-ran the synthetic 20,000-option/1,000-field Vitest benchmark: mean linear/indexed resolution 1.3147/0.0009 ms; full/cached filtering 4.3190/0.0038 ms; repeated-scan/one-pass cascade 177.70/1.1935 ms. These are algorithm microbenchmarks, not PostgreSQL or production latency.
- **Focused validation:** 59 tests passed across Prisma, lookup route, and lookup service suites; changed-file ESLint, strict TypeScript, and `git diff --check` passed.
- **Final full QA:** `npm run qa` passed after all changes: production audit found zero vulnerabilities; 155 test files and 1,093 tests passed; ESLint had zero errors and three existing warnings in the master-import job report page; strict TypeScript and production build passed.
- **Runtime and migration:** Post-build read-only migration preflight found all 153 migrations applied. Authenticated Subcategory page and Category lookup API returned HTTP 200 after reload; dropdown selection/cancel/reload preserved the existing record count.
- **Remaining bottleneck:** Multi-lookup service work still takes 0.57–1.35 seconds in the sampled five-key calls, while individual SQL execution plans and JSON serialization remain fast. Post-build authenticated Category API returned HTTP 200 with 5 rows and a 398 ms lookup phase. The multi-key service phase includes remote query round trips plus hydration; no per-statement RTT breakdown was available. No speculative cache, schema, or workflow change was introduced.
- **Per-query diagnostic:** Added opt-in local Prisma query duration logs. Set `ERP_LOOKUP_QUERY_TIMING=1` only in the local dev-server process to log Master/Organization model, Prisma operation, and elapsed milliseconds; parameters, SQL values, organization IDs, and result rows are not logged. This enables per-statement round-trip attribution without changing production behavior. The authenticated browser session was unavailable for collecting those traces in this follow-up.
- **Not applied without evidence:** No cross-request cache was added because master records change through many CRUD/import/quick-create paths and a missed invalidation could show stale ERP choices. No pool, database-host, or hosting-region setting was changed; current session samples showed no saturation, and deployment/database geography requires verified infrastructure metadata. No index or migration was added because the measured plans returned tiny row counts in under 0.14 ms.
- **Latest validation and local runtime:** The final full-suite retry completed 155 test files and 1,093 tests; audit reported zero vulnerabilities; lint had zero errors and three existing warnings; strict TypeScript passed. The production-build phase was interrupted before completion, then `npm run build` was run independently and exited successfully. `ERR_CONNECTION_REFUSED` occurred because the dev server was stopped for the Windows production build and had not yet been restarted; the read-only migration preflight passed (153/153), the server was restarted with opt-in local query timing, and `http://localhost:3000/` now returns HTTP 200.

## Steps 51–100: API, React, and runtime follow-up

- **API response payload:** Added opt-in `shape=compact` to `order-lookups`. It returns `masterOptions` and `orderLookups` without duplicate top-level aliases; the default response remains backward-compatible.
- **Compact response callers:** Updated the Article order dialog, merchandising order details, and bulk-order creation lookup fetches. All call sites found in the application were updated; route tests confirm compact data matches the default core data and is smaller.
- **Authenticated payload comparison:** From the Article order dialog's signed-in organization session, compared default and compact five-key responses: HTTP 200 for both; default 45,163 bytes, compact 23,124 bytes (48.8% smaller); `masterOptions` and `orderLookups` matched exactly. The compact response retained 18 Size Groups and their sizes. The tenant had no active Article options, so Article selection itself could not be exercised.
- **React report indexing:** Replaced action-cell rendering as a source of report search text with direct values matching displayed built-in fields; custom fields continue through the existing formatter. For 500 rows, the old indexing pass created 1,500 action-cell React elements for ordinary modules (2,000 for Article/Gold Seal); the new path creates none for indexing. This is an allocation-count comparison, not a UI-latency claim.
- **React regression coverage and browser check:** Three focused tests cover built-in display values, custom-field fallback, and status text. In the authenticated Category Master report, searched `KURTI` (five rows to one), cleared search (back to five), selected Finished Goods in the add form, confirmed text normalization to uppercase, and canceled without saving.
- **Next.js/runtime review:** Reviewed the existing Next configuration and request proxy for evidence-based server/build changes; no measured issue justified modifying them. No framework configuration or deployment setting was changed.
- **QA:** The first `npm run qa` build attempt hit a transient Windows Prisma engine rename `EPERM`. After the local dev server was stopped and stale generated temp files were cleared, a complete `npm run qa` rerun passed: production audit found zero vulnerabilities; 156 test files / 1,097 tests passed; lint had zero errors and three existing warnings; strict TypeScript and production build passed.
- **Runtime and database safety:** Read-only migration status reported all 153 migrations applied. No schema/migration changes or database writes were made for Steps 51–100. Authenticated order and Category Master routes returned HTTP 200; the local root also returned HTTP 200.
- **Transient database reachability:** One profiling interval returned database-unavailable responses from the connected remote database. The subsequent read-only migration preflight succeeded, the local app restarted, and authenticated pages/lookups returned HTTP 200 again; no database settings were changed.
- **Measured remaining latency:** An authenticated compact order-lookup request returned HTTP 200 with 23,124 bytes. Three warm samples reported server `lookup` phases of 857–1,296 ms and `json` phases below 1 ms; `organization` resolution ranged 117–418 ms. A local-only Prisma trace on a Category lookup showed Organization membership (113 ms), active dummy-batch lookup (211 ms), Category rows (379 ms), and related Product labels (211 ms). These are local app / connected database observations, not production guarantees.
- **Dependent lookup overlap:** The order-lookup trace showed Size Group rows completing before a 418 ms Brand-label lookup, followed by a 798 ms Size Group-size query. Added an `onRowsFetched` hook so the tenant-scoped Size Group-size query starts concurrently with label hydration; returned values and filters are unchanged. In a post-change trace, Brand-label hydration (179 ms) and Size Group sizes (570 ms) ran concurrently after the group rows (339 ms).
- **Post-change timing caveat:** Authenticated `Server-Timing` lookup samples varied from 1.11–1.61 seconds; one earlier sample was 1.83 seconds. This is consistent with the dependency overlap reducing serial work, but the small, remote-DB sample is not a controlled benchmark or production guarantee.
- **Regression and QA after overlap change:** Focused route/service suites pass (61 tests); changed-file ESLint and strict TypeScript pass. Full `npm run qa` passed: production audit found zero vulnerabilities; 156 test files / 1,098 tests passed; lint had zero errors and three existing warnings; typecheck and production build passed.
- **Next.js cold/warm distinction:** The first local organization-page request paid development compilation cost; warm requests were faster. Production build passed in QA, and no production Next.js/Vercel configuration change was justified by this development-only evidence.
- **Scope caveat:** The exact original numbered descriptions for Steps 51–100 were not available in the active history. This records concrete work against the preserved API/network, React state/memory, and Next.js/runtime headings; it cannot substantiate completion of every unavailable numbered item.
- **Remaining work:** Remote database round trips still dominate warm multi-lookup requests, with variable per-call Prisma durations. No cache, pool/region, or schema change was made because safe invalidation, deployment geography, and production behavior are not established. The original one-by-one Step 51–100 checklist must be recovered to certify completion item by item.

## Follow-up implementation and validation: 2026-10-15

- Preserved the first matching Article-order option when duplicate labels or codes exist. The prior map construction overwrote earlier options, unlike the original first-match array lookup; a regression test reproduced and now prevents that behavior change.
- Made the Article-order option-index helpers generic so Article-specific `variants` and `sizes` remain available in strict TypeScript.
- Reused the existing Master Module field-key index to resolve each dependent lookup's parent definition, avoiding a repeated linear field scan during form rendering.
- Focused lookup/cascade tests passed (19 tests); changed-file ESLint and strict TypeScript passed.
- Full `npm run qa` passed after these changes: production dependency audit found zero vulnerabilities; 157 test files and 1,104 tests passed; strict TypeScript and production build passed; ESLint had zero errors and three warnings in the existing master-import job report page.
- Read-only migration status found all 153 migrations applied. No schema edit, migration, or database write was needed or performed.
- Authenticated production-mode local browser checks loaded Category Master, Subcategory Master, and Article creation routes with HTTP 200. The Article form exposed real Brand, Category, Subcategory, and Size Group options.
- Repeated Category changes in the Article create form switched the dependent Subcategory options correctly and cleared the prior child selection. A follow-up ten-change run recorded event-to-next-frame samples in the low single-digit milliseconds; these are local browser samples, not production SLO measurements. The form was canceled without submitting, and no organization API write request was observed during selection.
- The Article report still showed zero records after reload; Article create itself could not be validated because this organization has no active Article records. Existing Subcategory records remained available; no business data was written.
- Three warm public-root navigation response intervals were approximately 459, 175, and 224 ms after a cold development compilation around 10 seconds. These are sign-in/development measurements, not authenticated Master Module or production timings. A third-party mobile-OTP script logged an RSA `OperationError` on the sign-in route; it did not prevent authenticated module-route verification and was not changed as part of this performance work.
- The exact historical descriptions for all original 100 points remain unavailable. Checklist items requiring authenticated workflows, controlled concurrency, connection-pool telemetry, bundle/memory profiling, or realistic larger-tenant plans remain open or blocked; this follow-up does not claim the entire 100-point blueprint is complete.
