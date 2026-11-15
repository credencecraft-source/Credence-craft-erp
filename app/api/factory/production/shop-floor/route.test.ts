import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listShopFloorBoard: vi.fn(),
  listShopFloorBoardSummary: vi.fn(),
  assignWorkToBatch: vi.fn(),
  updateProcessLogStatus: vi.fn(),
  createShopFloorTransfer: vi.fn(),
  acceptShopFloorTransfer: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/factory/shop-floor-service", () => ({
  acceptShopFloorTransfer: mocks.acceptShopFloorTransfer,
  assignWorkToBatch: mocks.assignWorkToBatch,
  createShopFloorTransfer: mocks.createShopFloorTransfer,
  listShopFloorBoard: mocks.listShopFloorBoard,
  listShopFloorBoardSummary: mocks.listShopFloorBoardSummary,
  updateProcessLogStatus: mocks.updateProcessLogStatus,
}));

import { GET, POST } from "./route";

describe("factory shop-floor permissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
  });

  it("denies viewing the board before loading shop-floor records", async () => {
    const response = await GET(new Request("http://localhost/api/factory/production/shop-floor?organizationId=public-org"));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "VIEW_FACTORY_PRODUCTION");
    expect(mocks.listShopFloorBoard).not.toHaveBeenCalled();
    expect(mocks.listShopFloorBoardSummary).not.toHaveBeenCalled();
  });

  it("denies shop-floor mutations before calling production services", async () => {
    const response = await POST(new Request("http://localhost/api/factory/production/shop-floor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", action: "complete", logId: "log-1" }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "UPDATE_FACTORY_PRODUCTION");
    expect(mocks.updateProcessLogStatus).not.toHaveBeenCalled();
  });
});
