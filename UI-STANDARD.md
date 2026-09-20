# ERP UI Standard

The shared primitives in `components/ui` are the default control layer for every ERP screen.

## Required Defaults

- Use `Button` for actions and submit controls.
- Use `Input`, `Select`, `Textarea`, and `Checkbox` for user-editable form controls.
- Use `Modal` for dialogs and `Tabs` for tab navigation.
- Use `Table` for report and data-table overflow behavior.
- Use `Page`, `Section`, `Card`, `Badge`, `Navbar`, and `Sidebar` for shared layout and status presentation.
- Native hidden inputs are allowed when submitting server-action or form metadata.

## Exceptions

Raw controls may remain temporarily in dense table-cell editors or specialized controls that cannot yet be expressed by the shared API. Document the reason in the migration issue and do not copy the pattern into new screens.

## Migration Order

Migrate new and actively changed screens first, then complete one module at a time in this order:

1. Platform and organization settings
2. Inventory and procurement reports
3. Finance transaction forms
4. Merchandising, BOM, POS, and production workspaces

Run `npm run lint:ui` to see remaining raw-control usage. The rule is currently a warning while the existing backlog is migrated. It should become an error after the backlog is cleared.

## Primitive Contract

Shared fields preserve native HTML props such as `name`, `required`, `value`, `onChange`, and `disabled`. Use the optional `label`, `hint`, and `error` props so labels and validation messages remain associated with their controls.

Dialogs must provide `ariaLabelledBy` when they render a visible heading. Tabs should be placed outside forms where possible and should provide `panelId` when their panel has a corresponding ID.