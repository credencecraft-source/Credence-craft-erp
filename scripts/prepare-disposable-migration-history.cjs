const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { getPrismaCliPath } = require("./deploy-prisma-migrations.cjs");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");
const PRISMA_ROOT = path.join(REPOSITORY_ROOT, "prisma");
const MALFORMED_MIGRATION = "20260919120000_add_reusable_size_group_links";
const COLLIDING_INDEX_MIGRATION = "20260921140000_add_segment_assignment_tags";
const DUPLICATE_MIGRATION = "20260921160000_repair_version_business_type_tags";
const ORIGINAL_TAG_MIGRATION = "20260921150000_add_version_module_tags";
const LONG_SEGMENT_TAG_INDEX =
  "version_business_type_segment_tags_version_business_type_segment_id_idx";
const COMPATIBLE_SEGMENT_TAG_INDEX = "vbt_segment_tags_assignment_idx";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

function replaceExactlyOnce(sql, search, replacement, migrationName) {
  const firstIndex = sql.indexOf(search);
  if (firstIndex === -1 || sql.indexOf(search, firstIndex + search.length) !== -1) {
    throw new Error(`Unexpected contents in historical migration ${migrationName}; refusing compatibility replay.`);
  }
  return `${sql.slice(0, firstIndex)}${replacement}${sql.slice(firstIndex + search.length)}`;
}

function normalizeLineEndings(sql) {
  return sql.replace(/\r\n/g, "\n").replace(/\n+$/, "");
}

function applyHistoricalCompatibilityPatches(migrationsRoot) {
  const migrationFile = (name) => path.join(migrationsRoot, name, "migration.sql");

  const malformedPath = migrationFile(MALFORMED_MIGRATION);
  const malformedSql = fs.readFileSync(malformedPath, "utf8");
  fs.writeFileSync(
    malformedPath,
    replaceExactlyOnce(malformedSql, "nn-- CreateTable", "-- CreateTable", MALFORMED_MIGRATION),
    "utf8",
  );

  const collisionPath = migrationFile(COLLIDING_INDEX_MIGRATION);
  const collisionSql = fs.readFileSync(collisionPath, "utf8");
  fs.writeFileSync(
    collisionPath,
    replaceExactlyOnce(
      collisionSql,
      `CREATE INDEX "${LONG_SEGMENT_TAG_INDEX}"`,
      `CREATE INDEX "${COMPATIBLE_SEGMENT_TAG_INDEX}"`,
      COLLIDING_INDEX_MIGRATION,
    ),
    "utf8",
  );

  const duplicatePath = migrationFile(DUPLICATE_MIGRATION);
  const duplicateSql = fs.readFileSync(duplicatePath, "utf8");
  const originalSql = fs.readFileSync(migrationFile(ORIGINAL_TAG_MIGRATION), "utf8");
  if (normalizeLineEndings(duplicateSql) !== normalizeLineEndings(originalSql)) {
    throw new Error(`Historical migration ${DUPLICATE_MIGRATION} no longer matches its predecessor; refusing compatibility replay.`);
  }
  fs.writeFileSync(
    duplicatePath,
    "-- Duplicate historical migration; the prior migration created this table and its constraints.\n",
    "utf8",
  );
}

function copyMigrationTree(sourcePrismaRoot, destinationPrismaRoot) {
  const source = path.resolve(sourcePrismaRoot);
  const destination = path.resolve(destinationPrismaRoot);
  if (source === destination || destination.startsWith(`${source}${path.sep}`)) {
    throw new Error("Temporary migration tree must be outside the source Prisma directory.");
  }
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
  applyHistoricalCompatibilityPatches(path.join(destination, "migrations"));
}

function verifyDisposableDatabase(env = process.env) {
  if (env.CI?.trim().toLowerCase() !== "true") {
    throw new Error("Historical compatibility replay is restricted to CI disposable databases.");
  }

  const urls = ["DATABASE_URL", "DIRECT_URL"]
    .map((key) => env[key]?.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    throw new Error("A loopback PostgreSQL URL is required for disposable migration replay.");
  }

  for (const value of urls) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("A loopback PostgreSQL URL is required for disposable migration replay.");
    }

    if (!["postgres:", "postgresql:"].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error("Refusing disposable migration replay unless every database URL targets loopback PostgreSQL.");
    }
  }
}

async function restoreCanonicalMigrationChecksums(migrationsRoot) {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const migrationNames = [
    MALFORMED_MIGRATION,
    COLLIDING_INDEX_MIGRATION,
    DUPLICATE_MIGRATION,
  ];

  try {
    for (const migrationName of migrationNames) {
      const sql = fs.readFileSync(path.join(migrationsRoot, migrationName, "migration.sql"));
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const updated = await prisma.$executeRaw`
        UPDATE "_prisma_migrations"
        SET "checksum" = ${checksum}
        WHERE "migration_name" = ${migrationName}
          AND "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      `;
      if (updated !== 1) {
        throw new Error(`Could not verify completed disposable migration ${migrationName}.`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

function writeTemporaryPrismaConfig(configPath, prismaRoot) {
  const migrationsPath = path.join(prismaRoot, "migrations");
  const source = [
    'import { defineConfig } from "prisma/config";',
    "export default defineConfig({",
    `  schema: ${JSON.stringify(prismaRoot)},`,
    "  migrations: {",
    `    path: ${JSON.stringify(migrationsPath)},`,
    "  },",
    "  datasource: {",
    '    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",',
    "  },",
    "});",
    "",
  ].join("\n");
  fs.writeFileSync(configPath, source, { encoding: "utf8", flag: "wx" });
}

async function prepareDisposableMigrationHistory() {
  verifyDisposableDatabase();

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "credencecraft-migration-replay-"));
  const temporaryPrismaRoot = path.join(temporaryDirectory, "prisma");
  const temporaryConfigPath = path.join(REPOSITORY_ROOT, `.prisma-disposable-${process.pid}.config.ts`);

  try {
    copyMigrationTree(PRISMA_ROOT, temporaryPrismaRoot);
    writeTemporaryPrismaConfig(temporaryConfigPath, temporaryPrismaRoot);

    const result = spawnSync(process.execPath, [
      getPrismaCliPath(),
      "migrate",
      "deploy",
      "--config",
      temporaryConfigPath,
    ], {
      cwd: REPOSITORY_ROOT,
      env: process.env,
      stdio: "inherit",
    });

    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;

    await restoreCanonicalMigrationChecksums(path.join(PRISMA_ROOT, "migrations"));
    console.log("Replayed disposable migration history using temporary compatibility copies; source migrations remain unchanged.");
    return 0;
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    fs.rmSync(temporaryConfigPath, { force: true });
  }
}

if (require.main === module) {
  prepareDisposableMigrationHistory().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : "Disposable migration replay failed.");
    process.exitCode = 1;
  });
}

module.exports = {
  applyHistoricalCompatibilityPatches,
  copyMigrationTree,
  normalizeLineEndings,
  prepareDisposableMigrationHistory,
  replaceExactlyOnce,
  verifyDisposableDatabase,
};
