import { describe, expect, it } from "vitest";

import {
  isDatabaseQueryTimingEnabled,
  measureDatabaseQueries,
  recordDatabaseQueryDuration,
} from "./prisma-query-timing";

describe("Prisma query timing", () => {
  it("collects query durations and counts within an isolated measurement", async () => {
    const result = await measureDatabaseQueries(async () => {
      expect(isDatabaseQueryTimingEnabled()).toBe(true);
      recordDatabaseQueryDuration(12.5);
      recordDatabaseQueryDuration(7.5);
      return "list-result";
    });

    expect(result).toMatchObject({
      value: "list-result",
      databaseDurationMs: 20,
      queryCount: 2,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(isDatabaseQueryTimingEnabled()).toBe(false);
  });

  it("does not collect queries outside a measurement scope", () => {
    expect(isDatabaseQueryTimingEnabled()).toBe(false);
    expect(() => recordDatabaseQueryDuration(10)).not.toThrow();
  });
});
