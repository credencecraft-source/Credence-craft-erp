import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getSalesOrderAllocationData: vi.fn(),
  allocateSalesOrder: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/distribution/advance-booking-allocation-service", () => ({
  getSalesOrderAllocationData: mocks.getSalesOrderAllocationData,
  allocateSalesOrder: mocks.allocateSalesOrder,
}));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ quotationId: "sales-order-1" }) };

describe("Sales Order allocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.getSalesOrderAllocationData.mockResolvedValue({ salesOrderNo: "SO-1", orders: [] });
    mocks.allocateSalesOrder.mockResolvedValue({
      mode: "GENERAL",
      allocatedBookings: 1,
      allocatedOrders: 1,
      allocatedQuantity: 8,
    });
  });

  it("loads only after organization membership is verified", async () => {
    const response = await GET(
      new Request("http://localhost/api/distribution/quotations/sales-order-1/allocation?organizationId=public-org"),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "VIEW_ORDERS");
    expect(mocks.getSalesOrderAllocationData).toHaveBeenCalledWith("internal-org-1", "sales-order-1");
  });

  it("requires general-stock permission before delegating allocation", async () => {
    const response = await POST(
      new Request("http://localhost/api/distribution/quotations/sales-order-1/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "public-org", mode: "GENERAL" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_FINISHED_GOODS_OUTWARD");
    expect(mocks.allocateSalesOrder).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "sales-order-1",
      "GENERAL",
      [],
    );
  });

  it("requires production permission and validates source-order work orders", async () => {
    const response = await POST(
      new Request("http://localhost/api/distribution/quotations/sales-order-1/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: "public-org",
          mode: "PRODUCTION",
          workOrders: [{ orderId: "order-1", workOrderId: "work-order-1" }],
        }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "UPDATE_FACTORY_PRODUCTION");
    expect(mocks.allocateSalesOrder).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "sales-order-1",
      "PRODUCTION",
      [{ orderId: "order-1", workOrderId: "work-order-1" }],
    );
  });

  it("rejects unknown allocation modes before authorization or mutation", async () => {
    const response = await POST(
      new Request("http://localhost/api/distribution/quotations/sales-order-1/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "public-org", mode: "ALL" }),
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.allocateSalesOrder).not.toHaveBeenCalled();
  });

  it("denies stock allocation before calling the allocation service", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const response = await POST(
      new Request("http://localhost/api/distribution/quotations/sales-order-1/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "public-org", mode: "GENERAL" }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.allocateSalesOrder).not.toHaveBeenCalled();
  });
});
