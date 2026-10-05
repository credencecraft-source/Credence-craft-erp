# AI Instruction Notes

**Notes only; not an active instruction source.** These topic files make the
project's guidance easier for people to browse. They do not replace or change
the active instructions in [`../../AGENTS.md`](../../AGENTS.md) or
[`../../.github/instructions/erp-delivery-sop.instructions.md`](../../.github/instructions/erp-delivery-sop.instructions.md).
If there is any difference, follow those active files.

## UI

- [Typography and fonts](UI/typography-font.md)
- [Colors and tokens](UI/colors-and-tokens.md)
- [Sidebar and master dropdowns](UI/sidebar-master-dropdowns.md)
- [Padding, spacing, and margins](UI/padding-spacing-margins.md)
- [Zoom and responsive behavior](UI/zoom-responsive.md)
- [Buttons and actions](UI/buttons-actions-feedback.md)
- [Cards and containers](UI/cards-containers.md)
- [Tabs, badges, and status](UI/tabs-badges-status.md)
- [Interaction and accessibility](UI/interaction-accessibility.md)

## Engineering and product

- [Architecture and scope](Engineering/architecture-and-scope.md)
- [Security and tenant isolation](Engineering/security-tenant-isolation.md)
- [ERP data and lifecycle controls](Engineering/erp-data-controls.md)
- [Next.js and file structure](Engineering/nextjs-file-structure.md)

## Module workflows

- [Workflow notes index and reading rules](Workflows/README.md)
- [Online](Workflows/online.md)
- [POS](Workflows/pos.md)
- [Order Management](Workflows/order-management.md)
- [Design and Development](Workflows/design-development.md)
- [Factory Management](Workflows/factory-management.md)
- [Quality Management System](Workflows/quality-management.md)
- [Finance Management](Workflows/finance-management.md)
- [Inventory Management](Workflows/inventory-management.md)
- [Security Management](Workflows/security-management.md)
- [Approvals](Workflows/approvals.md)
- [Settings](Workflows/settings.md)
- [Admin and master data](Workflows/admin-master-data.md)
- [Platform administration](Workflows/platform-administration.md)

## Delivery

- [QA checks](Delivery/qa-checks.md)
- [Git, commits, and push rules](Delivery/git-commit-push.md)
- [Implementation, review, and handoff](Delivery/implementation-handoff.md)

## Instruction alignment

- [Current differences from active instructions](Deviation/Overview/current-comparison.md)

Keep this folder for explanatory notes. Update the active instruction sources
separately when repository policy needs to change.

## Refreshing the notes against active instructions

When asked to refresh or compare these notes:

1. Search the current workspace for root/nested `AGENTS.md`, Copilot
   instruction files, `.instructions.md` files, `.agent.md` files, and other
   clearly named project instruction sources.
2. Re-read every discovered source and the relevant notes; do not rely on an
   earlier comparison.
3. Compare by topic. Update the notes where they can match active rules without
   changing their meaning.
4. Keep the `Deviation` folder limited to genuine differences. For each one,
   state **Active rule**, **Notes rule**, and **Difference**. Do not repeat
   points that match.
5. Update or remove a deviation only after rechecking both sources. Record
   the new audit date and checked source files in
   [the comparison index](Deviation/Overview/current-comparison.md).
6. Do not change active instruction files during a notes refresh unless
   explicitly requested.

The workspace comparison cannot inspect hidden system/developer/runtime
instructions or files outside the workspace; do not claim those were audited.
