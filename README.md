This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Expo web preview

The local development server allows credentialed API requests from HTTP
`localhost` and `127.0.0.1` origins so the Expo web preview can use the local
ERP session. For a production-hosted web preview, set
`EXPO_WEB_ALLOWED_ORIGINS` to a comma-separated list of exact HTTPS origins.
Do not use `*`; credentialed requests require an explicit origin.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Production Requirements

- Set `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and a strong `AUTH_SECRET` in the deployment environment.
- Never set `USE_DEV_USER_STORE=true` in production. The application only permits the development user store outside production.
- Apply migrations before starting the application:

```bash
npm run db:migrate:deploy
npm run build
npm start
```

The development server regenerates Prisma Client from the current schema before starting. Stop any existing development server before restarting after Prisma schema changes so it releases the Prisma engine file and loads the newly generated client.

- Database connection strings and usernames are encrypted with `AUTH_SECRET`. Rotate `AUTH_SECRET` only with a planned credential re-encryption procedure.
- Order numbers use a tenant-scoped atomic counter. The migration initializes counters from existing numeric `OD-*` order numbers and leaves nonconforming legacy order numbers untouched.
- Platform administrators are never provisioned by a public login or OTP request. After migrations are applied, create the first administrator from a trusted one-time operator environment with `PLATFORM_ADMIN_EMAIL`, optional `PLATFORM_ADMIN_NAME`, and run `npm run platform:bootstrap-admin`. The command stores only a random unusable password hash and refuses to run if any administrator already exists. Platform access uses email verification codes; the legacy password-login API returns `410 Gone`.
- Platform administrators can optionally enable private copies of customer sign-in, registration, and mobile sign-in OTPs to `credencecraft@gmail.com` in Platform → Workspace Users. Mobile sign-in OTPs are delivered to the registered user's verified email; the setting is off by default and does not copy platform support OTPs.

## Vercel Preview And Production

- Connect the GitHub repository to Vercel and set `test-branch` as the Preview branch. Keep `main` as the Production branch.
- Configure `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (or `DIRECT_URL`), and `AUTH_SECRET` separately for Preview and Production. Use separate databases; Preview migrations must never target the production database.
- The `Neon Sandbox` GitHub Actions workflow creates/reuses a schema-only Neon branch for pushes to `test-branch` and same-repository pull requests targeting it. It validates Neon branch metadata before writing branch-specific Preview connection variables to Vercel. Pull-request sandbox branches and their Preview variables are removed when the pull request closes. No production data is copied into these schema-only branches.
- To enable the workflow, add these repository-level secrets under **GitHub → Settings → Secrets and variables → Actions → New repository secret**:
  - `NEON_API_KEY`: a Neon API key authorized to create and inspect branches in the Neon project.
  - `NEON_PROJECT_ID`: the Neon project ID.
  - `VERCEL_TOKEN`: a Vercel token authorized to manage environment variables and create Preview deployments for the target project.
  - `VERCEL_ORG_ID`: the Vercel team/organization ID used as the API `teamId`.
  - `VERCEL_PROJECT_ID`: the Vercel project ID.
- Keep `NEON_API_KEY` and `VERCEL_TOKEN` in GitHub Actions secrets only; the workflow does not place these API tokens in Vercel. It writes branch-scoped `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and `DIRECT_URL` values, plus non-secret Neon branch identity markers, for the matching Preview Git ref. Keep `AUTH_SECRET` configured separately in Vercel Preview and Production. Do not configure `USE_DEV_USER_STORE=true` in either deployed environment.
- Before enabling the workflow, ensure the Vercel project is linked to this repository and its Preview environment is configured. The workflow explicitly creates a Vercel Preview deployment after synchronizing its branch variables. If Vercel's Git integration also starts a deployment before synchronization completes, the migration safety check fails closed before Prisma runs; the workflow-created deployment follows with verified variables.
- The migration guard verifies the Vercel Preview ref against the Neon branch identity and the non-primary verification marker written only after the workflow checks Neon’s API. It intentionally does not read or print `DATABASE_URL` values. Keep the workflow-managed branch-specific connection variables together; out-of-band edits to those values cannot be independently checked without reading the protected URLs.
- `ERP Quality` runs `npm run qa` on pushes and pull requests targeting `main` and `test-branch`. A GitHub `push` workflow runs after the push, not before it. To block merges until QA passes, configure GitHub branch protection/rulesets to require the `ERP Quality / quality` check on `test-branch`; also protect `main` against direct pushes. The local pre-push hook documented in `QUALITY.md` only restricts the push destination.
- Add SMTP variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`) to the environments that send email; these settings take precedence over Platform → Email and OTP delivery and can restore OTP delivery without platform login. `SMTP_FROM_NAME` is optional and defaults to `Credence Craft`. For Gmail use the Gmail SMTP host, port 587 (STARTTLS) or 465 (TLS), the account email as `SMTP_USER`/`SMTP_FROM`, and a Google App Password as `SMTP_PASS`. Set all five required variables together; partial deployment SMTP configuration fails explicitly instead of falling back to stored credentials. Add `GSTIN_API_KEY` only when GST lookup is enabled.
- Do not add `USE_DEV_USER_STORE` to Vercel. If it exists in a local environment, keep it false for deployed environments.
- `vercel.json` runs `prisma migrate deploy` before the production build. Review every migration against the Preview database before merging to `main`.
