const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { verifySandboxDatabase } = require("./verify-sandbox-db.js");

const MAX_ATTEMPTS = 5;
const MIGRATIONS_PATH = path.resolve(__dirname, "..", "prisma", "migrations");
const SCHEMA_PATH = path.resolve(__dirname, "..", "prisma");
const KNOWN_SCHEMA_BASELINE_FAILURES = new Map([
  ["20260901060317_init", "42P07"],
]);

function isAdvisoryLockTimeout(output) {
  return output.includes("P1002")
    && /timed out trying to acquire a postgres advisory lock/i.test(output);
}

function getPrismaCliPath() {
  const packagePath = path.resolve(__dirname, "..", "node_modules", "prisma", "package.json");
  const prismaPackage = require(packagePath);
  const bin = typeof prismaPackage.bin === "string" ? prismaPackage.bin : prismaPackage.bin?.prisma;
  if (!bin) throw new Error("Prisma package does not declare a CLI executable.");
  return path.resolve(path.dirname(packagePath), bin);
}

function runPrismaCli(args) {
  const result = spawnSync(process.execPath, [getPrismaCliPath(), ...args], {
    encoding: "utf8",
  });

  return {
    code: result.status ?? 1,
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}${result.error?.message ?? ""}`,
    systemErrorCode: result.error?.code,
    exitStatus: result.status,
    signal: result.signal,
  };
}

async function readFailedMigrationDiagnostics() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const migrations = await prisma.$queryRaw`
      SELECT migration_name, logs
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `;
    return migrations.flatMap((migration) => {
      if (typeof migration.migration_name !== "string"
        || !/^[A-Za-z0-9_]{1,120}$/.test(migration.migration_name)) {
        return [];
      }

      const logs = typeof migration.logs === "string" ? migration.logs : "";
      return [{
        migrationName: migration.migration_name,
        prismaCode: logs.match(/\bP\d{4}\b/)?.[0],
        databaseCode: logs.match(/\b(?:Database error code|SQLSTATE):\s*([A-Z0-9]{5})\b/i)?.[1]?.toUpperCase(),
      }];
    });
  } finally {
    await prisma.$disconnect();
  }
}

function getMigrationNames(migrationsPath = MIGRATIONS_PATH) {
  return fs.readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(migrationsPath, entry.name, "migration.sql")))
    .map((entry) => entry.name)
    .sort();
}

function isSafeSchemaBaselineDiff(sql) {
  const statements = sql
    .replace(/--[^\r\n]*/g, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  return statements.every((statement) =>
    /^DROP TABLE (?:IF EXISTS )?(?:"[^"]+"\.)?"[^"]+"$/i.test(statement),
  );
}

async function baselinePreviewMigrationHistory({
  env = process.env,
  logger = console,
  migrationsPath = MIGRATIONS_PATH,
  run = runPrismaCli,
  readFailureDetails = readFailedMigrationDiagnostics,
} = {}) {
  if (env.VERCEL_ENV?.trim() !== "preview") return 0;

  const status = run(["migrate", "status"]);
  const statusResult = await status;
  if (statusResult.code === 0) return 0;
  const nonEmptySchema = /schema is not empty/i.test(statusResult.output);
  let failedMigrations = [];
  if (!statusResult.output.includes("P3005") && !nonEmptySchema) {
    let diagnosticPrismaCode;
    let diagnosticDatabaseCode;
    let diagnosticSystemCode;
    try {
      failedMigrations = await readFailureDetails();
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (typeof code === "string" && /^P\d{4}$/.test(code)) {
        diagnosticPrismaCode = code;
      } else if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
        diagnosticDatabaseCode = code;
      } else if (typeof code === "string" && /^[A-Z0-9_]{2,20}$/.test(code)) {
        diagnosticSystemCode = code;
      }
    }

    const knownFailedMigrations = failedMigrations.length > 0
      && failedMigrations.every((migration) =>
        KNOWN_SCHEMA_BASELINE_FAILURES.get(migration.migrationName) === migration.databaseCode,
      );
    if (!knownFailedMigrations) {
      const prismaCode = statusResult.output.match(/\bP\d{4}\b/)?.[0]
        ?? failedMigrations.find((migration) => migration.prismaCode)?.prismaCode
        ?? diagnosticPrismaCode;
      const databaseCode = statusResult.output.match(/\bDatabase error code:\s*([A-Z0-9]{5})\b/i)?.[1]
        ?? failedMigrations.find((migration) => migration.databaseCode)?.databaseCode
        ?? diagnosticDatabaseCode;
      const systemErrorCode = typeof statusResult.systemErrorCode === "string"
        && /^[A-Z0-9_]{2,20}$/.test(statusResult.systemErrorCode)
        ? statusResult.systemErrorCode
        : diagnosticSystemCode;
      const failedMigrationNames = failedMigrations
        .map((migration) => migration.migrationName)
        .filter((name) => /^[A-Za-z0-9_]{1,120}$/.test(name));
      const safeCode = prismaCode
        ? `Prisma ${prismaCode}`
        : databaseCode
          ? `database ${databaseCode}`
          : systemErrorCode
            ? `system ${systemErrorCode}`
            : "unknown";
      const details = [
        safeCode,
        ...failedMigrationNames.map((name) => `migration ${name}`),
      ];
      if (statusResult.exitStatus === null) {
        details.push(statusResult.signal
          ? `status process signal ${statusResult.signal}`
          : "status process did not exit normally");
      } else if (statusResult.exitStatus !== undefined) {
        details.push(`status process exit ${statusResult.exitStatus}`);
      }
      logger.error(`[SANDBOX_BASELINE_STATUS_FAILED] Refusing to baseline sandbox history (${details.join("; ")}).`);
      return statusResult.code || 1;
    }
  }

  const migrationUrl = env.DIRECT_URL?.trim()
    || env.DATABASE_URL_UNPOOLED?.trim()
    || env.DATABASE_URL?.trim();
  if (!migrationUrl) {
    logger.error("[SANDBOX_BASELINE_DATABASE_URL_MISSING] Refusing to baseline sandbox history.");
    return 1;
  }

  const diff = await run([
    "migrate",
    "diff",
    "--from-url",
    migrationUrl,
    "--to-schema-datamodel",
    SCHEMA_PATH,
    "--script",
  ]);
  if (diff.code !== 0 || !isSafeSchemaBaselineDiff(diff.output)) {
    logger.error(
      "[SANDBOX_BASELINE_SCHEMA_DRIFT] Schema-only sandbox differs beyond extra legacy tables; refusing to baseline migration history.",
    );
    return diff.code || 1;
  }

  const migrations = getMigrationNames(migrationsPath);
  if (migrations.length === 0) {
    logger.error("[SANDBOX_BASELINE_NO_MIGRATIONS] Refusing to baseline empty Prisma history.");
    return 1;
  }

  const failedMigrationNames = [...new Set(failedMigrations.map((migration) => migration.migrationName))];
  for (const migrationName of failedMigrationNames) {
    const result = await run(["migrate", "resolve", "--rolled-back", migrationName]);
    if (result.code !== 0) {
      logger.error("[SANDBOX_BASELINE_ROLLBACK_FAILED] Failed to clear a known failed migration record.");
      return result.code || 1;
    }
  }

  for (const migrationName of migrations) {
    const result = await run(["migrate", "resolve", "--applied", migrationName]);
    if (result.code !== 0) {
      logger.error("[SANDBOX_BASELINE_RESOLVE_FAILED] Failed to record Prisma migration history.");
      return result.code || 1;
    }
  }

  logger.log(`Baselined ${migrations.length} Prisma migrations against the verified Preview schema.`);
  return 0;
}

function runPrismaMigrateDeploy() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [getPrismaCliPath(), "migrate", "deploy"], {
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.once("error", (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    child.once("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function runMigrationsWithRetry(
  run = runPrismaMigrateDeploy,
  sleep = delay,
  logger = console,
  verify = verifySandboxDatabase,
  baseline = () => baselinePreviewMigrationHistory({ logger }),
) {
  verify();

  const baselineCode = await baseline();
  if (baselineCode !== 0) return baselineCode;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await run();
    if (result.code === 0) return 0;
    if (!isAdvisoryLockTimeout(result.output)) return result.code || 1;
    if (attempt === MAX_ATTEMPTS) {
      logger.error(`Prisma migration advisory lock remained busy after ${MAX_ATTEMPTS} attempts.`);
      return result.code || 1;
    }

    const waitMs = Math.min(2000 * (2 ** (attempt - 1)), 16000);
    logger.warn(`Prisma migration advisory lock is busy; retrying in ${waitMs / 1000}s (${attempt}/${MAX_ATTEMPTS - 1}).`);
    await sleep(waitMs);
  }

  return 1;
}

if (require.main === module) {
  runMigrationsWithRetry().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  baselinePreviewMigrationHistory,
  getPrismaCliPath,
  getMigrationNames,
  isSafeSchemaBaselineDiff,
  isAdvisoryLockTimeout,
  runMigrationsWithRetry,
};
