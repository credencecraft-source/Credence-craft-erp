# Online workflow

## Purpose and registered submodules

The ERP registry lists **Pre Order** and **Ready Stock**, each with a B2B
Dashboard and B2C Dashboard. This is the registered navigation shape; enabled
sales channels and fulfillment behavior must be confirmed in the feature
implementation.

## Typical business flow

1. Select the applicable channel and sales mode (pre-order or ready stock).
2. Present only products, variants, prices, and quantities available to the
   organization and channel.
3. Capture a customer order and validate customer, item, variant, quantity,
   price, address, and payment/fulfillment inputs.
4. For ready stock, verify availability/reservation before acceptance. For
   pre-order, record the promised availability/delivery conditions instead of
   implying immediate stock.
5. Track confirmed order, payment, fulfillment, cancellation, and return using
   the actual configured lifecycle.

## Rules and restrictions

- Tenant-scope catalog, customer, pricing, order, and stock operations.
- Recalculate price, tax, discounts, and totals on the server.
- Prevent overselling with atomic availability/reservation checks where stock
  is involved.
- Validate payment and fulfillment transitions; do not mark paid or shipped
  from client-provided state.
- Do not assume the online channels are integrated with external storefronts,
  payment providers, or carriers unless the implementation confirms it.

## Conditions to verify

Channel enablement, inventory reservation policy, payment state mapping,
pre-order promise rules, cancellation/refund behavior, and external
integration/idempotency behavior.
