import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const {
  getPreviewVariables,
  removeBranchVariables,
  upsertBranchVariables,
} = require("./sync-vercel-preview-env.cjs") as {
  getPreviewVariables: (env: Record<string, string>) => Array<{
    key: string;
    value: string;
    type: string;
    visibility: string;
    target: string[];
    gitBranch: string;
  }>;
  removeBranchVariables: (options: {
    env: Record<string, string>;
    fetchImpl: typeof fetch;
  }) => Promise<number>;
  upsertBranchVariables: (options: {
    env: Record<string, string>;
    fetchImpl: typeof fetch;
    projectId: string;
    teamId: string;
    token: string;
  }) => Promise<string[]>;
};

const env = {
  SANDBOX_VERCEL_BRANCH_REF: "test-branch",
  SANDBOX_DATABASE_URL: "postgresql://pooled.example/db",
  SANDBOX_DATABASE_URL_UNPOOLED: "postgresql://direct.example/db",
  NEON_BRANCH_ID: "br-cool-pond-123",
  NEON_BRANCH_NAME: "credencecraft-sandbox-test-branch",
  NEON_PROJECT_ID: "silent-tree-123",
  VERCEL_PROJECT_ID: "prj_test",
  VERCEL_ORG_ID: "team_test",
  VERCEL_TOKEN: "vercel-test-token",
};

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("Vercel Preview environment synchronization", () => {
  it("creates sensitive connection variables and branch-scoped verification metadata", () => {
    const variables = getPreviewVariables(env);
    const pooled = variables.find((variable) => variable.key === "DATABASE_URL");
    const direct = variables.find((variable) => variable.key === "DIRECT_URL");
    const metadata = variables.find((variable) => variable.key === "NEON_BRANCH_PRIMARY");

    expect(pooled).toMatchObject({
      value: env.SANDBOX_DATABASE_URL,
      type: "sensitive",
      visibility: "secret",
      target: ["preview"],
      gitBranch: "test-branch",
    });
    expect(direct).toMatchObject({
      value: env.SANDBOX_DATABASE_URL_UNPOOLED,
      type: "sensitive",
      visibility: "secret",
    });
    expect(metadata).toMatchObject({ value: "false", type: "plain" });
  });

  it("upserts only variables scoped to the intended Preview Git branch", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ envs: [] }))
      .mockResolvedValueOnce(response({ created: [{ id: "verification-marker" }], failed: [] }, 201))
      .mockImplementation(async (_input, init) => (
        response({ id: "env-id", method: init?.method })
      ));

    const keys = await upsertBranchVariables({
      env,
      fetchImpl,
      projectId: env.VERCEL_PROJECT_ID,
      teamId: env.VERCEL_ORG_ID,
      token: env.VERCEL_TOKEN,
    });

    expect(keys).toContain("DATABASE_URL");
    expect(fetchImpl).toHaveBeenCalledTimes(keys.length + 2);
    const createBody = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(createBody).toMatchObject({
      key: "DATABASE_URL",
      value: env.SANDBOX_DATABASE_URL,
      type: "sensitive",
      visibility: "secret",
      target: ["preview"],
      gitBranch: "test-branch",
    });
    expect(String(fetchImpl.mock.calls[2][0])).toContain("/v10/projects/prj_test/env");
    expect(String(fetchImpl.mock.calls[2][0])).toContain("upsert=true");
    expect(String(fetchImpl.mock.calls[10][0])).toContain("/v9/projects/prj_test/env/verification-marker");
    expect(JSON.parse(String(fetchImpl.mock.calls[10][1]?.body)).value).toBe("true");
  });

  it("updates matching branch variables and leaves other branches untouched", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        envs: [{
          id: "env-current",
          key: "DATABASE_URL",
          gitBranch: "test-branch",
          target: ["preview"],
        }, {
          id: "env-other",
          key: "DATABASE_URL",
          gitBranch: "other-branch",
          target: ["preview"],
        }],
      }))
      .mockResolvedValueOnce(response({ created: [{ id: "verification-marker" }], failed: [] }, 201))
      .mockImplementation(async (_input, init) => response({ method: init?.method }));

    await upsertBranchVariables({
      env,
      fetchImpl,
      projectId: env.VERCEL_PROJECT_ID,
      teamId: env.VERCEL_ORG_ID,
      token: env.VERCEL_TOKEN,
    });

    expect(String(fetchImpl.mock.calls[2][0])).toContain("/v9/projects/prj_test/env/env-current");
    expect(fetchImpl.mock.calls[2][1]?.method).toBe("PATCH");
    const updateBody = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(updateBody).toEqual({ value: env.SANDBOX_DATABASE_URL });
    expect(updateBody).not.toHaveProperty("type");
    expect(updateBody).not.toHaveProperty("visibility");
  });

  it("omits visibility from edit requests for an existing verification marker", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        envs: [{
          id: "verification-marker",
          key: "NEON_SANDBOX_VERIFIED",
          gitBranch: "test-branch",
          target: ["preview"],
        }],
      }))
      .mockImplementation(async (_input, init) => response({ method: init?.method }));

    await upsertBranchVariables({
      env,
      fetchImpl,
      projectId: env.VERCEL_PROJECT_ID,
      teamId: env.VERCEL_ORG_ID,
      token: env.VERCEL_TOKEN,
    });

    const patchCalls = fetchImpl.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toHaveLength(2);
    for (const [, init] of patchCalls) {
      expect(JSON.parse(String(init?.body))).toEqual({ value: expect.any(String) });
    }
  });

  it("removes only sandbox variables for the exact closed Preview branch", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({
        envs: [{
          id: "env-current",
          key: "DATABASE_URL",
          gitBranch: "test-branch",
          target: ["preview"],
        }, {
          id: "env-other",
          key: "DATABASE_URL",
          gitBranch: "other-branch",
          target: ["preview"],
        }],
      }))
      .mockResolvedValueOnce(response(null, 204));

    await expect(removeBranchVariables({ env, fetchImpl })).resolves.toBe(1);
    expect(String(fetchImpl.mock.calls[1][0])).toContain("/v9/projects/prj_test/env/env-current");
    expect(fetchImpl.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("does not reveal API response bodies when Vercel rejects an update", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ envs: [] }))
      .mockResolvedValueOnce(response({ created: [{ id: "verification-marker" }], failed: [] }))
      .mockResolvedValueOnce(response({
        error: { code: "invalid_value", message: "Invalid value secret-url" },
      }, 500));

    await expect(upsertBranchVariables({
      env,
      fetchImpl,
      projectId: env.VERCEL_PROJECT_ID,
      teamId: env.VERCEL_ORG_ID,
      token: env.VERCEL_TOKEN,
    })).rejects.toThrow("POST /v10/projects/prj_test/env?upsert=true failed (HTTP 500, code invalid_value)");
  });

  it("reports partial API failures by safe variable key and code only", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ envs: [] }))
      .mockResolvedValueOnce(response({ created: [{ id: "verification-marker" }], failed: [] }, 201))
      .mockResolvedValueOnce(response({
        failed: [{
          error: {
            key: "DATABASE_URL",
            code: "invalid_value",
            message: "postgresql://secret-value",
            value: "postgresql://secret-value",
          },
        }],
      }));

    let errorMessage = "";
    try {
      await upsertBranchVariables({
        env,
        fetchImpl,
        projectId: env.VERCEL_PROJECT_ID,
        teamId: env.VERCEL_ORG_ID,
        token: env.VERCEL_TOKEN,
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "";
    }

    expect(errorMessage).toContain("DATABASE_URL (invalid_value)");
    expect(errorMessage).not.toContain("postgresql://secret-value");
  });
});
