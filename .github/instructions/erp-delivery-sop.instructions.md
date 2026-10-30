---
name: erp-delivery-sop
description: "Standard operating procedure for delivering secure, tenant-scoped, production-ready ERP changes."
applyTo: "**/*.{ts,tsx,prisma,sql,css,md}"
---

# ERP Delivery SOP

## 1. Route The Work

- Identify the concrete anchor: failing command, route, API handler, service, schema model, shared component, or neighboring test.
- First decide whether the request belongs inside an existing organization-level Master Module. Keep module-specific work inside that module and treat the home page, global shell, navigation, theme, and shared styling as protected surfaces unless the request explicitly expands scope.
- Read only the local call chain needed to identify the code that decides the behavior.
- Record one falsifiable hypothesis and one cheap discriminating check before the first edit.

## 1A. Mandatory Shared Branding And UI Rule

- This repository must maintain one unified branded UI language across the entire application. The same theme, colors, spacing, borders, shadows, icon treatment, and control styling must be used everywhere unless a shared component is intentionally extended.
- Do not create local or isolated visual differences for a screen, feature, or platform surface when the shared UI primitive already exists. If a non-branded UI pattern is found, fix it immediately.
- If the required branded element does not exist, create it in the shared design layer and reuse it across the application instead of injecting one-off custom styling.
- Keep the ERP brand consistent in every corner of the app, including organization-level pages, platform-level screens, and shared components. Use matching element classes, variants, icon style, and design semantics to achieve identical branding.
- Do not allow manual styling drift. A one-off green, card, tab, button, panel, input, badge, or status treatment is not acceptable when a shared component exists or should be created.
- Preserve and standardize on the same branded UI element set across the system: shared buttons, tabs, cards, sections, forms, tables, modals, filters, and status visuals.
- Every interactive dialog/popup must use the shared `Modal` in `components/ui/Modal.tsx`; do not add custom overlay/dialog shells. Use only `square` (40rem × 40rem) for compact forms or `rectangle` (72rem × 54rem) for wider forms, chosen by the fields and workflow. The shared component adapts to the viewport and keeps overflow scrollable. Caller classes may tune content layout, but must not override the shell or canonical size. Full-page print-preview workspaces that must produce print-page output may remain full-screen as explicit exceptions; do not use this exception for ordinary forms. Existing legacy size values are compatibility aliases; new code must use `square` or `rectangle`.
- Popup speed is a required acceptance criterion for every new or materially changed popup, not a one-time review of the shared component. Inspect each popup separately, including all lookups, dependent fields, validation, and submit behavior. Render the shell and usable static fields immediately; do not hold the form behind network lookups. Load popup-only data on demand, parallelize independent requests, request minimal fields, and use bounded/paginated or debounced search rather than fetching unbounded catalogs. Keep dependent lookups lazy, prevent duplicate or stale requests, and use organization-scoped caching with explicit invalidation only where appropriate. Provide visible loading, empty, error/retry, and disabled states.
- Measure and record popup open-to-visible, open-to-first-usable-field, lookup latency and payload, and render behavior with representative data. Target first usable UI in the initial render and lookup results within 500 ms p95 in the documented local/test environment. If a dependency misses that target, profile and optimize it or clearly report the measured external/backend blocker; never mask latency with an indefinite spinner or fabricated success. Add focused regression coverage for the relevant request/state transitions, bounded results, dependent fields, and repeated open/close behavior. Browser-check the changed popup under normal, slow/failing, and empty lookup conditions; verify keyboard access, responsive fit, and that repeated openings do not duplicate requests or unintended writes. Handoff must list the results and remaining latency separately for each popup changed.
- Before changing any UI, layout, style, design token, or shared component, read and apply the repository-level `AGENTS.md` section "UI Architecture Laws." It governs shell boundaries, content-only padding, scroll containment, canonical color/status/typography tokens, reusable components, and destructive actions across the entire application.
- Treat those laws as durable project constraints, not suggestions. Do not modify or bypass them during unrelated work. A deliberate design-system revision requires explicit product-owner approval and an update to `AGENTS.md`.
- If implementation reality conflicts with the locked token or shared-component rules, do not invent local styles or silently change the global theme; report the specific conflict and request an approved design-system update.

## 1B. Organization Application Performance Standard

- Review performance across the complete organization workflow, not only initial page load: module/sidebar switches, master list/detail/create/edit, report filtering/record opening, popup open/lookups, field typing, submit, cancel, edit, and delete.
- Before optimizing, state a falsifiable bottleneck hypothesis and capture a baseline using the same route, organization, dataset, browser, device profile, and cache condition.
- Use an approved non-production environment and representative synthetic or explicitly selected test records. Never profile by mutating production data or bulk-processing historical records.
- Measure interaction-to-feedback, time to first usable UI, rendering, request count/duration/payload, server/service time, and database query count/duration separately. Do not infer database latency from total page time.
- For repeatable automated measurements, collect at least 30 samples and report p50/p95, sample count, cold/warm condition, and environment. For smaller manual samples, report raw observations and sample count; do not label them p95.
- Keep user input responsive: render local acknowledgement immediately, avoid blocking keystrokes on network work, debounce bounded searches, cancel stale requests, and prevent duplicate submissions.
- Keep route and detail shells usable while data loads; paginate large lists, select only required fields, avoid N+1 reads, and defer heavy editors, exports, charts, or print code until needed.
- Popup-specific acceptance remains governed by section 1A: usable static fields render immediately and lookup results target under 500 ms p95 in the documented environment.
- Define and record approved budgets before work. In the absence of an established service-level objective, compare before/after on the same environment and do not claim an absolute speed target was met.
- Use browser performance marks/traces and network inspection for the changed workflow; tests and static source inspection identify risks but do not prove user-perceived speed.
- Fix one confirmed bottleneck at a time, add focused regression coverage, and rerun the same measurement after the fix. Preserve tenant authorization, permission checks, lifecycle rules, auditability, and data integrity.
- Handoff must list the exact interaction tested, baseline and result, test conditions/sample size, checks run, unresolved bottlenecks, and any browser/runtime verification that was unavailable.

## 1C. Organization Master Record UI Standard

### Required behavior

- The organization `admin/master-data` hub, its category cards, individual master reports, and record forms are one coherent Master Module surface. Keep the existing Admin > Masters entry, category hierarchy, module registry, organization authorization, and branded shared UI; do not redesign the global shell or create parallel master registries.
- Primary create and edit workflows for master records must be dedicated, full-page, organization-scoped routes, not modal/popup forms. Use the existing Article create/detail experience as the UX reference: a descriptive record title, stable human-readable record URL where the master has a business code, explicit save/cancel/navigation states, and a compact shared tab row when the form has independently meaningful sections. Simple forms stay a single page without artificial tabs. Keep inline validation and server actions/API behavior; successful save must show an explicit confirmation and retain/reach the canonical record URL.
- Preserve current route compatibility and established record identifiers. Prefer the existing `/<moduleKey>/create` and `/<moduleKey>/<recordCode>` convention when it fits the master; do not change code generation, identifiers, database shape, or deep links as part of a UI migration. For modules without a stable record code, use their existing tenant-scoped stable ID until an additive route alias can be justified. Resolve duplicate/ambiguous codes safely; never fetch a record by ID/code alone and authorize afterward.
- The shared registry (`MASTER_DEFINITIONS`) is the source of truth for standard master fields and module membership. Add section metadata to an existing definition only when needed to render real form sections consistently; prefer extending the current shared form pattern over bespoke per-master page implementations. Keep complex domain masters (Article, Size Group, Unified Contact) on their domain-owned forms while matching the same full-page route, tabs, loading/error, and save behavior.
- Saved master records use a view-first route: opening a row or its Open action navigates to a tenant-authorized, read-only detail page; an Edit action is placed in the page header and explicitly enters edit mode. Successful edits return to read-only detail. Create routes remain immediately editable. Do not expose edit inputs as the default record-detail state.
- Apply the same behavior to record-oriented organization reports: a row navigates to the record's authorized read-only detail route, with Edit in that page header only when editing is allowed. Keep aggregate, grouped, and summary rows non-navigable unless they represent a real record with a meaningful detail route. Never invent a detail endpoint or authorize a record after fetching it by an unscoped identifier.
- Apply the full-page standard to create, edit, and every workflow that is effectively a master create/edit form, including lookup “quick create.” If a nested workflow must resume its parent after saving a new lookup record, use an explicit, validated return URL/state and verify the return flow; do not silently retain an ordinary CRUD popup as an exception. Destructive confirmation dialogs and genuinely transient choice/confirmation dialogs remain dialogs, not record forms.

### Canonical organization master inventory (registry snapshot)

Derive the live list from `lib/master-data/master-data-registry.ts`; this inventory documents the current scope and must be reconciled against the registry before each migration cohort. Current `MASTER_DEFINITIONS` contains 52 registered definitions, including hidden/internal definitions that are not necessarily available as user-facing CRUD forms:

- **Merchandising (15):** Finished Goods Category, Finished Goods Subcategory, Brand, Buyer, Season, Article, Article Color Variant, Color, Size Group, Size, RM Category Type, Measurement Chart, Pre Order Checklist, Merchandiser, Order Volume.
- **Registry note:** Entity is stored in the merchandising definitions file but its registry metadata places it in Settings > General; it is listed under General below.
- **Procurement (6):** Vendor, GST, HSN Code, Currency Type, GST Type, State.
- **Factory pre-production (8):** Size Wise Consumption, Finished Goods Type, Process Master, Operation, Process Template, Operation Template, Process Template Step, Operation Template Step.
- **Inventory (6):** Stock UOM, UOM Convert, Raw Material, Raw Material Type, Raw Material Category, Raw Material Sub Category.
- **Factory production (1):** Production Setup.
- **Quality (2):** RM Quality Check, FG Quality Check.
- **Finance (5):** Sales Invoice, Purchase Invoice, Debit Note, Credit Note, Delivery Challan.
- **Distribution (3):** Delivery Partner, Sales Channel, Dispatch Status.
- **Design and Development (2):** Gold Seal, Gold Seal Variant.
- **General (4):** Entity, Status, Entity Type, Location.
- **Specialized organization master outside `MASTER_DEFINITIONS`:** Unified Contact Master (Customer/Vendor/Agent/Distributor/Dealer roles, tax registrations, addresses, and bank accounts). Organization Master Setup/import workflows are a separate multi-master workflow, not a single master record form.

Before changing routes or forms, re-read the registry and category definitions; hidden/system-owned definitions may be intentionally excluded from CRUD and must not be exposed merely to make the inventory count match.

Current implementation facts to carry into the baseline (these are code-path risks, not measured latency claims): standard visible masters now use dedicated `/<moduleKey>/create` and `/<moduleKey>/<value_id>` full-page routes backed by the shared registry-driven field renderer; list routes no longer preload all lookup catalogs, and form lookup requests are parallel, organization-scoped, capped at 200, and have loading/error/retry states. This improves the code path but does not establish a p95 latency result; measure it with representative tenant data. Article remains on its dedicated create/detail routes and General/Colour/Size tabs, but its server page still fetches six lookup lists with limits up to 500 plus size-group links before rendering. Size Group edit has a dedicated record page/editor. Unified Contact has dedicated list/new/detail routes and Contact/GST/Addresses/Bank tabs; its record detail fetches in a client effect. Keep these specialized form routes in the per-master audit, including remaining quick-create behavior, and do not declare any route fast until timings and representative payloads have been recorded.

### Safe phased rollout (do not mass-rewrite in one change)

1. **Inventory and baseline:** Build a route/form matrix from the registry plus custom routes. For every visible master, record current list/create/edit/detail routes, modal or dedicated-page behavior, field/section count, lookup dependencies, ownership, record volume, authorization boundary, and existing tests. Inspect all upstream lookup reads and submit handlers. Measure list-to-form navigation, route response/usable-field time, lookup request count/duration/payload, and save-to-confirmation time using representative small and large tenant datasets. Treat code-level concerns as hypotheses until measured; preserve a before/after baseline per master.
2. **Shared full-page form contract:** Define and test the common page frame, title/breadcrumb/back behavior, field grouping, responsive tabs, persistent footer/actions, unsaved-change handling where supported, validation/error/success feedback, and URL/cancel semantics using existing branded components. Keep single-section forms tab-free; use tabs only for genuine groups such as Article General/Colour/Size or Contact/Tax/Addresses/Bank. Ensure every tab is keyboard accessible and does not discard values when switched.
3. **Pilot and verify:** Pilot a standard simple master plus one complex master before cohort conversion. Use Article as the existing reference, but audit it rather than assuming it is optimal. Its current editor loads six lookup catalogs (up to 500 each) and all size-group links before the form is rendered; measure first and lookup payload/latency, then move nonessential or dependent data to on-demand bounded requests without delaying usable fields. Verify server actions, organization/workspace checks, field normalization, uniqueness/dependency checks, and persistence are unchanged.
4. **Migrate by business cohort:** Convert visible masters through the existing Admin master categories (Raw Material; Finished Goods; Process and Operations; Vendors and Contacts; Tax and GST; Sizes; Others). Keep specialized Article, Size Group, and Unified Contact behavior integrated with the same route and page contract. For lookup quick-create, prove that the parent form resumes with the created tenant-owned option selected and without duplicate requests or writes. Migrate one cohort at a time and use the focused checks below before advancing.
5. **Retire legacy form dialogs:** Only after route parity, deep-link compatibility, tests, browser checks, and user review pass for a cohort, remove its create/edit modal code. Retain only confirmation or transient-choice dialogs. Do not remove or repurpose the separate Organization Master Setup/import workflow without its own impact review.
6. **Upcoming masters:** Every newly registered visible master inherits this route-first page contract, is placed in the correct existing Admin master category, and gets the same registry-driven list/create/edit route, field/section definition, authorization, lookup performance review, regression tests, and browser acceptance before merge. New schema, migration, or data backfill is not implied by this UI plan and requires the separate DATA LOSS WARNING and explicit approval.

## 1D. Organization Record View/Edit Standard

- For existing organization records, keep the canonical record URL as a read-only detail page by default. Place Edit in the page header; entering edit mode must be explicit, and cancel returns to read-only detail without losing the record context. Saving returns to read-only detail with confirmation; validation/save failures must preserve a clear path back to editing.
- Report rows that represent individual records open that record's tenant-authorized read-only detail page. Reuse existing domain detail routes and preserve business actions and lifecycle controls. Add missing detail pages only as a reviewed module cohort with organization/workspace authorization, permission checks, and tenant-scoped reads.
- Do not make aggregate, matrix, grouped, summary, or client-only rows appear actionable when no safe record destination exists. Keep their existing report behavior and offer drill-down only when there is a meaningful, authorized target. Shared report grids must omit row-click behavior and clickable cursor styling when no destination exists; do not pass a no-op callback to simulate non-navigation.
- Migrate current forms and reports by domain cohort; do not mass-rewrite unrelated route implementations in one change. For every cohort inventory row actions and existing routes first, then add focused regression coverage for view/edit navigation, read-only state, authorization, save/cancel/error states, and browser verification. New record forms and report routes must follow this contract.

### Per-master performance and regression gate

- Target immediate route shell and first usable non-lookup field from the initial render; lookup results target under 500 ms p95 in the documented local/test environment. Record actual p50/p95, sample size, payload size, and environment. If the target is missed, profile the exact route/query/serialization/render path and fix it or report the measured dependency blocker; never conceal it with a full-form spinner, unbounded preload, or success-shaped fallback.
- Do not fetch lookup catalogs until the relevant form needs them; parallelize only independent requests, request only fields required for that form, and bound/page/debounce search. Load dependent options only after their parent selection, cancel/ignore stale responses, prevent duplicate submit/request actions, and cache only organization-scoped stable data with explicit invalidation. Validate all lookup IDs and dependent values server-side within the authorized organization.
- For every cohort, test direct URL load, refresh/back/forward, create, edit, invalid input, save success/failure, stale/deleted record, no lookup results, lookup failure/retry, slow lookup, parent/child dependency changes, narrow viewport, keyboard/tab navigation, and navigation away with unsaved changes. Verify persistence by reloading after successful save; never use live/production business data for destructive tests.
- Report the exact masters/routes exercised, measured load/lookup timings and sample context, tests run, known exceptions, and any unverified workflow. A successful shared-component test or one fast master does not certify the other masters.

## 1E. Organization Module Reports And Post-Submit Navigation

- Every new organization module and every materially reworked module report must use the shared `ReportGrid` in `components/reports/report-grid-display.tsx`, or an existing shared report pattern when its interaction model is unsuitable. Do not introduce a parallel, page-local table for ordinary records.
- Each report must provide a consistent title, responsive search, meaningful status/column filters, user-controlled column visibility, organization-scoped saved column preferences, locale-consistent value/date/quantity formatting, truthful loading/error/empty states, and keyboard-accessible actions. Keep report rows non-navigable unless they have a real tenant-authorized record destination; use explicit row actions for available operations and never a no-op row callback.
- For a module with multiple record categories/tabs, give each category its own report view and preserve the category's operational actions. Work-order/checklist detail can remain in an inline selected-record panel beneath its report.
- Do not leave a create form permanently stacked with its report. Enter create mode only after an explicit New/Create action, and provide a clear cancel/back-to-report action. Following successful submission, show confirmation and return to that record's owning report tab/list, where the newly saved record is visible. A failed submission must keep the user in the form with entered values and actionable error feedback. Do not redirect to an unrelated tab or clear a form before the save succeeds.
- Validate each tab's search, filters, column settings, responsive table region, empty/loading/error state, and row/action semantics. For create flows, test open, cancel, invalid submit, failed save preserving values, successful save returning to the correct report, and visibility/persistence of the saved row. Include these behaviors in focused regression and browser coverage.

## 2. Specify The Contract

- Define actor, workspace, organization, permission, input shape, response shape, lifecycle transition, and failure behavior.
- Identify tenant-owned records, source documents, dependent records, business keys, counters, money, tax, stock, and audit requirements.
- Decide whether the operation is read-only, reversible, transactional, idempotent, approval-controlled, or destructive.

## 2A. Mandatory DATA LOSS Warning Before Schema Or Migration Work

- Before editing `prisma/schema.prisma`, any `prisma/migrations/**` file, raw schema/data migration SQL, or migration/deployment script, stop and show the user a prominent `DATA LOSS WARNING` in plain language. Do not make the schema or migration edit first.
- State the proposed change and why it is needed; identify existing tables, fields, or records that could be changed or deleted; say whether data loss is expected, not expected based on inspected SQL, or unknown; explain which deployment may run the migration without exposing database settings; and state backup and rollback limitations.
- Ask for explicit user confirmation before making any schema or migration change. A general request to implement a feature or fix a bug is not migration approval. If the impact is destructive, irreversible, or unknown, do not edit or apply the migration until the user confirms the described impact and mitigation.
- Use this exact warning structure, filling every field: `DATA LOSS WARNING — Proposed change: [plain-language change]. Existing data at risk: [specific data, none expected with evidence, or unknown]. Production effect: [not accessed; deployment behavior and target still need verification]. Recovery: [verified backup/rollback limits]. May I proceed?`
- Repeat the data-impact conclusion in the QA handoff. Do not claim existing data is safe merely because tests pass, the migration is additive in appearance, or production was not directly accessed.

## 3. Implement At The Owning Boundary

- Authenticate first, authorize the route organization second, validate input third, then execute the domain operation.
- Put authorization, validation, invariants, and transactions in the service or repository boundary. The UI and route handler are not security boundaries.
- Scope every Prisma operation to the authorized internal organization ID and verify related IDs belong to that organization.
- Normalize user-entered text to uppercase with the shared helper in shared text controls and again at persistence boundaries; preserve passwords and other deliberately case-sensitive credentials.
- Use explicit lifecycle transitions, database constraints, atomic counters, Decimal arithmetic, and safe audit events.
- Reuse shared UI and reporting primitives. Include loading, error, empty, disabled, and confirmation states.

## 4. Validate The Changed Slice Immediately

- For every implementation, proactively perform the runtime checks before handoff: use read-only Prisma migration status for database-backed work; verify whether the expected local development URL is already serving the application; reuse a responsive existing server rather than starting a duplicate; then open the affected route in the browser and exercise the changed workflow, including a reload for persisted state where applicable.
- If migrations are pending, do not retry application startup as a migration mechanism and do not apply migrations automatically. Verify a disposable or otherwise approved non-production target before migration writes. If the target cannot be verified, stop and report the pending migration and required safe environment. Never modify protected database settings or validate against production.
- If the local port is occupied but the application cannot be confirmed responsive, do not terminate an unknown process. Report the blocker and obtain or establish the correct local runtime before claiming browser verification.
- After the first substantive edit, run the narrowest executable check available for the touched slice.
- If it fails, repair that same slice and rerun the same check before expanding scope.
- No implementation is complete until its relevant behavior has been exercised in a running application. For user-facing changes, use the browser to run the changed workflow, verify its visible result, and reload or revisit the route to confirm persisted state where applicable. Automated tests and a successful build do not replace this browser check.
- For UI changes, change only the visual properties and interactions required by the explicit request. Preserve existing colors, typography, spacing, layout, icons, and behavior otherwise; if the request is ambiguous about a material visual change, ask before implementing it.
- Validate the requested UI behavior in the affected screen, including relevant loading, error, empty, disabled, and success states. Check responsive behavior and keyboard/accessibility interactions where applicable; use the browser for a visual smoke check when available and report any checks that could not be performed.
- For each changed popup, complete and report the popup-specific speed/lookup checks required in section 1A independently; do not infer popup performance from general app load time, a shared-component test, or checks of a different popup.
- Run focused UI regression tests and the relevant lint or type checks where available. Review the final diff to confirm there are no incidental UI or styling changes. Do not substitute broad QA for these focused checks or bypass the user-confirmation gate below.
- For APIs, test unauthenticated, wrong-workspace, non-member, insufficient-role, cross-tenant-ID, invalid-input, duplicate-request, and happy-path cases.
- For documents and inventory, test legal and illegal lifecycle transitions, quantity overages, duplicate posting, concurrent writes where relevant, and reversal behavior.
- Do not defer checks needed to establish the changed slice's security, tenant isolation, authorization, lifecycle, financial, stock, counter, or data-integrity behavior. Run the focused checks relevant to the change before handoff.
- Before implementing a database-backed change, determine whether it requires a Prisma migration. If it does, the implementation is incomplete until the migration has been applied successfully to a verified disposable or non-production database, Prisma migration status confirms it is applied, and the affected workflow has been verified in the browser against that same migrated environment.
- For Prisma changes, perform the required schema/client workflow and disposable-database migration verification before handoff. Never use an unverified or production database for validation; if the safe database or browser environment is unavailable, do not claim completion and explicitly report the exact blocked verification and required environment. Schema validation, client generation, mocks, and a successful build do not prove that a migration was applied or the workflow works.
- Migration-specific QA must inspect both the schema diff and generated SQL for dropped tables/columns, truncation/deletion, data rewrites or backfills, new non-null constraints, changed foreign keys/cascades, and rollback limits. Test only against a verified disposable database; report the migration status and any unverified production deployment behavior. `npm run qa` is not proof that a production database is safe.

## 5. User-Test Handoff And Confirmation Gate

- After the focused checks pass, stop before running repository-wide QA. Give the user a concise summary of the change, the checks actually run, and practical manual test steps for the changed behavior.
- State clearly that full QA and release readiness are pending. Ask the user to test/review the slice and explicitly confirm before continuing; do not infer confirmation from silence or from a request to implement the change.
- If the user reports a problem, fix the focused slice and rerun its targeted checks, then hand it back for another user test. Do not start full QA until the user confirms the behavior is acceptable.
- If a manual test is not practical or relevant, say why and ask the user to confirm review of the focused result before continuing.

## 6. Full QA After User Confirmation

- Only after explicit user confirmation, run the broader validation appropriate to the change, then run `npm run qa` before declaring the change complete. The quality gate includes production dependency audit, ESLint, strict TypeScript, and production build.
- For Prisma changes, run `prisma generate`, inspect the generated SQL and indexes, apply the migration to a verified disposable or non-production database, and confirm with `npm run db:migrate:status` that it is applied. Then run the affected workflow in the browser against that same database before declaring the implementation complete. Use `npm run db:migrate:deploy` only after verifying the target from redacted metadata; never run it against production for local validation.
- Standard dev/start scripts must perform a read-only migration-status preflight and fail fast on pending migrations; they must not auto-apply migrations. Deployment pipelines apply migrations before the new code is served, not from request handlers or independently in each replica.
- Never catch Prisma missing-table/missing-column errors and return empty data or success. Treat schema drift as a deployment/readiness failure with an actionable message.
- Review the final diff for accidental scope expansion, secret exposure, missing tenant filters, unsafe deletes, inconsistent UI, and missing tests.
- Run relevant regression tests with the configured test runner; distinguish automated tests from manual smoke checks and unverified workflows.
- Push only when explicitly requested and only to a confirmed test branch and remote. Never push directly to production, force-push, rewrite history, or include unrelated changes.

## 7. Completion Record

Before user confirmation, report the implemented behavior, files changed, focused validation commands and outcomes, manual test steps, and clearly identify full QA as pending. After confirmation and full QA, report all validation commands and outcomes, migration/deployment notes, and remaining warnings or unverified workflows. Never claim release readiness while a critical security issue, failing quality gate, unresolved migration risk, or material test gap remains.