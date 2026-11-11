import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  reconcileSelectedWorkOrderGrns: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/inventory/work-order-grn-reconciliation-service", () => ({
  reconcileSelectedWorkOrderGrns: mocks.reconcileSelectedWorkOrderGrns,
}));

import { POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/inventory/work-order-grns/reconciliation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Work Order GRN reconciliation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.reconcileSelectedWorkOrderGrns.mockResolvedValue({ applied: false, records: [] });
  });

  it("requires organization inventory access and previews selected GRNs", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org-1",
      grnIds: ["grn-1"],
      action: "preview",
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.reconcileSelectedWorkOrderGrns).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["grn-1"],
      false,
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_INVENTORY_RECEIPTS",
    );
  });

  it("applies only an explicit confirmation action", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org-1",
      grnIds: ["grn-1"],
      action: "apply",
    }));

    expect(response.status).toBe(200);
    expect(mocks.reconcileSelectedWorkOrderGrns).toHaveBeenCalledWith(
      "internal-org-1",
      "user-1",
      ["grn-1"],
      true,
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "MANAGE_INVENTORY_RECEIPTS",
    );
  });

  it("rejects invalid selections before calling the service", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org-1",
      grnIds: [],
      action: "apply",
    }));

    expect(response.status).toBe(400);
    expect(mocks.reconcileSelectedWorkOrderGrns).not.toHaveBeenCalled();
  });

  it("does not apply reconciliation when receiving permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );
    const response = await POST(postRequest({
      organizationId: "public-org-1",
      grnIds: ["grn-1"],
      action: "apply",
    }));

    expect(response.status).toBe(403);
    expect(mocks.reconcileSelectedWorkOrderGrns).not.toHaveBeenCalled();
  });
});
