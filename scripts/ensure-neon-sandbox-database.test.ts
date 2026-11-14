import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  DATABASE_NAME,
  ensureSandboxDatabase,
  writeWorkflowOutputs,
} = require("./ensure-neon-sandbox-database.cjs") as {
  DATABASE_NAME: string;
  ensureSandboxDatabase: (options: {
    env: Record<string, string>;
    fetchImpl: typeof fetch;
  }) => Promise<{ pooled: string; unpooled: string }>;
  writeWorkflowOutputs: (
    urls: { pooled: string; unpooled: string },
    env: Record<string, string>,
  ) => void;
};

const env = {
  NEON_API_KEY: "neon-test-token",
  NEON_BRANCH_ID: "br-cool-pond-123",
  NEON_BRANCH_NAME: "credencecraft-sandbox-test-branch",
  NEON_PROJECT_ID: "silent-tree-123",
  SANDBOX_DATABASE_URL: "postgresql://user:pass@pooler.example/neondb?sslmode=require",
  SANDBOX_DATABASE_URL_UNPOOLED: "postgresql://user:pass@direct.example/neondb?sslmode=require",
};

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("Neon sandbox migration database", () => {
  it("creates an isolated empty database in the verified branch and rewrites both URLs", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ databases: [{ name: "neondb" }] }))
      .mockResolvedValueOnce(response({
        database: {
          branch_id: env.NEON_BRANCH_ID,
          name: DATABASE_NAME,
          owner_name: "neondb_owner",
        },
      }, 201));

    await expect(ensureSandboxDatabase({ env, fetchImpl })).resolves.toEqual({
      pooled: `postgresql://user:pass@pooler.example/${DATABASE_NAME}?sslmode=require`,
      unpooled: `postgresql://user:pass@direct.example/${DATABASE_NAME}?sslmode=require`,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("GET");
    expect(fetchImpl.mock.calls[1][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      database: { name: DATABASE_NAME, owner_name: "neondb_owner" },
    });
  });

  it("reuses the expected database without making a write request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response({
      databases: [{
        branch_id: env.NEON_BRANCH_ID,
        name: DATABASE_NAME,
        owner_name: "neondb_owner",
      }],
    }));

    await expect(ensureSandboxDatabase({ env, fetchImpl })).resolves.toMatchObject({
      pooled: expect.stringContaining(`/${DATABASE_NAME}?`),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects unverified branches and unexpected database ownership", async () => {
    await expect(ensureSandboxDatabase({
      env: { ...env, NEON_BRANCH_NAME: "production" },
      fetchImpl: vi.fn<typeof fetch>(),
    })).rejects.toThrow("unverified Neon sandbox branch");

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response({
      databases: [{
        branch_id: env.NEON_BRANCH_ID,
        name: DATABASE_NAME,
        owner_name: "unexpected_owner",
      }],
    }));

    await expect(ensureSandboxDatabase({ env, fetchImpl })).rejects.toThrow(
      "unexpected ownership or branch identity",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("writes the database URLs to the GitHub step output file", () => {
    const directory = mkdtempSync(join(tmpdir(), "neon-sandbox-output-"));
    const outputPath = join(directory, "outputs");

    try {
      writeWorkflowOutputs(
        { pooled: "postgresql://pooled.example/db", unpooled: "postgresql://direct.example/db" },
        { GITHUB_OUTPUT: outputPath },
      );

      expect(readFileSync(outputPath, "utf8")).toBe(
        "SANDBOX_DATABASE_URL=postgresql://pooled.example/db\n"
        + "SANDBOX_DATABASE_URL_UNPOOLED=postgresql://direct.example/db\n",
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
