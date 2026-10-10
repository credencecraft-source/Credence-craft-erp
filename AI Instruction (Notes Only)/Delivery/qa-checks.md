# QA checks

## Focused checks first

- Before editing, identify the owning abstraction, state one falsifiable
  hypothesis, and choose the cheapest check that could disprove it.
- After the first substantive edit, run the narrowest relevant test, lint, or
  type check. Fix failures in the changed slice and rerun that check.
- Add or update focused regression tests for production bugs and for security,
  authorization, tenant isolation, lifecycle, financial, stock, and counter
  behavior.
- For UI work, check the requested behavior, responsive layout, keyboard
  accessibility, and relevant loading, error, empty, disabled, and success
  states. Use the browser for a smoke check when available.
- Review the diff for accidental changes and distinguish tests from lint,
  typecheck, build, and manual checks.

## Special validation

- For API changes, cover unauthenticated, wrong-workspace, non-member,
  insufficient-role, cross-tenant-ID, invalid-input, duplicate-request, and
  happy-path behavior as relevant.
- For documents and inventory, cover legal and illegal lifecycle transitions,
  quantity overages, duplicate posting, concurrency, and reversal as relevant.
- For Prisma schema changes, include a reviewed migration, regenerated client,
  and disposable-database migration test. Never validate against production.
- Use `npm run db:migrate:status` for read-only migration status. Use
  `npm run db:migrate:deploy` only as an explicit deployment operation after
  verifying the target environment.
- Do not convert missing-table or missing-column errors into empty data or
  success; treat schema drift as a readiness failure.

## Full QA confirmation gate

- After focused checks pass, hand off the change with manual test steps and
  state that full QA/release readiness is pending.
- Wait for the user's explicit confirmation before broad repository QA. Do
  not run `npm run qa` before that confirmation.
- After confirmation, run the broader applicable checks and `npm run qa`.
  This repository's QA script includes production dependency audit, tests,
  ESLint, strict TypeScript, and production build.
- Report warnings, unavailable checks, migration risks, and unverified
  workflows honestly. Do not claim release readiness while a critical issue,
  failing quality gate, unresolved migration risk, or material test gap
  remains.
