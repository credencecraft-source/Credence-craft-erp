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

- After the first substantive edit, run the narrowest executable check available for the touched slice.
- If it fails, repair that same slice and rerun the same check before expanding scope.
- For APIs, test unauthenticated, wrong-workspace, non-member, insufficient-role, cross-tenant-ID, invalid-input, duplicate-request, and happy-path cases.
- For documents and inventory, test legal and illegal lifecycle transitions, quantity overages, duplicate posting, concurrent writes where relevant, and reversal behavior.
- Do not defer checks needed to establish the changed slice's security, tenant isolation, authorization, lifecycle, financial, stock, counter, or data-integrity behavior. Run the focused checks relevant to the change before handoff.
- For Prisma changes, perform the required schema/client workflow and disposable-database migration verification before handoff when the environment permits. Never use a production database for validation; explicitly report any unavailable verification.

## 5. User-Test Handoff And Confirmation Gate

- After the focused checks pass, stop before running repository-wide QA. Give the user a concise summary of the change, the checks actually run, and practical manual test steps for the changed behavior.
- State clearly that full QA and release readiness are pending. Ask the user to test/review the slice and explicitly confirm before continuing; do not infer confirmation from silence or from a request to implement the change.
- If the user reports a problem, fix the focused slice and rerun its targeted checks, then hand it back for another user test. Do not start full QA until the user confirms the behavior is acceptable.
- If a manual test is not practical or relevant, say why and ask the user to confirm review of the focused result before continuing.

## 6. Full QA After User Confirmation

- Only after explicit user confirmation, run the broader validation appropriate to the change, then run `npm run qa` before declaring the change complete. The quality gate includes production dependency audit, ESLint, strict TypeScript, and production build.
- For Prisma changes, run `prisma generate`, inspect the generated SQL and indexes, and verify the migration against a disposable database. Before serving code that uses changed schema, apply and verify the migration in that environment. Use `npm run db:migrate:status` as a read-only check and `npm run db:migrate:deploy` only as an explicit release operation after verifying the target from redacted metadata.
- Standard dev/start scripts must perform a read-only migration-status preflight and fail fast on pending migrations; they must not auto-apply migrations. Deployment pipelines apply migrations before the new code is served, not from request handlers or independently in each replica.
- Never catch Prisma missing-table/missing-column errors and return empty data or success. Treat schema drift as a deployment/readiness failure with an actionable message.
- Review the final diff for accidental scope expansion, secret exposure, missing tenant filters, unsafe deletes, inconsistent UI, and missing tests.
- Run relevant regression tests with the configured test runner; distinguish automated tests from manual smoke checks and unverified workflows.
- Push only when explicitly requested and only to a confirmed test branch and remote. Never push directly to production, force-push, rewrite history, or include unrelated changes.

## 7. Completion Record

Before user confirmation, report the implemented behavior, files changed, focused validation commands and outcomes, manual test steps, and clearly identify full QA as pending. After confirmation and full QA, report all validation commands and outcomes, migration/deployment notes, and remaining warnings or unverified workflows. Never claim release readiness while a critical security issue, failing quality gate, unresolved migration risk, or material test gap remains.