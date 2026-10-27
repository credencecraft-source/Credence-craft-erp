import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  listOrderQrPrintRequests: vi.fn(),
  createOrderQrPrintRequest: vi.fn(),
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
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: mocks.isDatabaseUnavailableError,
}));

import { GET, POST } from "./route";

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

  it("creates a request using the authorized internal organization and current actor", async () => {
    const response = await POST(new Request(requestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "order-1",
        templateId: "template-1",
        requestType: "DOWNLOAD",
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
      { orderId: "order-1", templateId: "template-1", requestType: "DOWNLOAD" },
    );
  });
});
