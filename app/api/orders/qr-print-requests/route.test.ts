import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listOrderQrPrintRequests: vi.fn(),
  createOrderQrPrintRequest: vi.fn(),
  deletePendingOrderQrPrintRequests: vi.fn(),
  isDatabaseUnavailableError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/orders/order-qr-print-request-service", () => ({
  listOrderQrPrintRequests: mocks.listOrderQrPrintRequests,
  createOrderQrPrintRequest: mocks.createOrderQrPrintRequest,
  deletePendingOrderQrPrintRequests: mocks.deletePendingOrderQrPrintRequests,
  OrderQrPrintRequestDeleteConflictError: class OrderQrPrintRequestDeleteConflictError extends Error {},
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: mocks.isDatabaseUnavailableError,
}));

import { DELETE, GET, POST } from "./route";

const requestUrl =
  "http://localhost/api/orders/qr-print-requests?organizationId=public-org&workspaceId=workspace-1";

describe("order QR print request API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({
      id: "internal-org-1",
      organizationId: "public-org",
    });
    mocks.requireOrganizationPermission.mockResolvedValue({ organization_id: "internal-org-1" });
    mocks.listOrderQrPrintRequests.mockResolvedValue([]);
    mocks.createOrderQrPrintRequest.mockResolvedValue({
      success: true,
      request: { id: "request-1", orderNo: "ORD-1" },
    });
    mocks.deletePendingOrderQrPrintRequests.mockResolvedValue({
      success: true,
      deletedCount: 2,
    });
  });

  it("authorizes report access and lists only the internal organization scope", async () => {
    const response = await GET(new Request(requestUrl));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "VIEW_REPORTS",
    );
    expect(mocks.listOrderQrPrintRequests).toHaveBeenCalledWith("internal-org-1");
    await expect(response.json()).resolves.toEqual({ requests: [] });
  });

  it("rejects workspace mismatch before organization authorization", async () => {
    const response = await GET(new Request(requestUrl.replace("workspace-1", "other-workspace")));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.listOrderQrPrintRequests).not.toHaveBeenCalled();
  });

  it("requires the create-orders permission for request submission", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "order-1", requestType: "PRINT" }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.createOrderQrPrintRequest).not.toHaveBeenCalled();
  });

  it("validates request details before invoking tenant-scoped persistence", async () => {
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "order-1", requestType: "UNKNOWN" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.createOrderQrPrintRequest).not.toHaveBeenCalled();
  });

  it("requires a saved template before accepting print or download requests", async () => {
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "order-1", requestType: "PRINT" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Select a QR template before requesting print or download.",
    });

    expect(mocks.createOrderQrPrintRequest).not.toHaveBeenCalled();
  });

  it("creates a request using the authorized internal organization and current actor", async () => {
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "order-1",
        templateId: "template-1",
        requestType: "DOWNLOAD",
        quantityMode: "BULK_QTY",
        bulkQuantity: 75,
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "CREATE_ORDERS",
    );
    expect(mocks.createOrderQrPrintRequest).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      {
        orderId: "order-1",
        templateId: "template-1",
        requestType: "DOWNLOAD",
        quantityMode: "BULK_QTY",
        bulkQuantity: 75,
      },
    );
  });

  it("requires a template-assigned Page Setup before creating a request", async () => {
    mocks.createOrderQrPrintRequest.mockResolvedValue({
      success: false,
      reason: "PAGE_SETUP_REQUIRED",
    });
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "order-1",
        templateId: "template-1",
        requestType: "PRINT",
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Assign a Page Setup to the QR template before creating a print request.",
    });
  });

  it("submits a consolidated bulk request once through the tenant-authorized endpoint", async () => {
    const body = {
      bulkOrders: [
        { orderId: "order-1", quantity: 1 },
        { orderId: "order-2", quantity: 25 },
      ],
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "BULK_QTY",
    };
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createOrderQrPrintRequest).toHaveBeenCalledTimes(1);
    expect(mocks.createOrderQrPrintRequest).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      body,
    );
  });

  it("requires master-data permission and tenant-scopes pending request deletion", async () => {
    const response = await DELETE(new Request(requestUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["request-1", "request-2"] }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "MANAGE_MASTER_DATA",
    );
    expect(mocks.deletePendingOrderQrPrintRequests).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["request-1", "request-2"],
    );
    await expect(response.json()).resolves.toEqual({ deletedCount: 2 });
  });

  it("rejects malformed or duplicate request identifiers before deletion", async () => {
    const response = await DELETE(new Request(requestUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["request-1", "request-1"] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.deletePendingOrderQrPrintRequests).not.toHaveBeenCalled();
  });

  it("does not delete requests in an advanced status", async () => {
    mocks.deletePendingOrderQrPrintRequests.mockResolvedValue({
      success: false,
      reason: "LOCKED",
    });
    const response = await DELETE(new Request(requestUrl, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["request-1"] }),
    }));

    expect(response.status).toBe(409);
  });
});
