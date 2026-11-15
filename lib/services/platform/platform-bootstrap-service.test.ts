import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  planCount: vi.fn(),
  databaseConnectionCount: vi.fn(),
  createPlatformAdmin: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    plan: { count: mocks.planCount },
    databaseConnection: { count: mocks.databaseConnectionCount },
    platformAdmin: { count: vi.fn(), create: mocks.createPlatformAdmin },
  },
}));

import { ensurePlatformDefaults } from "./platform-bootstrap-service";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.planCount.mockResolvedValue(1);
  mocks.databaseConnectionCount.mockResolvedValue(1);
});

describe("platform defaults", () => {
  it("never provisions platform credentials as a side effect of default setup", async () => {
    await ensurePlatformDefaults();

    expect(mocks.createPlatformAdmin).not.toHaveBeenCalled();
  });
});
