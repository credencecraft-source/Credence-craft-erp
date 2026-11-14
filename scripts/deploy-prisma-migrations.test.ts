import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type MigrationResult = { code: number; output: string };
type MigrationRetryModule = {
  baselinePreviewMigrationHistory: (options?: {
    env?: Record<string, string | undefined>;
    logger?: { log: (message: string) => void; error: (message: string) => void };
    migrationsPath?: string;
    run?: (args: string[]) => MigrationResult;
  }) => number;
  getPrismaCliPath: () => string;
  getMigrationNames: (migrationsPath?: string) => string[];
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

  it("marks the known migration history only after an empty schema diff", () => {
    const migrationsPath = "prisma/migrations";
    const migrationNames = getMigrationNames(migrationsPath);
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "Error: P3005" })
      .mockReturnValueOnce({ code: 0, output: "-- This is an empty migration." })
      .mockReturnValue({ code: 0, output: "" });
    const logger = { log: vi.fn(), error: vi.fn() };

    expect(baselinePreviewMigrationHistory({
      env: {
        VERCEL_ENV: "preview",
        DATABASE_URL: "postgresql://pooled/sandbox",
        DATABASE_URL_UNPOOLED: "postgresql://direct/sandbox",
      },
      logger,
      migrationsPath,
      run,
    })).toBe(0);

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

  it("refuses to baseline when the schema diff contains a required change", () => {
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "Error: P3005" })
      .mockReturnValueOnce({ code: 0, output: 'CREATE TABLE "missing_table" ("id" TEXT);' });
    const logger = { log: vi.fn(), error: vi.fn() };

    expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger,
      run,
    })).toBe(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it("does not baseline failed migration states or non-Preview environments", () => {
    const run = vi.fn<(args: string[]) => MigrationResult>()
      .mockReturnValueOnce({ code: 1, output: "Error: P3009" });

    expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://sandbox/db" },
      logger: { log: vi.fn(), error: vi.fn() },
      run,
    })).toBe(1);
    expect(baselinePreviewMigrationHistory({
      env: { VERCEL_ENV: "production", DATABASE_URL: "postgresql://production/db" },
      run,
    })).toBe(0);
    expect(run).toHaveBeenCalledOnce();
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
