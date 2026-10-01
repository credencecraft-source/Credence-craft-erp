import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

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

import { reserveNextOrderNumber, reserveNextOrderNumbers } from "./order-service";

describe("reserveNextOrderNumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the base prisma client when a closed transaction is reused", async () => {
    const staleTransaction = {
      organizationOrderCounter: {
        upsert: vi.fn().mockRejectedValue(new Error("Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.")),
      },
    } as unknown as Prisma.TransactionClient;

    prismaCounterMock.upsert.mockResolvedValue({ current_value: 7 });

    await expect(reserveNextOrderNumber("org-123", staleTransaction)).resolves.toBe("OD-7");
    expect(staleTransaction.organizationOrderCounter.upsert).toHaveBeenCalledTimes(1);
    expect(prismaCounterMock.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("reserveNextOrderNumbers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reserves a contiguous range with one atomic counter update", async () => {
    const database = {
      organizationOrderCounter: {
        upsert: vi.fn().mockResolvedValue({ current_value: 14 }),
      },
    } as any;

    await expect(reserveNextOrderNumbers("org-123", 10, database)).resolves.toEqual([
      "OD-5", "OD-6", "OD-7", "OD-8", "OD-9", "OD-10", "OD-11", "OD-12", "OD-13", "OD-14",
    ]);
    expect(database.organizationOrderCounter.upsert).toHaveBeenCalledTimes(1);
    expect(database.organizationOrderCounter.upsert).toHaveBeenCalledWith({
      where: { organization_id: "org-123" },
      create: { organization_id: "org-123", current_value: 10 },
      update: { current_value: { increment: 10 } },
      select: { current_value: true },
    });
  });

  it("rejects invalid range sizes without touching the counter", async () => {
    await expect(reserveNextOrderNumbers("org-123", 0)).rejects.toThrow("Order number count must be a positive integer.");
    expect(prismaCounterMock.upsert).not.toHaveBeenCalled();
  });
});
