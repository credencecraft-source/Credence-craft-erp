# Inventory Management workflow

## Purpose and registered submodules

The ERP registry lists Inward (RM GRN, Packing List GRN, WO GRN, Returnable DC
GRN), Stock (RM Stock, FG Stock), and Outward (Raw Material DC).

## Canonical location and storage hierarchy

Use one organization-scoped physical inventory hierarchy everywhere:

**Organization → Location/Site → Warehouse → Sub-store/Storage Area → Rack → Bin**

Example: Bengaluru (Location/Site) → HSR (Warehouse) → Fabric Store
(Sub-store) → Rack A → Bin 01. “Sub-store” and “Storage Area” refer to the
same level unless the product owner approves a more specific distinction.

The current application has a flat, Entity-linked Location master used by
inventory records; it does not yet provide this full hierarchy. Treat this
guide as the target contract for future work, not as evidence that the hierarchy
or a centralized stock ledger is already implemented. Keep legal/business
Entity distinct from a physical site. Contact billing/shipping addresses are
separate from internal storage locations.

Future schema and service work must use stable tenant-scoped IDs and explicit
node types/parent relationships; display names and full path strings are not
stock keys. Enforce organization and parent-child integrity, uniqueness,
cycle prevention, active-state behavior, and the allowed stock granularity in
the database where possible, with shared transactional service validation for
rules the database cannot express. Stock should normally be held at Bin level;
supporting balances at a Warehouse or Sub-store must be an explicit policy.

All stock classes and flows must share the same hierarchy and movement
controls. Model source-linked, auditable, idempotent and concurrency-safe
movements for receipts, issues, transfers, reservations, adjustments/counts,
quality holds/releases, returns, and production consumption/output as
applicable. Transfers update both endpoints atomically. Define one
authoritative balance strategy and keep reports, APIs, and modules from
calculating competing balances. Preserve lot/serial, UOM, quantity precision,
and on-hand/available/reserved/held/rejected/WIP distinctions.

Do not add module-specific warehouse fields, free-text location values,
parallel location registries, or stock calculations that bypass the shared
service. Before rollout, map legacy records explicitly and surface ambiguous
or unmapped stock for resolution; do not guess mappings or discard posted
history. Follow the ERP delivery SOP’s data-loss warning and disposable
database migration gates for schema changes.

## Typical business flow

1. Receive against a valid purchase order, packing list, work order, or
   returnable delivery document as appropriate.
2. Validate item, variant, UOM, exact storage node, source-document balance,
   lot/serial identity, and received quantity.
3. Complete required quality inspection/hold steps before making stock
   available.
4. Post accepted inward quantity to the correct organization, site, storage
   node, stock type, and stock status.
5. Issue or transfer material against an authorized source document; validate
   the source and destination storage nodes and ensure requested quantity is
   within eligible pending balance and available stock.
6. Reconcile stock using auditable adjustments or reversals; display stock
   reports from ledger/source records.

## Rules and restrictions

- Validate receipt/issue quantities against source-document pending balances;
  do not trust browser stock balances.
- Use organization-scoped transactions for stock movements and posting.
- Keep UOM conversion, lot/serial, location, status, and movement direction
  explicit.
- Prevent duplicate receipt/issue, negative stock, or over-allocation according
  to the configured business policy.
- Distinguish available, reserved, quality-held, rejected, and WIP stock.
- Preserve posted movements; reverse/adjust through documented workflows and
  audit them.

## Conditions to verify

Whether partial GRNs are allowed, tolerance/excess rules, returnable DC due-in
and return-out tracking, reservations, negative stock policy, location
restrictions, UOM precision, and quality release behavior.
