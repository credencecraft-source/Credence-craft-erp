import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type MigrationResult = {
  code: number;
  output: string;
  systemErrorCode?: string;
  exitStatus?: number | null;
  signal?: string | null;
};
type MigrationRetryModule = {
  baselinePreviewMigrationHistory: (options?: {
    env?: Record<string, string | undefined>;
    logger?: { log: (message: string) => void; error: (message: string) => void };
    migrationsPath?: string;
    run?: (args: string[]) => MigrationResult;
    readFailureDetails?: () => Promise<Array<{
      migrationName: string;
      prismaCode?: string;
      databaseCode?: string;
    }>>;
  }) => Promise<number>;
  getPrismaCliPath: () => string;
  getMigrationNames: (migrationsPath?: string) => string[];
  getSchemaDiffSummary: (sql: string, limit?: number) => string[];
  isSafeSchemaBaselineDiff: (sql: string) => boolean;
  isAdvisoryLockTimeout: (output: string) => boolean;
  runMigrationsWithRetry: (
    run: () => Promise<MigrationResult>,
    sleep: (milliseconds: number) => Promise<void>,
    logger: { warn: (message: string) => void; error: (message: string) => void },
    verify?: () => void,
    baseline?: () => number,
  ) => Promise<number>;
};

const require = createRequire(import.meta.url);
const {
  baselinePreviewMigrationHistory,
  getMigrationNames,
  getSchemaDiffSummary,
  getPrismaCliPath,
  isAdvisoryLockTimeout,
  isSafeSchemaBaselineDiff,
  runMigrationsWithRetry,
} = require("./deploy-prisma-migrations.cjs") as MigrationRetryModule;
const lockTimeout = "Error: P1002. Context: Timed out trying to acquire a postgres advisory lock.";

describe("Prisma Preview schema baseline", () => {
  it("only allows extra legacy table drops in the read-only schema diff", () => {
    expect(isSafeSchemaBaselineDiff("")).toBe(true);
    expect(isSafeSchemaBaselineDiff('-- DropTable\nDROP TABLE "legacy_table";')).toBe(true);
    expect(isSafeSchemaBaselineDiff('ALTER TABLE "organizations" DROP COLUMN "legacy";')).toBe(false);
    expect(isSafeSchemaBaselineDiff('CREATE TABLE "missing_table" ("id" TEXT);')).toBe(false);
  });

  it("summarizes schema differences without exposing SQL values", () => {
    expect(getSchemaDiffSummary(
      'ALTER TABLE "public"."organization" ADD COLUMN "private_field" TEXT DEFAULT \'sensitive\'; '
      + 'ALTER TABLE "platform_version_module_tags" DROP CONSTRAINT "legacy_relation"; '
      + 'CREATE INDEX "organization_idx" ON "organization"("id");',
    )).toEqual([
      "ALTER TABLE organization ADD COLUMN private_field",
      "ALTER TABLE platform_version_module_tags DROP CONSTRAINT legacy_relation",
      "CREATE INDEX organization_idx",
    ]);
  });

  it("marks the known migration history only after an empty schema diff", async () => {
    const migrationsPath = "prisma/migrations";
    const migrationNames = getMigrationNames(migrationsPath);
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "Error: P3005" })
      .mockReturnValueOnce({ code: 0, output: "-- This is an empty migration." })
      .mockReturnValue({ code: 0, output: "" });
    const logger = { log: vi.fn(), error: vi.fn() };

    await expect(baselinePreviewMigrationHistory({
      env: {
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://pooled/sandbox",
        DATABASE_URL_UNPOOLED: "postgresql://direct/sandbox",
      },
      logger,
      migrationsPath,
      run,
    })).resolves.toBe(0);

    expect(run).toHaveBeenCalledTimes(migrationNames.length + 2);
    expect(run).toHaveBeenNthCalledWith(1, ["migrate", "status"]);
    expect(run).toHaveBeenNthCalledWith(2, [
      "migrate",
      "diff",
      "--from-url",
      "postgresql://direct/sandbox",
      "--to-schema-datamodel",
      expect.any(String),
      "--script",
    ]);
    expect(run).toHaveBeenNthCalledWith(3, ["migrate", "resolve", "--applied", migrationNames[0]]);
  });

  it("refuses to baseline when the schema diff contains a required change", async () => {
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "Error: P3005" })
      .mockReturnValueOnce({ code: 0, output: 'CREATE TABLE "missing_table" ("id" TEXT);' });
    const logger = { log: vi.fn(), error: vi.fn() };

    await expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger,
      run,
    })).resolves.toBe(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      "[SANDBOX_BASELINE_SCHEMA_DRIFT] Schema-only sandbox differs beyond extra legacy tables; refusing to baseline migration history. Changes: CREATE TABLE missing_table.",
    );
  });

  it("does not baseline failed migration states or non-Preview environments", async () => {
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({
        code: 1,
        output: "Error: P1001 at postgresql://private.example/database",
      });
    const logger = { log: vi.fn(), error: vi.fn() };

    await expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger,
      run,
      readFailureDetails: vi.fn().mockResolvedValue([]),
    })).resolves.toBe(1);
    await expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "production", DATABASE_URL: "postgresql://production/db" },
      run,
    })).resolves.toBe(0);
    expect(run).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      "[SANDBOX_BASELINE_STATUS_FAILED] Refusing to baseline sandbox history (Prisma P1001).",
    );
  });

  it("recognizes a non-empty schema even when Prisma omits P3005", async () => {
    const migrationsPath = "prisma/migrations";
    const migrationNames = getMigrationNames(migrationsPath);
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "The database schema is not empty." })
      .mockReturnValueOnce({ code: 0, output: "" })
      .mockReturnValue({ code: 0, output: "" });

    await expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger: { log: vi.fn(), error: vi.fn() },
      migrationsPath,
      run,
    })).resolves.toBe(0);
    expect(run).toHaveBeenCalledTimes(migrationNames.length + 2);
  });

  it("reports only safe failed-migration identifiers and database codes", async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const readFailureDetails = vi.fn().mockResolvedValue([{
      migrationName: "20260910000200_add_business_type_module_key",
      databaseCode: "23502",
    }]);

    await expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger,
      run: vi.fn().mockReturnValue({ code: 1, output: "Migration failed." }),
      readFailureDetails,
    })).resolves.toBe(1);

    expect(logger.error).toHaveBeenCalledWith(
      "[SANDBOX_BASELINE_STATUS_FAILED] Refusing to baseline sandbox history (database 23502; migration 20260910000200_add_business_type_module_key).",
    );
    expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining("postgresql://"));
  });

  it("recovers only the known duplicate-table init failure after a safe schema diff", async () => {
    const migrationsPath = "prisma/migrations";
    const migrationNames = getMigrationNames(migrationsPath);
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "Failed migration status." })
      .mockReturnValueOnce({ code: 0, output: "-- Empty diff." })
      .mockReturnValue({ code: 0, output: "" });

    await expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger: { log: vi.fn(), error: vi.fn() },
      migrationsPath,
      run,
      readFailureDetails: vi.fn().mockResolvedValue([{
        migrationName: "20260901060317_init",
        databaseCode: "42P07",
      }]),
    })).resolves.toBe(0);

    expect(run).toHaveBeenCalledTimes(migrationNames.length + 3);
    expect(run).toHaveBeenNthCalledWith(3, [
      "migrate",
      "resolve",
      "--rolled-back",
      "20260901060317_init",
    ]);
    expect(run).toHaveBeenNthCalledWith(4, [
      "migrate",
      "resolve",
      "--applied",
      migrationNames[0],
    ]);
  });

  it("does not clear a failed migration before validating the complete schema diff", async () => {
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "Failed migration status." })
      .mockReturnValueOnce({ code: 0, output: 'ALTER TABLE "organizations" DROP COLUMN "name";' });
    const logger = { log: vi.fn(), error: vi.fn() };

    await expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger,
      run,
      readFailureDetails: vi.fn().mockResolvedValue([{
        migrationName: "20260901060317_init",
        databaseCode: "42P07",
      }]),
    })).resolves.toBe(1);

    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      "[SANDBOX_BASELINE_SCHEMA_DRIFT] Schema-only sandbox differs beyond extra legacy tables; refusing to baseline migration history. Changes: ALTER TABLE organizations DROP COLUMN name.",
    );
  });
});

describe("Prisma migration lock retry", () => {
  it("verifies the deployment database before attempting a migration", async () => {
    const run = vi.fn<() => Promise<MigrationResult>>();
    const verify = vi.fn(() => {
      throw new Error("Unverified sandbox database.");
    });

    await expect(
      runMigrationsWithRetry(
        run,
        vi.fn().mockResolvedValue(undefined),
        { warn: vi.fn(), error: vi.fn() },
        verify,
        vi.fn(() => 0),
      ),
    ).rejects.toThrow("Unverified sandbox database.");

    expect(verify).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("resolves Prisma's declared CLI executable", () => {
    expect(existsSync(getPrismaCliPath())).toBe(true);
  });

  it("recognizes only advisory-lock P1002 timeouts", () => {
    expect(isAdvisoryLockTimeout(lockTimeout)).toBe(true);
    expect(isAdvisoryLockTimeout("Error: P1002 database server was reached but timed out.")).toBe(false);
    expect(isAdvisoryLockTimeout("Error: P3009 migration failed.")).toBe(false);
  });

  it("retries a lock timeout and succeeds when the lock becomes available", async () => {
    const run = vi.fn<() => Promise<MigrationResult>>()
      .mockResolvedValueOnce({ code: 1, output: lockTimeout })
      .mockResolvedValueOnce({ code: 0, output: "All migrations have been applied." });
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const logger = { warn: vi.fn(), error: vi.fn() };

    await expect(runMigrationsWithRetry(run, sleep, logger, undefined, vi.fn(() => 0))).resolves.toBe(0);

    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not retry unrelated migration failures", async () => {
    const run = vi.fn<() => Promise<MigrationResult>>()
      .mockResolvedValue({ code: 1, output: "Error: P3009 migration failed." });
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(runMigrationsWithRetry(
      run,
      sleep,
      { warn: vi.fn(), error: vi.fn() },
      undefined,
      vi.fn(() => 0),
    )).resolves.toBe(1);

    expect(run).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("fails after five consecutive advisory-lock timeouts", async () => {
    const run = vi.fn<() => Promise<MigrationResult>>().mockResolvedValue({ code: 1, output: lockTimeout });
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const logger = { warn: vi.fn(), error: vi.fn() };

    await expect(runMigrationsWithRetry(run, sleep, logger, undefined, vi.fn(() => 0))).resolves.toBe(1);

    expect(run).toHaveBeenCalledTimes(5);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2000, 4000, 8000, 16000]);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
