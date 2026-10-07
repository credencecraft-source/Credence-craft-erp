import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  createWorkOrderInventoryGrn: vi.fn(),
  listWorkOrderInventoryGrns: vi.fn(),
  listWorkOrdersForReceiving: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
}));

vi.mock("@/lib/services/inventory/work-order-grn-service", () => ({
  createWorkOrderInventoryGrn: mocks.createWorkOrderInventoryGrn,
  listWorkOrderInventoryGrns: mocks.listWorkOrderInventoryGrns,
  listWorkOrdersForReceiving: mocks.listWorkOrdersForReceiving,
}));

import { GET, POST } from "./route";

const postRequest = (body: unknown) => new Request("http://localhost/api/inventory/work-order-grns", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("work-order GRN route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.listWorkOrderInventoryGrns.mockResolvedValue({ grns: [], nextCursor: null });
    mocks.listWorkOrdersForReceiving.mockResolvedValue({ workOrders: [], nextCursor: null });
    mocks.createWorkOrderInventoryGrn.mockResolvedValue({ id: "grn-1" });
  });

  it("requires authentication before the organization-scoped register can be read", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("Authentication required."));

    const response = await GET(new Request("http://localhost/api/inventory/work-order-grns?organizationId=public-org"));

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
  });

  it("uses the authorized internal organization for the pending verification register", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/work-order-grns?organizationId=public-org&status=PENDING_VERIFICATION&limit=50",
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.listWorkOrderInventoryGrns).toHaveBeenCalledWith("internal-org-1", {
      status: "PENDING_VERIFICATION",
      cursor: undefined,
      limit: 50,
    });
  });

  it("loads only receiving-eligible work orders through the internal organization", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/work-order-grns?organizationId=public-org&workOrders=true&limit=100",
    ));

    expect(response.status).toBe(200);
    expect(mocks.listWorkOrdersForReceiving).toHaveBeenCalledWith("internal-org-1", {
      cursor: undefined,
      limit: 100,
    });
  });

  it("rejects unsupported receipt status and excessive page sizes", async () => {
    const invalidStatus = await GET(new Request(
      "http://localhost/api/inventory/work-order-grns?organizationId=public-org&status=POSTED",
    ));
    const invalidLimit = await GET(new Request(
      "http://localhost/api/inventory/work-order-grns?organizationId=public-org&limit=500",
    ));

    expect(invalidStatus.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
    expect(mocks.listWorkOrderInventoryGrns).not.toHaveBeenCalled();
  });

  it("requires Inventory permission and writes using the authorized tenant and actor", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      workOrderId: "work-order-1",
      receivedDate: "2026-10-07",
      lines: [
        { workOrderSizeLineId: "size-s", receivedQuantity: 3 },
        { workOrderSizeLineId: "size-m", receivedQuantity: 0 },
      ],
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.createWorkOrderInventoryGrn).toHaveBeenCalledWith("internal-org-1", "user-1", {
      workOrderId: "work-order-1",
      receivedDate: "2026-10-07",
      notes: "",
      lines: [
        { workOrderSizeLineId: "size-s", receivedQuantity: 3 },
        { workOrderSizeLineId: "size-m", receivedQuantity: 0 },
      ],
    });
  });

  it("rejects invalid quantities before calling the GRN service", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      workOrderId: "work-order-1",
      receivedDate: "2026-10-07",
      lines: [{ workOrderSizeLineId: "size-s", receivedQuantity: 1.5 }],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createWorkOrderInventoryGrn).not.toHaveBeenCalled();
  });

  it("does not save when organization permission validation rejects the user", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Insufficient organization permissions."));

    const response = await POST(postRequest({
      organizationId: "public-org",
      workOrderId: "work-order-1",
      receivedDate: "2026-10-07",
      lines: [{ workOrderSizeLineId: "size-s", receivedQuantity: 1 }],
    }));

    expect(response.status).toBe(400);
    expect(mocks.createWorkOrderInventoryGrn).not.toHaveBeenCalled();
  });

  it("returns service-unavailable for database connectivity errors", async () => {
    mocks.listWorkOrderInventoryGrns.mockRejectedValue({ code: "P1001" });

    const response = await GET(new Request("http://localhost/api/inventory/work-order-grns?organizationId=public-org"));

    expect(response.status).toBe(503);
  });
});
