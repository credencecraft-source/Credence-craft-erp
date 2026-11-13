import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createStock: vi.fn(),
  getPurchaseBill: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/purchase-bill-service", () => ({
  createPurchaseBillFinishedGoodsStock: mocks.createStock,
  getPurchaseBill: mocks.getPurchaseBill,
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org", billId: "bill-1" }) };

describe("POS purchase-bill detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.getPurchaseBill.mockResolvedValue({ id: "bill-1" });
    mocks.createStock.mockResolvedValue({ stock: { id: "stock-1" } });
  });

  it("requires view permission before fetching a bill", async () => {
    const response = await GET(new Request("http://localhost/api/purchase-bill/bill-1"), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_PURCHASE_RECORDS",
    );
    expect(mocks.getPurchaseBill).toHaveBeenCalledWith("internal-org-1", "bill-1");
  });

  it("checks finished-goods stock permission before creating bill stock", async () => {
    const response = await POST(
      new Request("http://localhost/api/purchase-bill/bill-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-stock", locationId: "location-1", storageNodeId: "leaf-1" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "CREATE_FINISHED_GOODS_STOCK",
    );
    expect(mocks.createStock).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "bill-1",
      "location-1",
      "leaf-1",
    );
  });

  it("does not create bill stock when permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );
    const response = await POST(
      new Request("http://localhost/api/purchase-bill/bill-1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-stock", locationId: "location-1" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.createStock).not.toHaveBeenCalled();
  });
});
