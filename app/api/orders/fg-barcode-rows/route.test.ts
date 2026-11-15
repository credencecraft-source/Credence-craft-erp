import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationOrderManagementPermission: vi.fn(),
  listFinishedGoodsQrRows: vi.fn(),
  isDatabaseUnavailableError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationOrderManagementPermission: mocks.requireOrganizationOrderManagementPermission,
}));
vi.mock("@/lib/services/orders/finished-goods-qr-row-service", () => ({
  listFinishedGoodsQrRows: mocks.listFinishedGoodsQrRows,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: mocks.isDatabaseUnavailableError,
}));

import { GET } from "./route";

const requestUrl =
  "http://localhost/api/orders/fg-barcode-rows?organizationId=public-org&workspaceId=workspace-1&orderId=order-1&orderId=order-2";

describe("finished-goods QR rows API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationOrderManagementPermission.mockResolvedValue(undefined);
    mocks.listFinishedGoodsQrRows.mockResolvedValue({
      success: true,
      orders: [{
        orderId: "order-1",
        orderNo: "ORD-1",
        styleName: "STYLE-1",
        finishedGoodsRows: [{
          finishedGoodsId: "fg-1",
          size: "M",
          buyerSize: "M",
          skuCode: "SKU-1",
          barcode: "BAR-1",
          totalQty: 20,
        }],
      }],
    });
  });

  it("authorizes order-view access and queries rows by the internal organization ID", async () => {
    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationOrderManagementPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "merchandising/order",
      "view",
    );
    expect(mocks.listFinishedGoodsQrRows).toHaveBeenCalledWith(
      "internal-org-1",
      ["order-1", "order-2"],
    );
  });

  it("rejects a workspace mismatch before organization authorization", async () => {
    const response = await GET(new Request(requestUrl.replace("workspace-1", "other-workspace")));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.listFinishedGoodsQrRows).not.toHaveBeenCalled();
  });

  it("rejects users without order-view permission", async () => {
    mocks.requireOrganizationOrderManagementPermission.mockRejectedValue(
      new Error("Access denied: insufficient organization permissions."),
    );
    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(403);
    expect(mocks.listFinishedGoodsQrRows).not.toHaveBeenCalled();
  });

  it("rejects duplicate selected order IDs", async () => {
    const response = await GET(new Request(requestUrl.replace("&orderId=order-2", "&orderId=order-1")));

    expect(response.status).toBe(400);
    expect(mocks.listFinishedGoodsQrRows).not.toHaveBeenCalled();
  });

  it("does not return rows when an order is outside the authorized organization", async () => {
    mocks.listFinishedGoodsQrRows.mockResolvedValue({
      success: false,
      reason: "ORDER_NOT_FOUND",
    });
    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "One or more selected orders are unavailable in this organization.",
    });
  });
});
