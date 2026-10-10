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
- Before changing any UI, layout, style, design token, or shared component, read and apply the repository-level `AGENTS.md` section "UI Architecture Laws." It governs shell boundaries, content-only padding, scroll containment, canonical color/status/typography tokens, reusable components, and destructive actions across the entire application.
- Treat those laws as durable project constraints, not suggestions. Do not modify or bypass them during unrelated work. A deliberate design-system revision requires explicit product-owner approval and an update to `AGENTS.md`.
- If implementation reality conflicts with the locked token or shared-component rules, do not invent local styles or silently change the global theme; report the specific conflict and request an approved design-system update.

## 2. Specify The Contract

- Define actor, workspace, organization, permission, input shape, response shape, lifecycle transition, and failure behavior.
- Identify tenant-owned records, source documents, dependent records, business keys, counters, money, tax, stock, and audit requirements.
- Decide whether the operation is read-only, reversible, transactional, idempotent, approval-controlled, or destructive.

## 3. Implement At The Owning Boundary

- Authenticate first, authorize the route organization second, validate input third, then execute the domain operation.
- Put authorization, validation, invariants, and transactions in the service or repository boundary. The UI and route handler are not security boundaries.
- Scope every Prisma operation to the authorized internal organization ID and verify related IDs belong to that organization.
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
- Run focused UI regression tests and the relevant lint or type checks where available. Review the final diff to confirm there are no incidental UI or styling changes. Do not substitute broad QA for these focused checks or bypass the user-confirmation gate below.
- For APIs, test unauthenticated, wrong-workspace, non-member, insufficient-role, cross-tenant-ID, invalid-input, duplicate-request, and happy-path cases.
- For documents and inventory, test legal and illegal lifecycle transitions, quantity overages, duplicate posting, concurrent writes where relevant, and reversal behavior.
- Do not defer checks needed to establish the changed slice's security, tenant isolation, authorization, lifecycle, financial, stock, counter, or data-integrity behavior. Run the focused checks relevant to the change before handoff.
- Before implementing a database-backed change, determine whether it requires a Prisma migration. If it does, the implementation is incomplete until the migration has been applied successfully to a verified disposable or non-production database, Prisma migration status confirms it is applied, and the affected workflow has been verified in the browser against that same migrated environment.
- For Prisma changes, perform the required schema/client workflow and disposable-database migration verification before handoff. Never use an unverified or production database for validation; if the safe database or browser environment is unavailable, do not claim completion and explicitly report the exact blocked verification and required environment. Schema validation, client generation, mocks, and a successful build do not prove that a migration was applied or the workflow works.

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