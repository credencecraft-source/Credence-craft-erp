# ERP Quality Gates

Run the complete local verification with:

```bash
npm run qa
```

The command checks production dependency advisories, ESLint, TypeScript, and the production Next.js build in that order.

## Development Rules

- Run focused tests and checks for the files you change during development.
- GitHub Actions runs `npm run qa` for pushes and pull requests targeting `main` or `test-branch`; review its result before merging.
- The local pre-push hook only enforces the allowed `test-branch` destination so pushes do not rerun the full quality suite.
- Run `npm run qa` locally when you need to reproduce or investigate the complete CI quality gate.
- Do not add `.next/dev/types/**/*.ts` to `tsconfig.json`; it is generated development output and can become invalid while Next.js is running.
- Stop `npm run dev` before running `npm run build` on Windows so Prisma can replace its query engine cleanly.
- Keep database changes paired with a Prisma migration and verify the migration against a disposable database before release.
- Every API mutation must authenticate the session, verify organization membership, validate input, and scope database reads and writes to the authorized organization.
- Add a focused regression test for every fixed production bug.

GitHub Actions runs the same `npm run qa` command for pushes and pull requests targeting `main` and `test-branch`.