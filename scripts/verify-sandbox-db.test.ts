import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isFreshSandboxBranchSchemaSyncAllowed, verifySandboxDatabase } = require("./verify-sandbox-db.js") as {
  isFreshSandboxBranchSchemaSyncAllowed: (env?: Record<string, string | undefined>) => boolean;
  verifySandboxDatabase: (env?: Record<string, string | undefined>) => {
    skipped: boolean;
    branchId?: string;
    branchName?: string;
    projectId?: string;
  };
};

const validPreview = {
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "test-branch",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  NEON_BRANCH_ID: "br-cool-pond-123",
  NEON_BRANCH_NAME: "credencecraft-sandbox-test-branch-12345-1",
  NEON_BRANCH_PRIMARY: "false",
  NEON_PROJECT_ID: "silent-tree-123",
  NEON_SANDBOX_GIT_SHA: "a".repeat(40),
  NEON_SANDBOX_SCHEMA_SYNC_ALLOWED: "true",
  NEON_SANDBOX_VERIFIED: "true",
  NEON_VERCEL_BRANCH_REF: "test-branch",
  DATABASE_URL: "postgresql://sandbox.example/db",
};

describe("sandbox database migration guard", () => {
  it("allows local and production migration paths without inspecting database URLs", () => {
    expect(verifySandboxDatabase({}).skipped).toBe(true);
    expect(verifySandboxDatabase({ VERCEL_ENV: "production" }).skipped).toBe(true);
  });

  it("accepts a fresh unique PR sandbox branch scoped to its Preview ref", () => {
    expect(verifySandboxDatabase({
      ...validPreview,
      NEON_BRANCH_NAME: "credencecraft-sandbox-pr-12-12345-1",
      VERCEL_GIT_COMMIT_REF: "feature-branch",
      NEON_VERCEL_BRANCH_REF: "feature-branch",
    })).toMatchObject({
      skipped: false,
      branchName: "credencecraft-sandbox-pr-12-12345-1",
    });
  });

  it("rejects USE_DEV_USER_STORE in any deployed Vercel environment", () => {
    expect(() => verifySandboxDatabase({
      VERCEL_ENV: "preview",
      USE_DEV_USER_STORE: "true",
    })).toThrow("USE_DEV_USER_STORE");
    expect(() => verifySandboxDatabase({
      VERCEL_ENV: "production",
      USE_DEV_USER_STORE: "true",
    })).toThrow("USE_DEV_USER_STORE");
  });

  it("accepts a verified non-primary branch scoped to the current Preview branch", () => {
    expect(verifySandboxDatabase(validPreview)).toEqual({
      skipped: false,
      projectId: "silent-tree-123",
      branchId: "br-cool-pond-123",
      branchName: "credencecraft-sandbox-test-branch-12345-1",
    });
  });

  it("allows schema sync only for a newly-created sandbox Preview with matching commit metadata", () => {
    expect(isFreshSandboxBranchSchemaSyncAllowed(validPreview)).toBe(true);
    expect(isFreshSandboxBranchSchemaSyncAllowed({
      ...validPreview,
      NEON_SANDBOX_GIT_SHA: "b".repeat(40),
    })).toBe(false);
    expect(isFreshSandboxBranchSchemaSyncAllowed({
      ...validPreview,
      NEON_BRANCH_NAME: "credencecraft-sandbox-pr-12-12345-1",
      VERCEL_GIT_COMMIT_REF: "feature-branch",
      NEON_VERCEL_BRANCH_REF: "feature-branch",
    })).toBe(true);
    expect(isFreshSandboxBranchSchemaSyncAllowed({
      ...validPreview,
      NEON_SANDBOX_SCHEMA_SYNC_ALLOWED: "false",
    })).toBe(false);
    expect(isFreshSandboxBranchSchemaSyncAllowed({
      ...validPreview,
      NEON_BRANCH_NAME: "credencecraft-sandbox-pr-12",
      VERCEL_GIT_COMMIT_REF: "feature-branch",
      NEON_VERCEL_BRANCH_REF: "feature-branch",
    })).toBe(false);
  });

  it.each([
    ["missing identity", { ...validPreview, NEON_BRANCH_ID: "" }],
    ["primary branch", { ...validPreview, NEON_BRANCH_PRIMARY: "true" }],
    ["unverified metadata", { ...validPreview, NEON_SANDBOX_VERIFIED: "false" }],
    ["branch mismatch", { ...validPreview, NEON_VERCEL_BRANCH_REF: "other-branch" }],
    ["unapproved name", { ...validPreview, NEON_BRANCH_NAME: "production" }],
    ["deployment commit mismatch", { ...validPreview, NEON_SANDBOX_GIT_SHA: "b".repeat(40) }],
    ["missing database URL", { ...validPreview, DATABASE_URL: "" }],
  ])("blocks a Preview migration for %s", (_case, env) => {
    expect(() => verifySandboxDatabase(env)).toThrow("refusing to run migrations");
  });

  it("rejects unknown Vercel deployment environments", () => {
    expect(() => verifySandboxDatabase({ VERCEL_ENV: "staging" })).toThrow(
      "Unknown Vercel deployment environment",
    );
  });
});
