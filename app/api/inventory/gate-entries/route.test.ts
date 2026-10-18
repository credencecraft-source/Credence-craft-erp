import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  entryFindMany: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));
vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    gateEntry: { findMany: mocks.entryFindMany },
    purchaseOrder: { findFirst: mocks.purchaseOrderFindFirst },
  },
}));

import { GET } from "./route";

describe("Gate Entry detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.entryFindMany.mockResolvedValue([{ id: "entry-1", entry_no: "GE-0001" }]);
  });

  it("loads only the requested entry in the authorized organization", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/gate-entries?organizationId=public-org&entryId=entry-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.entryFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "entry-1" },
    }));
    expect(mocks.entryFindMany.mock.calls[0][0]).not.toHaveProperty("take");
  });

  it("returns not found when the entry is outside the authorized organization", async () => {
    mocks.entryFindMany.mockResolvedValue([]);
    const response = await GET(new Request(
      "http://localhost/api/inventory/gate-entries?organizationId=public-org&entryId=other-org-entry",
    ));

    expect(response.status).toBe(404);
  });
});
