import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    posPurchaseRecord: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));

import { listPurchaseRecords } from "./purchase-bill-service";

describe("listPurchaseRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it("filters record details by both record and authorized organization", async () => {
    await listPurchaseRecords("organization-internal-id", "record-id");

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "organization-internal-id",
        status: "SAVED",
        id: "record-id",
      },
      include: { lines: { orderBy: { created_at: "asc" } } },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  });

  it("preserves the organization filter for report list reads", async () => {
    await listPurchaseRecords("organization-internal-id");

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "organization-internal-id",
        status: "SAVED",
      },
    }));
  });

  it("bounds paginated report reads while keeping them organization-scoped", async () => {
    await listPurchaseRecords("organization-internal-id", undefined, { skip: 100, take: 100 });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        organization_id: "organization-internal-id",
        status: "SAVED",
      },
      skip: 100,
      take: 100,
    }));
  });

  it("caps the requested report page size", async () => {
    await listPurchaseRecords("organization-internal-id", undefined, { skip: 0, take: 500 });

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 0,
      take: 100,
    }));
  });
});
