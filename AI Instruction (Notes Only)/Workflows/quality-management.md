# Quality Management System workflow

## Purpose and registered submodules

The ERP registry lists Raw Material → RM Quality Check and Finished Goods →
FG Quality Check.

## Typical business flow

1. Receive or identify the source lot/document and its organization-owned
   material or finished-good item.
2. Record inspection checks, measured values, sample/lot identity, inspector,
   and evidence required by the configured quality plan.
3. Record a decision such as accepted, rejected, or conditional disposition
   only where those states are defined by the implementation.
4. Route rejected/held quantities through the configured hold, rework, return,
   or rejection workflow.
5. Release accepted quantities to the next inventory or production step using
   the source inspection and quantity balance.

## Rules and restrictions

- Inspections must reference the correct organization, source receipt/work
  order, item, variant, and lot.
- Validate inspected quantities against the pending source quantity and avoid
  duplicate inspection or release.
- Do not make held/rejected stock available for normal consumption or sale
  unless an authorized disposition changes its status.
- Preserve inspector identity, timestamp, results, and auditable disposition.
- Use controlled amendments/reinspection for completed checks; do not silently
  rewrite a completed quality decision.

## Conditions to verify

Configured inspection plans, sampling frequency, allowed result values,
approval requirements, quarantine behavior, rework policy, and exact stock
release integration.
