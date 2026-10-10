# Factory Management workflow

## Purpose and registered submodules

The ERP registry lists Pre Production → Work Order, Production → Shop Floor,
and Post Production → Scan Pack. Factory screens also include production
updates and WIP-related operations.

## Typical business flow

1. Confirm that an order/style is eligible for production and required
   specifications, BOM, routing/process templates, and materials are ready.
2. Create/release a work order with validated source order, style, variant,
   process, planned quantity, and destination.
3. Dispatch/transfer work or materials to the relevant production stage with
   traceable quantities.
4. Record shop-floor production updates against the work order and process
   stage; reconcile completed, rejected, and remaining quantities.
5. Record WIP transfers and stage completions using source and destination
   references.
6. Complete post-production operations and scan/pack units or cartons as
   supported.
7. Reconcile packed output against work-order demand and route finished goods
   through quality and inventory receipt processes.

## Rules and restrictions

- Validate work-order quantities against source-order balances and previously
  released/produced quantities.
- Prevent illegal stage transitions and duplicate production postings.
- Use transactions for multi-record work-order, WIP, and stock mutations.
- Reconcile input, good output, reject, scrap, and remaining quantities; never
  accept client-calculated balances.
- Preserve traceability for order, work order, operation/process, actor, and
  timestamps.
- Enforce permissions and approval controls at service boundaries.
- Do not assume that a scan event posts stock or completes quality checks
  unless the code explicitly does so.

## Conditions to verify

Work-order release rules, operation sequence, WIP transfer authorization,
overproduction/tolerance policy, defect handling, scan-pack uniqueness,
quality gate, and finished-goods receipt requirements.
