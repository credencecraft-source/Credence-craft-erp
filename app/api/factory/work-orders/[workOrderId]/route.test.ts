import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  updateWorkOrder: vi.fn(),
  deleteWorkOrder: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/factory/work-order-service", () => ({
  updateWorkOrder: mocks.updateWorkOrder,
  deleteWorkOrder: mocks.deleteWorkOrder,
}));

import { DELETE, PATCH } from "./route";

const context = { params: Promise.resolve({ workOrderId: "work-order-1" }) };
const patchRequest = (body: unknown) => new Request("http://localhost/api/factory/work-orders/work-order-1", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("factory work-order detail authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.updateWorkOrder.mockResolvedValue({ id: "work-order-1" });
    mocks.deleteWorkOrder.mockResolvedValue(undefined);
  });

  it("requires the dedicated update permission before updating a work order", async () => {
    const response = await PATCH(patchRequest({
      organizationId: "public-org",
      status: "IN_PROGRESS",
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "UPDATE_WORK_ORDERS",
    );
    expect(mocks.updateWorkOrder).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      "work-order-1",
      { status: "IN_PROGRESS" },
    );
  });

  it("does not delete a work order when its dedicated permission is denied", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const request = new Request("http://localhost/api/factory/work-orders/work-order-1?organizationId=public-org", {
      method: "DELETE",
    });

    const response = await DELETE(request, context);

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "DELETE_WORK_ORDERS",
    );
    expect(mocks.deleteWorkOrder).not.toHaveBeenCalled();
  });
});
