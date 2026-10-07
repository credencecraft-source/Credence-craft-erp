<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mandatory Branding And Shared UI Rule

This repository must keep one unified branded UI language across the entire application. Do not introduce inconsistent local color, spacing, border, shadow, icon, button, tab, card, form element, or visual treatment that differs from the shared ERP design system.

- NEVER change a color theme or UI element style just because a screen looks different unless the related shared component is missing or intentionally being extended.
- If a screen or module uses a non-branded or ad hoc UI treatment, fix it immediately and replace it with the standard ERP component or shared pattern.
- If the required shared UI element does not exist, create it once in the shared layer and reuse it everywhere.
- Use the same brand token, spacing rhythm, border radius, shadows, typography, and icon style everywhere. The app should feel visually identical across modules and surfaces.
- Treat shared UI primitives as the source of truth: button variants, tabs, cards, section wrappers, inputs, selects, badges, status pills, tables, modal shells, and layout patterns. Do not create parallel styles or one-off variants for the same purpose.
- When patching UI, prefer the central branded component over page-local styling. Local class overrides are allowed only to adjust layout or state, never to create a second design language.
- Every corner of the application must feel branded, consistent, and intentional; keep the same style, icon system, and design treatment across pages, platform-level UI, and organization-level screens.
- If a feature introduces new UI, match the existing ERP brand by reusing the same element language and design semantics rather than inventing a different visual identity.

## UI Architecture Laws

These are persistent project governance requirements for all future human, AI, and automated code changes. Read and follow them before modifying UI, layouts, styles, design tokens, or shared components. Do not weaken or bypass these requirements as part of an unrelated feature or refactor. A deliberate design-system revision requires explicit product-owner approval and an update to this rulebook.

### Window shell and navigation

- Keep the root application shell flush to the viewport edges, using the repository's supported full-viewport sizing and overflow utilities (normally `h-dvh w-dvw overflow-hidden`, or the established `h-screen w-screen overflow-hidden` convention).
- The root flex container wrapping navigation and header must have no outer margin or padding. Do not add page-content padding to this shell.
- Keep the sidebar and top header fixed within the shell and flush to their respective window edges. Do not apply outer margins or padding that inset them.
- Contain vertical scrolling in the designated inner `<main>` or page-content region. That region must be allowed to shrink (`min-h-0 min-w-0`) and scroll vertically (`overflow-y-auto`) without making the shell, header, or sidebar scroll.
- Prevent page-level horizontal overflow. Use horizontal scrolling only inside an explicitly bounded responsive data-table region, not on the root shell or general module/page wrappers.

### Content spacing and fit

- Apply outer content breathing room only inside the scrollable main content, page views, form wrappers, and report sections: `p-4` on mobile and `p-8` at desktop sizes, unless a shared layout component already provides the equivalent responsive spacing.
- Keep cards, panels, and modal content on the shared internal-padding scale (normally `p-6`). Use shared spacing tokens, responsive grids, `gap-4`/`gap-6`, and `space-y-4`/`space-y-6`; do not introduce arbitrary spacing or negative margins that break viewport fit.
- Use `min-w-0` and `min-h-0` on constrained flex/grid children where needed. Ensure grids wrap responsively and content cannot force its ancestors wider than the viewport.
- Reuse the existing shell and shared page, section, card, table, and modal components. New pages must inherit the shell and place responsive content padding inside the designated content region.

### Color, semantic status, and typography

- Use the centrally registered brand, surface, and semantic status tokens. The intended brand palette is primary `brand-500` (`#4f46e5`), the registered secondary accents, and the registered `surface-dark` token; success, warning, error, and info states must use their corresponding predefined background/border/text token pairs.
- Never add arbitrary hex or RGB colors, random Tailwind palette colors, or inline color styles to application UI. If a required token is absent or the registered theme conflicts with this specification, stop and request an approved design-system/token update rather than inventing a local value or silently changing shared theme behavior.
- Use the shared typography scale for page, header, module, and navigation titles. Do not create local font-size/weight systems for the same semantic roles.

### Shared components and destructive actions

- Prefer the canonical shared `Button`, `Card`, `Badge`, `AppLayout`, and other existing UI primitives over hand-built equivalents. Extend a shared primitive when a reusable capability is missing; do not create parallel component structures.
- Every delete/destructive action must use the shared `destructive` button/action variant and a confirmation step appropriate to the operation. Do not render raw delete buttons or icon-only delete actions. Preserve server-side authorization, dependency checks, and audit behavior for destructive business operations.
- Keep shared component structure, tokens, and variants stable across platform and organization pages. A screen-specific override may handle layout or state only; it must not establish a competing visual language.

## Implementation Verification Gate

- For every implementation, proactively verify the local runtime before handoff: run the read-only Prisma migration-status check when a database is involved, then reuse an already-running development server if it responds at the expected local URL instead of trying to launch a duplicate. Open the affected route in the browser and exercise the changed workflow; reload to verify persistence when applicable.
- If the migration-status check reports pending migrations, do not repeatedly start the app or apply migrations automatically. Verify that the target is a disposable or otherwise approved non-production database before any migration write; if that cannot be established, stop and report the pending migration and the safe environment needed. Never change protected database settings or point validation at production.
- If a server is already listening but is not responsive or is not the expected application, do not terminate an unknown process. Report the exact blocker and ask for or establish the correct local runtime before claiming browser verification.
- No implementation is complete until its relevant behavior has been exercised in a running application. For user-facing work, use the browser to run the changed workflow, verify its visible result, and reload or revisit the route to confirm persisted state where applicable. Automated tests and a successful build do not replace this browser check.
- Before implementing a database-backed change, determine whether it requires a Prisma migration. If it does, the implementation is incomplete until the migration has been applied successfully to a verified disposable or non-production database, Prisma migration status confirms it is applied, and the affected workflow has been verified in the browser against that same migrated environment.
- Never apply migrations to an unverified or production database for local validation. Production migrations are applied only by the approved deployment/release pipeline before serving code that requires the schema.
- If the required safe database or running browser environment is unavailable, do not claim the implementation is complete: report the exact verification that remains blocked and what environment is needed. Do not bypass this gate by treating schema validation, client generation, mocks, or a successful build as proof that a migration is applied or the workflow works.

## Platform Audience Tag Master

- Audience tags are managed once in the platform Tags catalog, linked beneath Segments in the platform sidebar. Do not accept comma-separated or free-text tags on version/business-type configuration screens.
- Assign catalog tags to a version/business-type pair through stable tag IDs. Keep current assignments when a catalog label is renamed; deactivation hides a tag from new assignments but preserves and displays existing assignments.
- Migrate legacy free-text assignments into distinct catalog records before switching consumers to the master relation. Keep organization pricing, plan filtering, version duplication, and public catalog output reading tag labels through that relation.
