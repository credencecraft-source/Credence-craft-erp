import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaCounterMock = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    organizationOrderCounter: {
      upsert: prismaCounterMock.upsert,
    },
  },
}));

import { reserveNextOrderNumber } from "./order-service";

describe("reserveNextOrderNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the base prisma client when a closed transaction is reused", async () => {
    const staleTransaction = {
      organizationOrderCounter: {
        upsert: vi.fn().mockRejectedValue(new Error("Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.")),
      },
    } as any;

    prismaCounterMock.upsert.mockResolvedValue({ current_value: 7 });

    await expect(reserveNextOrderNumber("org-123", staleTransaction)).resolves.toBe("OD-7");
    expect(staleTransaction.organizationOrderCounter.upsert).toHaveBeenCalledTimes(1);
    expect(prismaCounterMock.upsert).toHaveBeenCalledTimes(1);
  });
});
