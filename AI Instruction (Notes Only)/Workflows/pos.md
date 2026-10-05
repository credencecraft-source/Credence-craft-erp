# POS workflow

## Purpose and registered submodules

The ERP registry lists Quick Invoice, Purchase Bill, Invoice, Stock, and
Vendor/Customer entry points.

## Typical business flow

1. Select or identify the customer/vendor and the relevant products or
   materials.
2. Add validated lines, quantities, rates, discounts, tax, and payment
   details.
3. Recompute totals and tax on the server using current organization masters.
4. Validate stock and document state before posting or completing a sale.
5. Create the invoice or purchase bill and its related financial/inventory
   effects in the same transaction where the domain requires it.
6. Use established cancellation, return, or credit/debit adjustment paths to
   correct a posted transaction.

## Rules and restrictions

- Verify organization context and permissions for every operation.
- Never accept client totals, tax values, available stock, or payment status as
  authoritative.
- Validate UOM conversions, decimal precision, stock availability, tax
  classification, and source-document balances.
- Use idempotency/unique constraints or equivalent duplicate prevention for
  posting actions.
- Do not delete posted financial or stock records to correct them.
- Confirm barcode/SKU belongs to the authorized organization and resolves to
  the expected item/variant.

## Conditions to verify

Exact posting states, permitted negative stock policy, tax rules, payment
methods, rounding, invoice numbering, returns, and integration with finance or
inventory.
