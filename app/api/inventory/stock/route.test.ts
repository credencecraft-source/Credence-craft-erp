import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  addRawMaterialStockManually: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: { rawMaterialStock: { findMany: vi.fn() } } }));
vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({ requireOrganizationContext: mocks.requireOrganizationContext }));
vi.mock("@/lib/services/inventory/rm-general-inventory-service", () => ({ listRawMaterialGeneralInventory: vi.fn() }));
vi.mock("@/lib/services/inventory/rm-manual-stock-service", () => {
  class ManualStockError extends Error {
    constructor(message: string, readonly status: number = 400) {
      super(message);
    }
  }
  return { addRawMaterialStockManually: mocks.addRawMaterialStockManually, ManualStockError };
});

import { POST } from "./route";

const request = () => new Request("http://localhost/api/inventory/stock", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ organizationId: "public-org", rawMaterialId: "material-1", locationId: "location-1", quantity: "2", reason: "Opening balance" }),
});

describe("manual raw-material stock endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.addRawMaterialStockManually.mockResolvedValue({ id: "stock-1" });
  });

  it("requires an authorized organization role and passes the internal organization ID", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith("user-1", "public-org", ["OWNER", "ADMIN", "INVENTORY"]);
    expect(mocks.addRawMaterialStockManually).toHaveBeenCalledWith({
      organizationId: "internal-org-1",
      userId: "user-1",
      rawMaterialId: "material-1",
      locationId: "location-1",
      quantity: "2",
      reason: "Opening balance",
    });
  });

  it("rejects unauthenticated requests without attempting organization access", async () => {
    mocks.requireSessionUser.mockRejectedValue(new Error("Unauthenticated"));

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.requireOrganizationContext).not.toHaveBeenCalled();
    expect(mocks.addRawMaterialStockManually).not.toHaveBeenCalled();
  });

  it("rejects insufficient organization access without adding stock", async () => {
    mocks.requireOrganizationContext.mockRejectedValue(new Error("Access denied: insufficient organization permissions."));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.addRawMaterialStockManually).not.toHaveBeenCalled();
  });
});