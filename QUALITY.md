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
- A GitHub `push` check runs after the push, not before it. Require the `ERP Quality / quality` status check in the `test-branch` branch-protection ruleset to block merging until QA passes.
- The `Neon Sandbox` workflow provisions a schema-only Preview branch and synchronizes branch-specific Vercel Preview variables for pushes to `test-branch` and same-repository pull requests targeting it. Preview migration deployment fails closed unless the current Vercel Git ref has verified non-primary Neon sandbox metadata.
- Run `npm run qa` locally when you need to reproduce or investigate the complete CI quality gate.
- Do not add `.next/dev/types/**/*.ts` to `tsconfig.json`; it is generated development output and can become invalid while Next.js is running.
- Stop `npm run dev` before running `npm run build` on Windows so Prisma can replace its query engine cleanly.
- Keep database changes paired with a Prisma migration and verify the migration against a disposable database before release.
- Every API mutation must authenticate the session, verify organization membership, validate input, and scope database reads and writes to the authorized organization.
- Add a focused regression test for every fixed production bug.

GitHub Actions runs the same `npm run qa` command for pushes and pull requests targeting `main` and `test-branch`.