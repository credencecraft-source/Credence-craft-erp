# Inventory Management workflow

## Purpose and registered submodules

The ERP registry lists Inward (RM GRN, Packing List GRN, WO GRN, Returnable DC
GRN), Stock (RM Stock, FG Stock), and Outward (Raw Material DC).

## Typical business flow

1. Receive against a valid purchase order, packing list, work order, or
   returnable delivery document as appropriate.
2. Validate item, variant, UOM, location, source-document balance, lot/serial
   identity, and received quantity.
3. Complete required quality inspection/hold steps before making stock
   available.
4. Post accepted inward quantity to the correct organization/location and
   stock type.
5. Issue or transfer material against an authorized source document; ensure
   requested quantity is within eligible pending balance and available stock.
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
