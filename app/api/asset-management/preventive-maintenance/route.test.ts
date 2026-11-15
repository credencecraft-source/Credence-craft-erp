import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getPreventiveMaintenanceDashboard: vi.fn(),
  registerMaintenanceAsset: vi.fn(),
  createPreventiveMaintenancePlan: vi.fn(),
  generateDueMaintenanceWorkOrders: vi.fn(),
  updateMaintenanceChecklistItem: vi.fn(),
  completeMaintenanceWorkOrder: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

vi.mock("@/lib/services/asset-management/preventive-maintenance-service", () => ({
  PreventiveMaintenanceError: class PreventiveMaintenanceError extends Error {
    constructor(message: string, readonly status = 400) {
      super(message);
      this.name = "PreventiveMaintenanceError";
    }
  },
  getPreventiveMaintenanceDashboard: mocks.getPreventiveMaintenanceDashboard,
  registerMaintenanceAsset: mocks.registerMaintenanceAsset,
  createPreventiveMaintenancePlan: mocks.createPreventiveMaintenancePlan,
  generateDueMaintenanceWorkOrders: mocks.generateDueMaintenanceWorkOrders,
  updateMaintenanceChecklistItem: mocks.updateMaintenanceChecklistItem,
  completeMaintenanceWorkOrder: mocks.completeMaintenanceWorkOrder,
}));

import { GET, POST } from "./route";

describe("Preventive Maintenance API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", full_name: "Operator", email: "operator@example.com" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue({ organization_id: "internal-org-1", role: "OWNER" });
    mocks.getPreventiveMaintenanceDashboard.mockResolvedValue({ assets: [], plans: [], workOrders: [] });
    mocks.registerMaintenanceAsset.mockResolvedValue({ id: "asset-1" });
  });

  it("uses the authorized internal organization when loading the dashboard", async () => {
    const response = await GET(new Request("http://localhost/api/asset-management/preventive-maintenance?organizationId=public-org"));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.getPreventiveMaintenanceDashboard).toHaveBeenCalledWith("internal-org-1", "user-1");
  });

  it("authorizes mutations before calling a tenant-scoped service", async () => {
    const response = await POST(new Request("http://localhost/api/asset-management/preventive-maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        action: "register-asset",
        assetTag: "PRESS-01",
        masterRawMaterialId: "asset-type-1",
        locationId: "location-1",
        criticality: "HIGH",
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
    );
    expect(mocks.registerMaintenanceAsset).toHaveBeenCalledWith("internal-org-1", "user-1", expect.objectContaining({
      assetTag: "PRESS-01",
    }));
  });

  it("returns an internal failure without exposing unexpected exception details", async () => {
    mocks.getPreventiveMaintenanceDashboard.mockRejectedValue(new Error("sensitive database diagnostic"));
    const response = await GET(new Request("http://localhost/api/asset-management/preventive-maintenance?organizationId=public-org"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unable to load Preventive Maintenance." });
  });

  it("reports organization membership failures as forbidden", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: insufficient organization permissions."));
    const response = await GET(new Request("http://localhost/api/asset-management/preventive-maintenance?organizationId=public-org"));

    expect(response.status).toBe(403);
  });

  it("reports missing PM permission as forbidden", async () => {
    mocks.getPreventiveMaintenanceDashboard.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const response = await GET(new Request("http://localhost/api/asset-management/preventive-maintenance?organizationId=public-org"));

    expect(response.status).toBe(403);
  });

  it("rejects malformed request bodies before resolving organization access", async () => {
    const response = await POST(new Request("http://localhost/api/asset-management/preventive-maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    }));

    expect(response.status).toBe(400);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
  });
});
