# Next.js and file structure

- This repository's Next.js version may have breaking changes. Read the
  relevant guide under `node_modules/next/dist/docs/` before changing App
  Router special files or Next.js APIs, and follow deprecation notices.
- Keep required App Router filenames exactly `page.tsx`, `layout.tsx`, and
  `route.ts`; use one-line re-exports when practical.
- Put page implementations in adjacent private `_page-content/` folders and
  name them for their exact responsibility.
- Use lowercase kebab-case for business folders.
- Keep organization modules under
  `app/dashboard/[workspaceId]/organizations/[organizationId]/`.
- Keep order work under `order-management/merchandising/order/`, approval work
  under `approvals/`, and organization configuration under `settings/`.
