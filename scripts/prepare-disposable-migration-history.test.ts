import { createRequire } from "node:module";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

type MigrationCompatibilityModule = {
  applyHistoricalCompatibilityPatches: (migrationsRoot: string) => void;
  copyMigrationTree: (sourcePrismaRoot: string, destinationPrismaRoot: string) => void;
  verifyDisposableDatabase: (env?: Record<string, string | undefined>) => void;
};

const require = createRequire(import.meta.url);
const {
  applyHistoricalCompatibilityPatches,
  copyMigrationTree,
  verifyDisposableDatabase,
} = require("./prepare-disposable-migration-history.cjs") as MigrationCompatibilityModule;

const malformedMigration = "20260919120000_add_reusable_size_group_links";
const collisionMigration = "20260921140000_add_segment_assignment_tags";
const duplicateMigration = "20260921160000_repair_version_business_type_tags";
const originalTagMigration = "20260921150000_add_version_module_tags";
const longIndexName = "version_business_type_segment_tags_version_business_type_segment_id_idx";
const temporaryDirectories: string[] = [];

function createMigrationRoot(): { prismaRoot: string; migrationsRoot: string } {
  const root = mkdtempSync(join(tmpdir(), "credencecraft-migration-test-"));
  temporaryDirectories.push(root);
  const prismaRoot = join(root, "prisma");
  const migrationsRoot = join(prismaRoot, "migrations");
  mkdirSync(migrationsRoot, { recursive: true });
  return { prismaRoot, migrationsRoot };
}

function writeMigration(migrationsRoot: string, name: string, sql: string): string {
  const migrationPath = join(migrationsRoot, name);
  mkdirSync(migrationPath, { recursive: true });
  const sqlPath = join(migrationPath, "migration.sql");
  writeFileSync(sqlPath, sql, "utf8");
  return sqlPath;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("disposable migration-history compatibility", () => {
  it("patches only the known historical defects in the temporary tree", () => {
    const { prismaRoot, migrationsRoot } = createMigrationRoot();
    const malformedSql = "nn-- CreateTable\nCREATE TABLE sample (id TEXT);\n";
    const collisionSql =
      `CREATE UNIQUE INDEX "version_business_type_segment_tags_version_business_type_segment_id_label_key" ON sample (id);\n`
      + `CREATE INDEX "${longIndexName}" ON sample (id);\n`;
    const duplicateSql = "CREATE TABLE version_business_type_tags (id TEXT);\n";

    writeMigration(migrationsRoot, malformedMigration, malformedSql);
    writeMigration(migrationsRoot, collisionMigration, collisionSql);
    writeMigration(migrationsRoot, originalTagMigration, duplicateSql);
    writeMigration(migrationsRoot, duplicateMigration, duplicateSql);

    const destinationRoot = join(prismaRoot, "..", "temporary-prisma-copy");
    copyMigrationTree(prismaRoot, destinationRoot);

    expect(readFileSync(join(migrationsRoot, malformedMigration, "migration.sql"), "utf8")).toBe(malformedSql);
    expect(readFileSync(join(destinationRoot, "migrations", malformedMigration, "migration.sql"), "utf8"))
      .toBe(malformedSql.replace("nn-- CreateTable", "-- CreateTable"));
    expect(readFileSync(join(destinationRoot, "migrations", collisionMigration, "migration.sql"), "utf8"))
      .toContain('CREATE INDEX "vbt_segment_tags_assignment_idx"');
    expect(readFileSync(join(destinationRoot, "migrations", duplicateMigration, "migration.sql"), "utf8"))
      .toMatch(/^-- Duplicate historical migration/m);
  });

  it("can prepare the checked-in history without modifying its source files", () => {
    const root = mkdtempSync(join(tmpdir(), "credencecraft-migration-copy-"));
    temporaryDirectories.push(root);
    const sourcePrismaRoot = resolve(process.cwd(), "prisma");
    const destinationPrismaRoot = join(root, "prisma");
    const sourceMalformed = readFileSync(join(sourcePrismaRoot, "migrations", malformedMigration, "migration.sql"), "utf8");

    copyMigrationTree(sourcePrismaRoot, destinationPrismaRoot);

    expect(readFileSync(join(sourcePrismaRoot, "migrations", malformedMigration, "migration.sql"), "utf8"))
      .toBe(sourceMalformed);
    expect(readFileSync(join(destinationPrismaRoot, "migrations", malformedMigration, "migration.sql"), "utf8"))
      .toMatch(/^-- CreateTable/);
    expect(readFileSync(join(destinationPrismaRoot, "migrations", duplicateMigration, "migration.sql"), "utf8"))
      .toMatch(/^-- Duplicate historical migration/m);
  });

  it("refuses to patch an unexpected malformed migration", () => {
    const { migrationsRoot } = createMigrationRoot();
    writeMigration(migrationsRoot, malformedMigration, "CREATE TABLE sample (id TEXT);\n");
    writeMigration(migrationsRoot, collisionMigration, `CREATE INDEX "${longIndexName}" ON sample (id);\n`);
    writeMigration(migrationsRoot, originalTagMigration, "CREATE TABLE source (id TEXT);\n");
    writeMigration(migrationsRoot, duplicateMigration, "CREATE TABLE unrelated (id TEXT);\n");

    expect(() => applyHistoricalCompatibilityPatches(migrationsRoot))
      .toThrow(`Unexpected contents in historical migration ${malformedMigration}`);
  });

  it("refuses to skip a duplicate migration unless its predecessor has identical SQL", () => {
    const { migrationsRoot } = createMigrationRoot();
    writeMigration(migrationsRoot, malformedMigration, "nn-- CreateTable\n");
    writeMigration(migrationsRoot, collisionMigration, `CREATE INDEX "${longIndexName}" ON sample (id);\n`);
    writeMigration(migrationsRoot, originalTagMigration, "CREATE TABLE source (id TEXT);\n");
    writeMigration(migrationsRoot, duplicateMigration, "CREATE TABLE unrelated (id TEXT);\n");

    expect(() => applyHistoricalCompatibilityPatches(migrationsRoot))
      .toThrow(`Historical migration ${duplicateMigration} no longer matches its predecessor`);
  });

  it("allows only CI loopback PostgreSQL targets", () => {
    expect(() => verifyDisposableDatabase({
      CI: "true",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/credencecraft_migrations",
      DIRECT_URL: "postgresql://postgres:postgres@127.0.0.1:5432/credencecraft_migrations",
    })).not.toThrow();

    expect(() => verifyDisposableDatabase({
      CI: "true",
      DATABASE_URL: "postgresql://postgres:secret@remote.example/production",
    })).toThrow("Refusing disposable migration replay unless every database URL targets loopback PostgreSQL.");
    expect(() => verifyDisposableDatabase({
      CI: "false",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/test",
    })).toThrow("restricted to CI disposable databases");
  });
});
