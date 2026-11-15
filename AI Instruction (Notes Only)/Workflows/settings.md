# Settings workflow

## Purpose and registered submodules

The ERP registry lists Pricing → Plan, Users, and Challan Numbers. Organization
configuration may include additional settings outside this registry.

## Typical business flow

1. An authorized organization administrator opens the setting within the
   authenticated organization context.
2. Validate editable values, existing dependencies, subscription constraints,
   and uniqueness.
3. Save changes transactionally when they affect multiple records; record an
   audit event for material changes.
4. Apply changes only to future or eligible documents according to their
   effective-date and lifecycle rules.

## Rules and restrictions

- Require authentication, organization membership, and the narrowest settings
  permission.
- Do not let public organization IDs replace membership authorization.
- Do not mutate pricing, plan, user access, or document numbering based only
  on client navigation or submitted organization IDs.
- Preserve effective settings used by existing posted/approved documents.
- Protect tenant-scoped counters: do not scan records to derive a next number;
  use the existing atomic counter path.
- Validate plan limits and constraints server-side.

## Conditions to verify

Which roles can edit each setting, subscription limits, effective dates,
number format and counter concurrency, user invitation/deactivation behavior,
and audit requirements.
