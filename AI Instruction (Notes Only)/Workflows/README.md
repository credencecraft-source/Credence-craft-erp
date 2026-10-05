# Module workflow notes

These are explanatory workflow maps, not active policy, source code, or a
complete specification of every business rule. The registered module and
submodule names are based on `components/erp/erp-config-registry.ts`.

Before implementing or changing a workflow:

1. Trace the relevant page, API route, domain service, permission check,
   lifecycle model, database constraints, and tests.
2. Confirm exact roles, lifecycle states, validations, limits, dependencies,
   and error behavior from those sources. This note must not override them.
3. Preserve existing behavior unless the user explicitly requests a change.
4. Add/update focused tests for control changes and update this note if the
   verified workflow has materially changed.
5. Keep organization-owned data scoped to the authorized internal organization
   ID. Keep platform administration in its separate trust boundary.

## Workflow template

Each module note should explain:

- **Purpose and records** — what the module manages.
- **Navigation/submodules** — registered features, not a promise that every
  route is enabled for every organization.
- **Typical flow** — the business sequence at a high level.
- **Rules and restrictions** — invariant controls to verify and preserve.
- **Dependencies/conditions** — what the flow relies on and where the
  implementation must confirm exact conditions.

The flow diagrams are conceptual. Never implement a transition, permission,
approval policy, or automatic stock/finance effect merely because it appears in
this overview; verify the current domain service and tests first.
