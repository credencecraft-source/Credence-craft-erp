# Database and migration difference

**Active rule —** Active instructions require reviewed migrations, generated
client, disposable-database checks, migration-before-serving deployment
ordering, read-only startup preflight with fail-fast behavior, centralized
release deployment, verification in each serving environment, and preserving
missing-schema error classification. Production migration writes are limited
to the approved release pipeline.

**Notes rule —** The QA note summarizes Prisma migration/client checks,
disposable-database verification, and centralized status/deploy commands.

**Difference —** The notes omit startup readiness behavior, full deployment
ordering/coverage, and missing-schema error handling detail. The active files
remain the complete requirements.
