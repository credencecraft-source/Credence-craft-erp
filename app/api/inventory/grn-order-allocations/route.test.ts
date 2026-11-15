import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getRmGrnOrderAllocationLines: vi.fn(),
  saveRmGrnOrderAllocations: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/inventory/rm-grn-order-allocation-service", () => ({
  getRmGrnOrderAllocationLines: mocks.getRmGrnOrderAllocationLines,
  saveRmGrnOrderAllocations: mocks.saveRmGrnOrderAllocations,
  InvalidRmGrnOrderAllocationError: class InvalidRmGrnOrderAllocationError extends Error {},
  RmGrnOrderAllocationNotFoundError: class RmGrnOrderAllocationNotFoundError extends Error {},
}));

import { GET, POST } from "./route";

describe("GRN order allocation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
  });

  it("loads lines only after resolving the authorized organization", async () => {
    mocks.getRmGrnOrderAllocationLines.mockResolvedValue({ lines: [{ groupedPurchaseOrderLineId: "line-1" }] });
    const response = await GET(new Request("http://localhost/api/inventory/grn-order-allocations?organizationId=public-org&allocationId=allocation-1"));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "VIEW_INVENTORY_RECEIPTS");
    expect(mocks.getRmGrnOrderAllocationLines).toHaveBeenCalledWith("internal-org-1", "allocation-1");
  });

  it("requires an inventory-capable role before saving allocations", async () => {
    mocks.saveRmGrnOrderAllocations.mockResolvedValue({ allocatedQuantity: "4", fullyAllocated: false });
    const response = await POST(new Request("http://localhost/api/inventory/grn-order-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        allocationId: "allocation-1",
        lines: [{ groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "4" }],
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "INVENTORY"]);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("user-1", "internal-org-1", "MANAGE_INVENTORY_RECEIPTS");
    expect(mocks.saveRmGrnOrderAllocations).toHaveBeenCalledWith("internal-org-1", "allocation-1", [
      { groupedPurchaseOrderLineId: "line-1", allocatedQuantity: "4" },
    ], "user-1");
  });

  it("does not save when organization authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Organization access denied."));
    const response = await POST(new Request("http://localhost/api/inventory/grn-order-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", allocationId: "allocation-1", lines: [] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.saveRmGrnOrderAllocations).not.toHaveBeenCalled();
  });

  it("denies viewing before loading allocation lines", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const response = await GET(new Request("http://localhost/api/inventory/grn-order-allocations?organizationId=public-org&allocationId=allocation-1"));

    expect(response.status).toBe(403);
    expect(mocks.getRmGrnOrderAllocationLines).not.toHaveBeenCalled();
  });

  it("denies allocation changes before saving", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const response = await POST(new Request("http://localhost/api/inventory/grn-order-allocations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", allocationId: "allocation-1", lines: [] }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.saveRmGrnOrderAllocations).not.toHaveBeenCalled();
  });
});