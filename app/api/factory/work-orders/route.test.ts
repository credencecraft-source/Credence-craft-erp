import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createWorkOrder: vi.fn(),
  createWorkOrders: vi.fn(),
  deleteWorkOrders: vi.fn(),
  getWorkOrderAllocation: vi.fn(),
  listOrdersByArticle: vi.fn(),
  listWorkOrderAllocationsByArticle: vi.fn(),
  listWorkOrderArticles: vi.fn(),
  listWorkOrders: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/factory/work-order-service", () => ({
  createWorkOrder: mocks.createWorkOrder,
  createWorkOrders: mocks.createWorkOrders,
  deleteWorkOrders: mocks.deleteWorkOrders,
  getWorkOrderAllocation: mocks.getWorkOrderAllocation,
  listOrdersByArticle: mocks.listOrdersByArticle,
  listWorkOrderAllocationsByArticle: mocks.listWorkOrderAllocationsByArticle,
  listWorkOrderArticles: mocks.listWorkOrderArticles,
  listWorkOrders: mocks.listWorkOrders,
}));

import { DELETE, GET, POST } from "./route";
import { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";

const jsonRequest = (body: unknown) => new Request("http://localhost/api/factory/work-orders", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const deleteRequest = (body: unknown) => new Request("http://localhost/api/factory/work-orders", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("factory work-orders route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.createWorkOrder.mockResolvedValue({ id: "work-order-1" });
    mocks.createWorkOrders.mockResolvedValue([{ id: "work-order-1" }]);
    mocks.deleteWorkOrders.mockResolvedValue(undefined);
    mocks.listWorkOrders.mockResolvedValue({ workOrders: [], nextCursor: null });
  });

  it("requires an authenticated user before organization-scoped reads", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("Authentication required."));

    const response = await GET(new Request("http://localhost/api/factory/work-orders?organizationId=public-org"));

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
  });

  it("creates work orders using the authorized internal organization and actor", async () => {
    const response = await POST(jsonRequest({
      organizationId: "public-org",
      orderNo: "ORD-1",
      lines: [{ sourceFinishedGoodsId: "size-1", quantity: 5 }],
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "public-org", "CREATE_WORK_ORDERS");
    expect(mocks.createWorkOrder).toHaveBeenCalledWith("internal-org-1", "user-1", "ORD-1", [
      { sourceFinishedGoodsId: "size-1", quantity: 5 },
    ]);
  });

  it("rejects an invalid work-order batch without invoking the service", async () => {
    const response = await POST(jsonRequest({
      organizationId: "public-org",
      requests: "not-a-list",
    }));

    expect(response.status).toBe(400);
    expect(mocks.createWorkOrders).not.toHaveBeenCalled();
  });

  it("validates work-order list pagination before querying", async () => {
    const response = await GET(new Request("http://localhost/api/factory/work-orders?organizationId=public-org&limit=1000"));

    expect(response.status).toBe(400);
    expect(mocks.listWorkOrders).not.toHaveBeenCalled();
  });

  it("reports database connectivity failures for reads as service unavailable", async () => {
    mocks.listWorkOrders.mockRejectedValue({ code: "P1001" });

    const response = await GET(new Request("http://localhost/api/factory/work-orders?organizationId=public-org"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: DATABASE_UNAVAILABLE_MESSAGE });
  });

  it("reports database connectivity failures for creates as service unavailable", async () => {
    mocks.createWorkOrder.mockRejectedValue({ code: "P1001" });

    const response = await POST(jsonRequest({
      organizationId: "public-org",
      orderNo: "ORD-1",
      lines: [],
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: DATABASE_UNAVAILABLE_MESSAGE });
  });

  it("deletes selected work orders with tenant-scoped authorization", async () => {
    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      workOrderIds: ["work-order-1", "work-order-2"],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: ["work-order-1", "work-order-2"] });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "public-org", "DELETE_WORK_ORDERS");
    expect(mocks.deleteWorkOrders).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["work-order-1", "work-order-2"],
    );
  });

  it("rejects duplicated selected IDs before authorization or deletion", async () => {
    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      workOrderIds: ["work-order-1", " work-order-1 "],
    }));

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.deleteWorkOrders).not.toHaveBeenCalled();
  });

  it("denies work-order reads without the dedicated view permission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await GET(new Request("http://localhost/api/factory/work-orders?organizationId=public-org"));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "public-org", "VIEW_WORK_ORDERS");
    expect(mocks.listWorkOrders).not.toHaveBeenCalled();
  });
});