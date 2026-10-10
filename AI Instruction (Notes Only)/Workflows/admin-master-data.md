# Admin and master-data workflow

## Purpose and registered submodules

The ERP registry lists Admin → Masters. The master-data registry groups
organization reference data by modules such as Order Management, Design and
Development, Factory Management, Inventory, Quality, and Finance.

Examples include entities, locations, buyers, vendors, brands, categories,
articles, colors, sizes, UOMs, raw materials, processes, operations, tax, and
quality-related masters. Use the live registry for the current complete set.

## Typical business flow

1. Select the organization and the owning master type.
2. Check existing values and dependent records before creating or changing a
   master.
3. Validate required fields, uniqueness, lookup dependencies, formats, and
   organization ownership.
4. Create/update/deactivate according to the master lifecycle and permission.
5. Make the value available to dependent workflows only when active and valid.

## Rules and restrictions

- Scope every master and lookup to the authorized organization.
- Enforce unique fields and parent-child relationships server-side.
- Do not hard-delete masters referenced by transactions; deactivate or follow
  the repository's controlled correction process.
- Respect lookup dependencies, such as subcategory-to-category or
  size-to-size-group.
- Enforce subscription/master limits using the central service.
- Imported master data is untrusted input and must be validated row by row.
- Keep system registries and organization master data distinct.

## Conditions to verify

Exact required fields, uniqueness scope, deactivation behavior, dependency
checks, master-specific permissions, import atomicity, subscription limits,
and the audit trail.
