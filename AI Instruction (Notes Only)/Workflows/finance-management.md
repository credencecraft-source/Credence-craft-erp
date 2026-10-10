# Finance Management workflow

## Purpose and registered submodules

The ERP registry lists Transactions with Sales Invoice, Purchase Invoice,
Create Purchase Bill, Debit Note, Credit Note, and Delivery Challan.

## Typical business flow

1. Start from a valid source order, delivery, receipt, purchase bill, or other
   supported transaction.
2. Validate organization, counterparty, item/service lines, quantities, rates,
   tax masters, currency, and outstanding/source balances.
3. Calculate totals with `Prisma.Decimal` or integer minor units on the server.
4. Submit for approval if required; post only through a legal lifecycle
   transition.
5. Record a delivery challan or adjustment document against its source where
   supported.
6. Correct posted documents using linked credit/debit notes, cancellation, or
   reversal rather than destructive edits.

## Rules and restrictions

- Never use floating-point arithmetic for persisted money or rates.
- Do not trust client-computed totals, tax, or balances; recalculate and
  validate on the server.
- Validate tax classifications, jurisdiction, currency, rounding, and source
  quantity/value remaining.
- Preserve immutable/posted documents and their audit trail.
- Prevent duplicate posting and over-adjustment; use transactions for related
  ledger/document effects.
- Separate creator and approver where policy requires segregation of duties.

## Conditions to verify

Accounting integration, posting/locking rules, tax calculation, invoice
numbering, permitted edits, credit/debit note limits, payment reconciliation,
and delivery-challan stock effect.
