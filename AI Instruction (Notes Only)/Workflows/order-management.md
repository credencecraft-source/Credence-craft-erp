# Order Management workflow

## Purpose and registered submodules

Manages the customer/style order lifecycle and associated sourcing documents.
The ERP registry divides this module into:

- **Merchandising:** Order, Bulk Order, BOM, Order Summary.
- **Procurement:** General PO, Style Wise PO, Purchase Order.

## Typical business flow

1. Maintain organization masters used to describe the order: entity, buyer,
   brand, season, category/subcategory, article, colors, size group, sizes,
   currency, and applicable order-volume rules.
2. Create an order or import a validated bulk-order template.
3. Review order identity, buyer/entity, product classification, quantities,
   delivery milestones, variants, and required fields.
4. Build/review the BOM and consumption needs against the order's styles and
   variants.
5. Submit the order or controlled changes for the configured review/approval
   process, if applicable.
6. Generate or allocate procurement requirements through General PO or Style
   Wise PO and create purchase-order documents.
7. Track order summary and related procurement/production progress without
   treating a summary display as authority to mutate source records.

## Rules and restrictions

- Scope orders, BOMs, and procurement relations to the authorized organization.
- Validate entity, buyer, category/subcategory dependency, article, season,
  color, size group, and other referenced IDs as belonging to that organization.
- Validate quantities, dates, variant breakdowns, required fields, and
  duplicate identifiers server-side; do not trust client totals.
- Preserve source order and BOM data when generating procurement. Confirm
  pending/remaining quantities and existing allocations before allocating
  again.
- Enforce lifecycle transitions and approval segregation in services. A user
  must not bypass submission or approve their own controlled document unless
  the configured policy explicitly permits it.
- Use transactions and tenant-scoped counters for multi-record creation and
  document numbers where required. Do not derive numbers by scanning records.
- Treat import rows as untrusted input; report row-level validation failures
  and do not partially commit invalid batches unless the existing contract
  explicitly supports that behavior.
- Preserve posted/approved records; use the established cancellation,
  reversal, or adjustment path rather than destructive deletion.

## Conditions to verify before changing behavior

- Which fields are mandatory by organization, business type, order stage, and
  order type.
- Allowed order/BOM lifecycle transitions and the configured approver chain.
- Whether edits are allowed after submission, approval, procurement
  allocation, or production release.
- How order volume, excess, consumption, size/color splits, currency, and
  delivery dates are calculated.
- How General PO and Style Wise PO allocate quantities and prevent overbuying
  or duplicate allocation.
- Whether bulk upload is atomic, partially accepted, or staged for review.

Do not infer those answers from this overview. Confirm them in the order and
procurement services, APIs, schema, and tests.
