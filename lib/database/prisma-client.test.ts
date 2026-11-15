import { describe, expect, it } from "vitest";

import { shouldRetryPrismaQuery } from "./prisma-client";

describe("prisma connection retry policy", () => {
  it("does not retry queries that are already running inside a transaction", () => {
    expect(shouldRetryPrismaQuery({ runInTransaction: true })).toBe(false);
  });

  it("retries transient connection errors for normal queries", () => {
    expect(shouldRetryPrismaQuery({ runInTransaction: false })).toBe(true);
  });
});
