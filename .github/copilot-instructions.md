# ERP Folder and File Naming Rules

Use these rules for every new feature, page, component, service, or refactor in this repository.

## General Rules

- Give every folder a clear business purpose using lowercase kebab-case: `order-management`, `master-data`, `approval-settings`.
- Give implementation files a clear purpose in their name: `create-organization-page.tsx`, `order-service.ts`, `organization-validators.ts`.
- Do not use vague names such as `utils.ts`, `helpers.ts`, `service.ts`, `data.ts`, or `index.ts` unless the folder name alone makes the purpose unambiguous.
- Keep related files in the same domain folder. Do not place feature-specific files at the root of `components/` or `lib/`.
- Do not rename or flatten existing business modules without explicit user approval.
- Before a structural rename, list the current path and proposed path, then wait for user confirmation.
- After a rename, update every import, link, redirect, revalidation path, and navigation entry. Run `npm run build`.

## Next.js App Router Rules

- Keep the required Next.js route filenames exactly as `page.tsx`, `layout.tsx`, and `route.ts`.
- Each required route file must be a one-line re-export whenever practical.
- Put the actual page or layout implementation in a private `_page-content/` folder beside its route entry.
- Name the implementation by its exact job, for example `merchandising-order-list-page.tsx` or `organization-shell-layout.tsx`.
- Private folders must start with `_` so they do not become URL segments.
- Read the relevant guide in `node_modules/next/dist/docs/` before changing App Router routes or special files.

## Required Organization Module Hierarchy

Keep organization-level ERP modules inside this route structure:

```text
app/dashboard/[workspaceId]/organizations/[organizationId]/
├── order-management/
│   └── merchandising/
│       └── order/
│           ├── create/
│           └── [orderId]/
├── approvals/
│   └── approval-settings/
│       └── master-review/
└── settings/
    └── master-data/
        └── [moduleKey]/
```

- The top-level organization module folder names must match their business modules: `order-management`, `approvals`, and `settings`.
- All order-related routes belong under `order-management/merchandising/order/`.
- Do not replace these module folders with generic alternatives such as `orders`, `configuration`, or `approval-workflows`.
- New order-related pages must be placed under the `order/` folder or one of its child folders.

## Examples

```text
order-management/merchandising/order/
├── page.tsx
└── _page-content/
    └── merchandising-order-list-page.tsx

order-management/merchandising/order/create/
├── page.tsx
└── _page-content/
    └── create-merchandising-order-page.tsx
```
