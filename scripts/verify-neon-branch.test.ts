import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { verifyNeonBranch } = require("./verify-neon-branch.cjs") as {
  verifyNeonBranch: (options: {
    apiKey: string;
    branchId: string;
    expectedBranchName: string;
    fetchImpl: typeof fetch;
    projectId: string;
  }) => Promise<{ id: string; name: string; projectId: string }>;
};

const validBranch = {
  id: "br-cool-pond-123",
  project_id: "silent-tree-123",
  name: "credencecraft-sandbox-pr-42",
  primary: false,
  default: false,
};

function response(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe("Neon sandbox branch verification", () => {
  it("accepts only the requested non-primary branch in the expected project", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ branch: validBranch }));

    await expect(verifyNeonBranch({
      apiKey: "test-api-key",
      branchId: validBranch.id,
      expectedBranchName: validBranch.name,
      fetchImpl,
      projectId: validBranch.project_id,
    })).resolves.toEqual({
      id: validBranch.id,
      name: validBranch.name,
      projectId: validBranch.project_id,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1]?.headers).toEqual({ Authorization: "Bearer test-api-key" });
  });

  it.each([
    ["primary", { ...validBranch, primary: true }],
    ["default", { ...validBranch, default: true }],
    ["wrong project", { ...validBranch, project_id: "another-project" }],
    ["wrong branch", { ...validBranch, name: "production" }],
  ])("rejects a %s branch response", async (_case, branch) => {
    await expect(verifyNeonBranch({
      apiKey: "test-api-key",
      branchId: validBranch.id,
      expectedBranchName: validBranch.name,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response({ branch })),
      projectId: validBranch.project_id,
    })).rejects.toThrow("not a verified sandbox branch");
  });

  it("does not include response bodies or credentials in API errors", async () => {
    await expect(verifyNeonBranch({
      apiKey: "private-token",
      branchId: validBranch.id,
      expectedBranchName: validBranch.name,
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response({ secret: "private-token" }, 403)),
      projectId: validBranch.project_id,
    })).rejects.toThrow("HTTP 403");
  });
});
