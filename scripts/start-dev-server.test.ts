import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generatePrismaClient } = require("./start-dev-server.cjs") as {
  generatePrismaClient: (run?: typeof import("node:child_process").spawnSync) => void;
};

describe("development Prisma Client generation", () => {
  it("generates Prisma Client from the project schema", () => {
    const run = vi.fn().mockReturnValue({ status: 0, error: undefined });

    generatePrismaClient(run);

    expect(run).toHaveBeenCalledWith(
      process.execPath,
      [expect.stringMatching(/[\\/]node_modules[\\/]prisma[\\/]build[\\/]index\.js$/), "generate"],
      expect.objectContaining({ cwd: process.cwd(), stdio: "inherit" }),
    );
  });

  it("fails startup when Prisma Client generation fails", () => {
    const run = vi.fn().mockReturnValue({ status: 1, error: undefined });

    expect(() => generatePrismaClient(run)).toThrow("Prisma Client generation failed");
  });

  it("surfaces process-spawn errors", () => {
    const spawnError = new Error("Prisma CLI could not start");
    const run = vi.fn().mockReturnValue({ status: null, error: spawnError });

    expect(() => generatePrismaClient(run)).toThrow(spawnError);
  });
});
