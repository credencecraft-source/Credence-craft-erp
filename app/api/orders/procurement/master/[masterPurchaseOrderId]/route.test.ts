import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  deleteMasterPurchaseOrder: vi.fn(),
  getMasterPurchaseOrder: vi.fn(),
  notifyStoreForStockMasterGroup: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationContext: mocks.requireOrganizationContext }));
vi.mock("@/lib/services/orders/master-purchase-order-service", () => ({
  deleteMasterPurchaseOrder: mocks.deleteMasterPurchaseOrder,
  getMasterPurchaseOrder: mocks.getMasterPurchaseOrder,
  MasterPurchaseOrderDeletionConflictError: class MasterPurchaseOrderDeletionConflictError extends Error {},
}));
vi.mock("@/lib/services/inventory/rm-stock-verification-service", () => ({ notifyStoreForStockMasterGroup: mocks.notifyStoreForStockMasterGroup }));

import { MasterPurchaseOrderDeletionConflictError } from "@/lib/services/orders/master-purchase-order-service";
import { DELETE, GET, PUT } from "./route";

describe("Master Group Notify Store action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1", full_name: "Planner" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.notifyStoreForStockMasterGroup.mockResolvedValue({ notified: true, verificationTasks: 2 });
  });

  it("requires Merchandising authorization and notifies the tenant-scoped stock Master Group", async () => {
    const response = await PUT(new Request("http://localhost/api/orders/procurement/master/master-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", action: "notify-store" }),
    }), { params: Promise.resolve({ masterPurchaseOrderId: "master-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "MERCHANDISING"]);
    expect(mocks.notifyStoreForStockMasterGroup).toHaveBeenCalledWith("internal-org-1", "master-1", "user-1");
  });

  it("does not notify when organization authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Organization access denied."));
    const response = await PUT(new Request("http://localhost/api/orders/procurement/master/master-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: "public-org", action: "notify-store" }),
    }), { params: Promise.resolve({ masterPurchaseOrderId: "master-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.notifyStoreForStockMasterGroup).not.toHaveBeenCalled();
  });

  it("loads a tenant-scoped Master Group detail", async () => {
    mocks.getMasterPurchaseOrder.mockResolvedValue({ id: "master-1" });
    const response = await GET(new Request("http://localhost/api/orders/procurement/master/master-1?organizationId=public-org"), {
      params: Promise.resolve({ masterPurchaseOrderId: "master-1" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org");
    expect(mocks.getMasterPurchaseOrder).toHaveBeenCalledWith("internal-org-1", "master-1");
  });

  it("authorizes deletion and passes the authenticated actor to the service", async () => {
    const response = await DELETE(new Request("http://localhost/api/orders/procurement/master/master-1?organizationId=public-org", {
      method: "DELETE",
    }), { params: Promise.resolve({ masterPurchaseOrderId: "master-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "MERCHANDISING"]);
    expect(mocks.deleteMasterPurchaseOrder).toHaveBeenCalledWith("internal-org-1", "master-1", "user-1");
  });

  it("returns conflict when stock cannot be safely restored", async () => {
    mocks.deleteMasterPurchaseOrder.mockRejectedValue(new MasterPurchaseOrderDeletionConflictError("Stock cannot be restored."));

    const response = await DELETE(new Request("http://localhost/api/orders/procurement/master/master-1?organizationId=public-org", {
      method: "DELETE",
    }), { params: Promise.resolve({ masterPurchaseOrderId: "master-1" }) });
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe("Stock cannot be restored.");
  });

  it("does not delete when organization authorization fails", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Organization access denied."));

    const response = await DELETE(new Request("http://localhost/api/orders/procurement/master/master-1?organizationId=public-org", {
      method: "DELETE",
    }), { params: Promise.resolve({ masterPurchaseOrderId: "master-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.deleteMasterPurchaseOrder).not.toHaveBeenCalled();
  });
});