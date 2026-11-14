const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { verifySandboxDatabase } = require("./verify-sandbox-db.js");

const MAX_ATTEMPTS = 5;
const MIGRATIONS_PATH = path.resolve(__dirname, "..", "prisma", "migrations");
const SCHEMA_PATH = path.resolve(__dirname, "..", "prisma");

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
  };
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

function baselinePreviewMigrationHistory({
  env = process.env,
  logger = console,
  migrationsPath = MIGRATIONS_PATH,
  run = runPrismaCli,
} = {}) {
  if (env.VERCEL_ENV?.trim() !== "preview") return 0;

  const status = run(["migrate", "status"]);
  if (status.code === 0) return 0;
  if (!status.output.includes("P3005")) {
    logger.error("[SANDBOX_BASELINE_STATUS_FAILED] Refusing to baseline sandbox history.");
    return status.code || 1;
  }

  const migrationUrl = env.DIRECT_URL?.trim()
    || env.DATABASE_URL_UNPOOLED?.trim()
    || env.DATABASE_URL?.trim();
  if (!migrationUrl) {
    logger.error("[SANDBOX_BASELINE_DATABASE_URL_MISSING] Refusing to baseline sandbox history.");
    return 1;
  }

  const diff = run([
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

  for (const migrationName of migrations) {
    const result = run(["migrate", "resolve", "--applied", migrationName]);
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

  const baselineCode = baseline();
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
