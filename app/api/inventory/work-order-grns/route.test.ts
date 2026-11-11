import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createWorkOrderInventoryGrn: vi.fn(),
  deleteWorkOrderInventoryGrns: vi.fn(),
  listWorkOrderInventoryGrns: vi.fn(),
  listWorkOrdersForReceiving: vi.fn(),
  WorkOrderGrnDeletionConflictError: class WorkOrderGrnDeletionConflictError extends Error {
    constructor(
      message: string,
      readonly issues: Array<{ id: string; type: string; documentNo: string }> = [],
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/inventory/work-order-grn-service", () => ({
  createWorkOrderInventoryGrn: mocks.createWorkOrderInventoryGrn,
  deleteWorkOrderInventoryGrns: mocks.deleteWorkOrderInventoryGrns,
  listWorkOrderInventoryGrns: mocks.listWorkOrderInventoryGrns,
  listWorkOrdersForReceiving: mocks.listWorkOrdersForReceiving,
  WorkOrderGrnDeletionConflictError: mocks.WorkOrderGrnDeletionConflictError,
}));

import { DELETE, GET, POST } from "./route";

const postRequest = (body: unknown) => new Request("http://localhost/api/inventory/work-order-grns", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const deleteRequest = (body: unknown) => new Request("http://localhost/api/inventory/work-order-grns", {
  method: "DELETE",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("work-order GRN route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listWorkOrderInventoryGrns.mockResolvedValue({ grns: [], nextCursor: null });
    mocks.listWorkOrdersForReceiving.mockResolvedValue({ workOrders: [], nextCursor: null });
    mocks.createWorkOrderInventoryGrn.mockResolvedValue({ id: "grn-1" });
    mocks.deleteWorkOrderInventoryGrns.mockResolvedValue([{ id: "grn-1", grnNo: "FGRN-1" }]);
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
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "VIEW_INVENTORY_RECEIPTS");
    expect(mocks.listWorkOrderInventoryGrns).toHaveBeenCalledWith("internal-org-1", {
      status: "PENDING_VERIFICATION",
      cursor: undefined,
      limit: 50,
    });
  });

  it("loads a single GRN by ID through the authorized internal organization", async () => {
    mocks.listWorkOrderInventoryGrns.mockResolvedValue({ grns: [{ id: "grn-1" }], nextCursor: null });

    const response = await GET(new Request(
      "http://localhost/api/inventory/work-order-grns?organizationId=public-org&grnId=grn-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "VIEW_INVENTORY_RECEIPTS");
    expect(mocks.listWorkOrderInventoryGrns).toHaveBeenCalledWith("internal-org-1", {
      grnId: "grn-1",
      limit: 1,
    });
  });

  it("returns not found when the tenant-scoped GRN ID does not exist", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/work-order-grns?organizationId=public-org&grnId=missing",
    ));

    expect(response.status).toBe(404);
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
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_INVENTORY_RECEIPTS");
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

  it("deletes selected GRNs through authorized internal organization and inventory permissions", async () => {
    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      grnIds: ["grn-1", "grn-2"],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: [{ id: "grn-1", grnNo: "FGRN-1" }],
    });
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "DELETE_INVENTORY_RECEIPTS");
    expect(mocks.deleteWorkOrderInventoryGrns).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["grn-1", "grn-2"],
    );
  });

  it("rejects invalid bulk deletion selections before calling the service", async () => {
    const emptySelection = await DELETE(deleteRequest({ organizationId: "public-org", grnIds: [] }));
    const duplicateSelection = await DELETE(deleteRequest({ organizationId: "public-org", grnIds: ["grn-1", "grn-1"] }));
    const oversizedSelection = await DELETE(deleteRequest({
      organizationId: "public-org",
      grnIds: Array.from({ length: 101 }, (_, index) => `grn-${index}`),
    }));

    expect(emptySelection.status).toBe(400);
    expect(duplicateSelection.status).toBe(400);
    expect(oversizedSelection.status).toBe(400);
    expect(mocks.deleteWorkOrderInventoryGrns).not.toHaveBeenCalled();
  });

  it("returns a conflict when linked material has been issued", async () => {
    const issues = [{
      id: "invoice-1",
      type: "POS_INVOICE",
      documentNo: "POS-001",
    }];
    mocks.deleteWorkOrderInventoryGrns.mockRejectedValue(
      new mocks.WorkOrderGrnDeletionConflictError(
        "This GRN cannot be deleted because material has already been issued against it.",
        issues,
      ),
    );

    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      grnIds: ["grn-1"],
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This GRN cannot be deleted because material has already been issued against it.",
      issues,
    });
  });

  it("does not call bulk delete if authentication or organization authorization fails", async () => {
    mocks.requireSessionUser.mockRejectedValueOnce(new Error("Authentication required."));
    const unauthenticated = await DELETE(deleteRequest({ organizationId: "public-org", grnIds: ["grn-1"] }));
    mocks.requireOrganizationContext.mockRejectedValueOnce(new Error("Insufficient organization permissions."));
    const unauthorized = await DELETE(deleteRequest({ organizationId: "public-org", grnIds: ["grn-1"] }));

    expect(unauthenticated.status).toBe(400);
    expect(unauthorized.status).toBe(400);
    expect(mocks.deleteWorkOrderInventoryGrns).not.toHaveBeenCalled();
  });

  it("does not create a GRN when the receiving permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await POST(postRequest({
      organizationId: "public-org",
      workOrderId: "work-order-1",
      receivedDate: "2026-10-07",
      lines: [{ workOrderSizeLineId: "size-s", receivedQuantity: 3 }],
    }));

    expect(response.status).toBe(403);
    expect(mocks.createWorkOrderInventoryGrn).not.toHaveBeenCalled();
  });

  it("does not delete GRNs when the delete permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));

    const response = await DELETE(deleteRequest({
      organizationId: "public-org",
      grnIds: ["grn-1"],
    }));

    expect(response.status).toBe(403);
    expect(mocks.deleteWorkOrderInventoryGrns).not.toHaveBeenCalled();
  });
});
