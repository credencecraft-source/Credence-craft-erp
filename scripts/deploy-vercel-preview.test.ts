import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createPreviewDeployment, getDeploymentInput } = require("./deploy-vercel-preview.cjs") as {
  createPreviewDeployment: (options?: {
    env: Record<string, string>;
    fetchImpl: typeof fetch;
    logger: { log: (message: string) => void };
    maxAttempts: number;
    sleep: () => Promise<void>;
  } | null) => Promise<string>;
  getDeploymentInput: (env: Record<string, string>) => {
    ref: string;
    sha: string;
    repositoryId: string;
  };
};
const deploymentScriptPath = require.resolve("./deploy-vercel-preview.cjs");

const env = {
  SANDBOX_VERCEL_BRANCH_REF: "test-branch",
  SANDBOX_GIT_SHA: "a".repeat(40),
  SANDBOX_GITHUB_REPOSITORY_ID: "123456789",
  VERCEL_ORG_ID: "team_test",
  VERCEL_PROJECT_ID: "prj_test",
  VERCEL_TOKEN: "vercel-test-token",
};

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("Vercel Preview deployment", () => {
  it("reports missing workflow variables when invoked without an options object", () => {
    const result = spawnSync(process.execPath, [deploymentScriptPath], {
      encoding: "utf8",
      env: { NODE_ENV: "test" },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Missing required environment variable: VERCEL_TOKEN");
    expect(result.stderr).not.toContain("TypeError");
  });

  it("rejects null deployment options with a descriptive error", async () => {
    await expect(createPreviewDeployment(null)).rejects.toThrow(
      "Vercel Preview deployment options must be an object",
    );
  });

  it("creates and waits for a Preview deployment from the requested Git ref and SHA", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: "prj_test", name: "credence-craft-erp" }))
      .mockResolvedValueOnce(response({ id: "dpl_test" }, 201))
      .mockResolvedValueOnce(response({ readyState: "BUILDING" }))
      .mockResolvedValueOnce(response({ readyState: "READY", url: "preview.example.vercel.app" }));
    const logger = { log: vi.fn() };

    await expect(createPreviewDeployment({
      env,
      fetchImpl,
      logger,
      maxAttempts: 3,
      sleep: vi.fn().mockResolvedValue(undefined),
    })).resolves.toBe("preview.example.vercel.app");

    const createBody = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(createBody).toMatchObject({
      project: "prj_test",
      target: "preview",
      gitSource: {
        type: "github",
        repoId: "123456789",
        ref: "test-branch",
        sha: env.SANDBOX_GIT_SHA,
      },
    });
    expect(logger.log).toHaveBeenCalledWith(
      "Vercel Preview deployment is ready: https://preview.example.vercel.app",
    );
  });

  it("rejects main and invalid source metadata before contacting Vercel", () => {
    expect(() => getDeploymentInput({ ...env, SANDBOX_VERCEL_BRANCH_REF: "main" })).toThrow(
      "Refusing to create a sandbox Preview deployment from main",
    );
    expect(() => getDeploymentInput({ ...env, SANDBOX_GIT_SHA: "invalid" })).toThrow(
      "source metadata is invalid",
    );
  });

  it("fails safely when Vercel reports a terminal deployment error", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: "prj_test", name: "credence-craft-erp" }))
      .mockResolvedValueOnce(response({ id: "dpl_test" }, 201))
      .mockResolvedValueOnce(response({ readyState: "ERROR" }));

    await expect(createPreviewDeployment({
      env,
      fetchImpl,
      logger: { log: vi.fn() },
      maxAttempts: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
    })).rejects.toThrow("finished in state ERROR");
  });

  it("rejects an empty project response instead of dereferencing it", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(response(null));

    await expect(createPreviewDeployment({
      env,
      fetchImpl,
      logger: { log: vi.fn() },
      maxAttempts: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
    })).rejects.toThrow("empty or malformed deployment response");
  });

  it("rejects a deployment status response without readyState", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ id: "prj_test", name: "credence-craft-erp" }))
      .mockResolvedValueOnce(response({ id: "dpl_test" }, 201))
      .mockResolvedValueOnce(response({}));

    await expect(createPreviewDeployment({
      env,
      fetchImpl,
      logger: { log: vi.fn() },
      maxAttempts: 1,
      sleep: vi.fn().mockResolvedValue(undefined),
    })).rejects.toThrow("status response is missing readyState");
  });
});
