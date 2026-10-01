import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

type MigrationResult = { code: number; output: string };
type MigrationRetryModule = {
  getPrismaCliPath: () => string;
  isAdvisoryLockTimeout: (output: string) => boolean;
  runMigrationsWithRetry: (
    run: () => Promise<MigrationResult>,
    sleep: (milliseconds: number) => Promise<void>,
    logger: { warn: (message: string) => void; error: (message: string) => void },
  ) => Promise<number>;
};

const require = createRequire(import.meta.url);
const { getPrismaCliPath, isAdvisoryLockTimeout, runMigrationsWithRetry } = require("./deploy-prisma-migrations.cjs") as MigrationRetryModule;
const lockTimeout = "Error: P1002. Context: Timed out trying to acquire a postgres advisory lock.";

describe("Prisma migration lock retry", () => {
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

    await expect(runMigrationsWithRetry(run, sleep, logger)).resolves.toBe(0);

    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("does not retry unrelated migration failures", async () => {
    const run = vi.fn<() => Promise<MigrationResult>>()
      .mockResolvedValue({ code: 1, output: "Error: P3009 migration failed." });
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);

    await expect(runMigrationsWithRetry(run, sleep, { warn: vi.fn(), error: vi.fn() })).resolves.toBe(1);

    expect(run).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("fails after five consecutive advisory-lock timeouts", async () => {
    const run = vi.fn<() => Promise<MigrationResult>>().mockResolvedValue({ code: 1, output: lockTimeout });
    const sleep = vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined);
    const logger = { warn: vi.fn(), error: vi.fn() };

    await expect(runMigrationsWithRetry(run, sleep, logger)).resolves.toBe(1);

    expect(run).toHaveBeenCalledTimes(5);
    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2000, 4000, 8000, 16000]);
    expect(logger.error).toHaveBeenCalledOnce();
  });
});
