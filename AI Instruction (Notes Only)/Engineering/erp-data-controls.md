# ERP data and lifecycle controls

- Model business document lifecycles explicitly, such as draft, submitted,
  approved, rejected, posted, cancelled, and locked. Enforce transitions
  server-side.
- Preserve segregation of duties: creators must not silently approve their
  own controlled documents unless policy explicitly permits it.
- Validate inventory, WIP, receipts, transfers, BOM, tax, and financial
  quantities against source documents and pending balances. Do not trust
  client-computed totals or stock balances.
- Use Prisma transactions for multi-record mutations, counter allocation,
  stock movements, approvals, and workflow transitions.
- Use database constraints and unique keys for business invariants and
  idempotency.
- Use `Prisma.Decimal` or integer minor units for persisted monetary values;
  do not use floating-point arithmetic for financial totals.
- Preserve posted or approved records. Prefer reversal, cancellation, or
  adjustment documents over destructive deletion.
- Destructive actions require authorization, confirmation, dependency checks,
  and an audit event.
- Record material mutations with organization, actor, module, action, entity,
  timestamp, and safe before/after or reason details. Preserve database-trigger
  audit coverage.
