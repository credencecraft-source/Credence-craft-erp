import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createWorkOrder: vi.fn(),
  createWorkOrders: vi.fn(),
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
}));

vi.mock("@/lib/services/factory/work-order-service", () => ({
  createWorkOrder: mocks.createWorkOrder,
  createWorkOrders: mocks.createWorkOrders,
  getWorkOrderAllocation: mocks.getWorkOrderAllocation,
  listOrdersByArticle: mocks.listOrdersByArticle,
  listWorkOrderAllocationsByArticle: mocks.listWorkOrderAllocationsByArticle,
  listWorkOrderArticles: mocks.listWorkOrderArticles,
  listWorkOrders: mocks.listWorkOrders,
}));

import { GET, POST } from "./route";
import { DATABASE_UNAVAILABLE_MESSAGE } from "@/lib/database/database-errors";

const jsonRequest = (body: unknown) => new Request("http://localhost/api/factory/work-orders", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("factory work-orders route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.createWorkOrder.mockResolvedValue({ id: "work-order-1" });
    mocks.createWorkOrders.mockResolvedValue([{ id: "work-order-1" }]);
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
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "MERCHANDISING"],
    );
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
});