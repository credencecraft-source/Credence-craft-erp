import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  advanceOrderQrPrintRequestStatus: vi.fn(),
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
  advanceOrderQrPrintRequestStatus: mocks.advanceOrderQrPrintRequestStatus,
}));
vi.mock("@/lib/database/database-errors", () => ({
  DATABASE_UNAVAILABLE_MESSAGE: "Database unavailable.",
  isDatabaseUnavailableError: mocks.isDatabaseUnavailableError,
}));

import { PATCH } from "./route";

const requestUrl =
  "http://localhost/api/orders/qr-print-requests/request-1?organizationId=public-org&workspaceId=workspace-1";

describe("order QR print request status API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", workspace_id: "workspace-1" });
    mocks.requireOrganizationContext.mockResolvedValue({
      id: "internal-org-1",
      organizationId: "public-org",
    });
    mocks.requireOrganizationPermission.mockResolvedValue({ organization_id: "internal-org-1" });
    mocks.advanceOrderQrPrintRequestStatus.mockResolvedValue({
      success: true,
      request: { id: "request-1", status: "IN_PROGRESS" },
    });
  });

  it("requires master-data management permission and applies a valid status transition", async () => {
    const response = await PATCH(
      new Request(requestUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      }),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "MANAGE_MASTER_DATA",
    );
    expect(mocks.advanceOrderQrPrintRequestStatus).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "request-1",
      "IN_PROGRESS",
    );
  });

  it("rejects unknown status values before writing", async () => {
    const response = await PATCH(
      new Request(requestUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      }),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.advanceOrderQrPrintRequestStatus).not.toHaveBeenCalled();
  });

  it("returns a conflict for illegal lifecycle transitions", async () => {
    mocks.advanceOrderQrPrintRequestStatus.mockResolvedValue({
      success: false,
      reason: "INVALID_TRANSITION",
    });
    const response = await PATCH(
      new Request(requestUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      }),
      { params: Promise.resolve({ requestId: "request-1" }) },
    );

    expect(response.status).toBe(409);
  });
});
