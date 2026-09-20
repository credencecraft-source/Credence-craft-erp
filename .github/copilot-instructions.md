# Credence Craft ERP Engineering Rules

These rules govern every feature, bug fix, refactor, migration, route, API, service, and UI change in this repository. Prefer the smallest change that preserves existing behavior and improves the underlying control.

## Product And Architecture

- Treat the system as a multi-tenant, organization-scoped fashion and manufacturing ERP. The primary domains are merchandising, BOM, procurement, inventory, factory production, quality, finance, approvals, master data, reporting, subscriptions, and platform administration.
- Route module-specific work into the existing organization-level Master Module before considering an application-level change. Do not redesign the home page, dashboard shell, global layout, navigation, theme, or shared styling unless the request explicitly requires it.
- Keep business logic in domain services under `lib/services/<domain>/`; keep route handlers thin and responsible for HTTP concerns only.
- Keep organization-owned data keyed by the internal organization primary key after authorization. Public organization IDs are route identifiers, not authorization credentials.
- Reuse existing registries and shared components before introducing parallel definitions: ERP module registry, master-data registry, `requireOrganizationContext`, permission services, report grid, and shared UI primitives.
- Do not rename, flatten, or relocate existing business modules without explicit approval. For any structural rename, first list current and proposed paths and wait for confirmation.

## Security And Tenant Isolation

- Every server page, server action, and API route must authenticate the session or platform session appropriate to its boundary.
- Every organization route must verify both the authenticated user and the route organization with `requireOrganizationContext` or an equivalent membership query. Also verify the workspace route parameter matches the authenticated workspace.
- Every organization-owned Prisma read, update, delete, aggregate, and relation lookup must include the authorized internal organization ID. Never fetch by a record ID alone and authorize afterward.
- Enforce permissions in the service layer, not only in navigation or page layouts. Use the narrowest permission for the operation and separate view, create, edit, delete, submit, and approve capabilities where applicable.
- Platform administration and organization administration are separate trust boundaries. Never use a platform lookup or `getOrganizationByPublicId` as a substitute for membership authorization.
- Development user stores and default credentials must remain unavailable in production. Never log secrets, tokens, invitation URLs, personal data, or full request bodies.
- Validate and normalize all request bodies, query parameters, path parameters, dates, quantities, rates, enum values, and uploaded or imported data. Return safe user-facing errors and log only sanitized diagnostic context.

## ERP Business Controls

- Model document lifecycles explicitly: draft, submitted, approved, rejected, posted, cancelled, and locked where relevant. Enforce legal transitions server-side.
- Approval is a segregation-of-duties boundary. The creator must not silently approve their own controlled document unless the documented policy explicitly allows it.
- Inventory, WIP, receipt, transfer, BOM, tax, and financial quantities must be validated against source documents and pending balances. Never trust client-computed totals or stock balances.
- Use Prisma transactions for multi-record mutations, counter allocation, stock movements, approvals, and workflow transitions. Use database constraints and unique keys for business invariants and idempotency.
- Use `Prisma.Decimal` or integer minor units for money and rates; do not use floating-point arithmetic for persisted financial totals.
- Preserve posted or approved records. Prefer reversal, cancellation, or adjustment documents over destructive deletion. Destructive actions require authorization, confirmation, dependency checks, and an audit event.
- Every material mutation must be auditable with organization, actor, module, action, entity, timestamp, and safe before/after or reason details. Preserve database-trigger audit coverage and add actor-aware application audit where the trigger cannot explain intent.
- Use tenant-scoped atomic counters for human-readable document numbers. Do not derive numbers by scanning existing rows.

## Next.js And File Structure

- Keep required App Router filenames exactly `page.tsx`, `layout.tsx`, and `route.ts`; use one-line re-exports when practical.
- Put page implementations in adjacent private `_page-content/` folders and name them by exact responsibility, such as `merchandising-order-list-page.tsx` or `organization-shell-layout.tsx`.
- Use lowercase kebab-case for business folders: `order-management`, `approval-settings`, `master-data`.
- Use descriptive implementation names. Avoid vague `utils.ts`, `helpers.ts`, `service.ts`, `data.ts`, and `index.ts` unless the containing folder makes the purpose unambiguous.
- Organization modules remain under `app/dashboard/[workspaceId]/organizations/[organizationId]/`. Order work remains under `order-management/merchandising/order/`; approval work under `approvals/`; organization configuration under `settings/`.
- Read the relevant guide in `node_modules/next/dist/docs/` before changing App Router special files or Next.js APIs.

## UI And Reporting

- Build for dense operational work: clear hierarchy, compact but readable tables, keyboard-accessible forms, responsive overflow, explicit loading/error/empty states, and visible status semantics.
- Prefer shared `Button`, `Input`, `Select`, `Modal`, `Table`, `Page`, `Section`, and report components. Use Lucide icons for icon actions and provide accessible labels/tooltips.
- Do not make a placeholder screen look complete. A workflow page must either perform the full operation or clearly state its implementation boundary.
- Use the reusable report standard in repository memory for finance and operational reports: consistent title, search, filters, column visibility, row behavior, formatting, and empty states.
- Never expose sensitive identifiers or raw audit payloads unnecessarily in the UI. Format dates, amounts, quantities, and statuses consistently with the existing locale conventions.

## Delivery And Quality Gates

- Before editing, identify the owning abstraction, state one falsifiable hypothesis, and choose the cheapest check that can disconfirm it.
- Keep changes focused and preserve unrelated user work. Do not commit or create branches unless requested.
- Add or update focused regression coverage for every production bug and for security, authorization, lifecycle, financial, stock, and counter behavior.
- Run the narrowest relevant check immediately after the first edit, then run `npm run qa` before declaring completion. The quality gate includes production dependency audit, ESLint, strict TypeScript, and production build.
- For schema changes, add a Prisma migration, regenerate the client, test the migration against a disposable database, and run the read-only integrity audit where relevant.
- Stop development servers before Windows production builds when Prisma engine replacement requires it. Report any unavailable test, warning, vulnerability, migration risk, or unverified workflow honestly.
- Use the configured test branch and remote only when explicitly asked to push. Never push directly to production, force-push, rewrite history, or include unrelated work; ask for the target when branch or remote is unclear.
- The repository currently has no configured test runner; do not claim behavior is covered when only lint, typecheck, build, or manual smoke checks were run.
