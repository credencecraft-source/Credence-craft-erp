import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  verifyWorkOrderInventoryGrnLine: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/inventory/work-order-grn-service", () => ({
  verifyWorkOrderInventoryGrnLine: mocks.verifyWorkOrderInventoryGrnLine,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ grnId: "grn-1", lineId: "line-1" }) };
const postRequest = (body: unknown) => new Request("http://localhost/api/inventory/work-order-grns/grn-1/lines/line-1/verification", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

describe("work-order GRN line verification route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "verifier-1", email: "verifier@example.test" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.verifyWorkOrderInventoryGrnLine.mockResolvedValue({
      grnId: "grn-1",
      lineId: "line-1",
      status: "VERIFIED",
    });
  });

  it("authenticates, authorizes Inventory, and submits tenant-scoped verification quantities", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      actualReceivedQuantity: "8",
      approvedQuantity: 6,
      locationId: " location-1 ",
      storageNodeId: " storage-leaf ",
    }), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "verifier-1",
      "public-org",
      ["OWNER", "ADMIN", "INVENTORY"],
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith("verifier-1", "internal-org-1", "MANAGE_INVENTORY_RECEIPTS");
    expect(mocks.verifyWorkOrderInventoryGrnLine).toHaveBeenCalledWith(
      "internal-org-1",
      "verifier-1",
      "grn-1",
      "line-1",
      {
        actualReceivedQuantity: 8,
        approvedQuantity: 6,
        locationId: "location-1",
        storageNodeId: "storage-leaf",
        actorEmail: "verifier@example.test",
      },
    );
  });

  it("rejects fractional quantities without attempting a save", async () => {
    const response = await POST(postRequest({
      organizationId: "public-org",
      actualReceivedQuantity: 8,
      approvedQuantity: 2.5,
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.verifyWorkOrderInventoryGrnLine).not.toHaveBeenCalled();
  });

  it("does not save when Inventory permission is denied", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Insufficient organization permissions."));
    const response = await POST(postRequest({
      organizationId: "public-org",
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.verifyWorkOrderInventoryGrnLine).not.toHaveBeenCalled();
  });

  it("does not verify a GRN when the dedicated receiving permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );
    const response = await POST(postRequest({
      organizationId: "public-org",
      actualReceivedQuantity: 8,
      approvedQuantity: 6,
    }), context);

    expect(response.status).toBe(403);
    expect(mocks.verifyWorkOrderInventoryGrnLine).not.toHaveBeenCalled();
  });
});
