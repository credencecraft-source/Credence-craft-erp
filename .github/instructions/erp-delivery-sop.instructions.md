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

## 4. Validate Immediately

- After the first substantive edit, run the narrowest executable check available for the touched slice.
- If it fails, repair that same slice and rerun the same check before expanding scope.
- For APIs, test unauthenticated, wrong-workspace, non-member, insufficient-role, cross-tenant-ID, invalid-input, duplicate-request, and happy-path cases.
- For documents and inventory, test legal and illegal lifecycle transitions, quantity overages, duplicate posting, concurrent writes where relevant, and reversal behavior.

## 5. Release Gate

- Run `npm run lint`, `npm run typecheck`, and `npm run build` for focused iteration as appropriate.
- Run `npm run qa` before completion; it also runs the production dependency audit.
- For Prisma changes, run `prisma generate`, validate the migration on a disposable database, and inspect the generated SQL and indexes.
- Review the final diff for accidental scope expansion, secret exposure, missing tenant filters, unsafe deletes, inconsistent UI, and missing tests.
- Do not claim test coverage when no test runner is configured; distinguish executable checks from manual smoke checks and unverified workflows.
- Push only when explicitly requested and only to a confirmed test branch and remote. Never push directly to production, force-push, rewrite history, or include unrelated changes.

## 6. Completion Record

Report the implemented behavior, files changed, validation commands and outcomes, migration/deployment notes, and any remaining warnings or unverified workflows. Never claim A-grade readiness while a critical security issue, failing quality gate, unresolved migration risk, or material test gap remains.