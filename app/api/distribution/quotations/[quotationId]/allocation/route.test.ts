import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  getSalesOrderAllocationData: vi.fn(),
  allocateSalesOrder: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
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
    expect(mocks.getSalesOrderAllocationData).toHaveBeenCalledWith("internal-org-1", "sales-order-1");
  });

  it("delegates General Stock authorization and bulk allocation to the service", async () => {
    const response = await POST(
      new Request("http://localhost/api/distribution/quotations/sales-order-1/allocation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: "public-org", mode: "GENERAL" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.allocateSalesOrder).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "sales-order-1",
      "GENERAL",
      [],
    );
  });

  it("delegates Production authorization and validates source-order work orders", async () => {
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
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
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
});
