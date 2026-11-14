import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { verifySandboxDatabase } = require("./verify-sandbox-db.js") as {
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
  NEON_BRANCH_ID: "br-cool-pond-123",
  NEON_BRANCH_NAME: "credencecraft-sandbox-test-branch",
  NEON_BRANCH_PRIMARY: "false",
  NEON_PROJECT_ID: "silent-tree-123",
  NEON_SANDBOX_VERIFIED: "true",
  NEON_VERCEL_BRANCH_REF: "test-branch",
  DATABASE_URL: "postgresql://sandbox.example/db",
};

describe("sandbox database migration guard", () => {
  it("allows local and production migration paths without inspecting database URLs", () => {
    expect(verifySandboxDatabase({}).skipped).toBe(true);
    expect(verifySandboxDatabase({ VERCEL_ENV: "production" }).skipped).toBe(true);
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
      branchName: "credencecraft-sandbox-test-branch",
    });
  });

  it.each([
    ["missing identity", { ...validPreview, NEON_BRANCH_ID: "" }],
    ["primary branch", { ...validPreview, NEON_BRANCH_PRIMARY: "true" }],
    ["unverified metadata", { ...validPreview, NEON_SANDBOX_VERIFIED: "false" }],
    ["branch mismatch", { ...validPreview, NEON_VERCEL_BRANCH_REF: "other-branch" }],
    ["unapproved name", { ...validPreview, NEON_BRANCH_NAME: "production" }],
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
