import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregateTenantUsageForDate: vi.fn(),
}));

vi.mock("@/lib/services/workspace/tenant-usage-metering-service", () => ({
  aggregateTenantUsageForDate: mocks.aggregateTenantUsageForDate,
}));

import { GET } from "./route";

describe("tenant usage aggregation cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mocks.aggregateTenantUsageForDate.mockResolvedValue({ aggregatedTenants: 1 });
  });

  it("requires a valid cron bearer token before aggregation", async () => {
    const response = await GET(new Request("http://localhost/api/cron/aggregate-usage"));

    expect(response.status).toBe(401);
    expect(mocks.aggregateTenantUsageForDate).not.toHaveBeenCalled();
  });

  it("aggregates yesterday only after the cron token is verified", async () => {
    const response = await GET(new Request("http://localhost/api/cron/aggregate-usage", {
      headers: { Authorization: "Bearer test-cron-secret" },
    }));
    const [aggregatedDate] = mocks.aggregateTenantUsageForDate.mock.calls[0];
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);

    expect(response.status).toBe(200);
    expect(aggregatedDate.toISOString().slice(0, 10)).toBe(yesterday.toISOString().slice(0, 10));
    await expect(response.json()).resolves.toEqual({ aggregatedTenants: 1 });
  });
});
