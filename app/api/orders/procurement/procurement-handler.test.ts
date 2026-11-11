import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  requireOrganizationOrderManagementPermission: vi.fn(),
  listGroupedPurchaseOrdersPage: vi.fn(),
  listGeneralPurchaseOrderRequests: vi.fn(),
  listGeneralPurchaseOrderGroups: vi.fn(),
  getProcurementSummary: vi.fn(),
  listAllocatableBomRowsPage: vi.fn(),
  listMasterPurchaseOrdersPage: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
  requireOrganizationOrderManagementPermission: mocks.requireOrganizationOrderManagementPermission,
}));
vi.mock("@/lib/services/orders/general-purchase-order-service", () => ({
  approveGeneralPurchaseOrderPrice: vi.fn(),
  createGeneralPurchaseOrderFromGroups: vi.fn(),
  createGeneralPurchaseOrderGroups: vi.fn(),
  createGeneralPurchaseOrderRequests: vi.fn(),
  listGeneralPurchaseOrderGroups: mocks.listGeneralPurchaseOrderGroups,
  listGeneralPurchaseOrderRequests: mocks.listGeneralPurchaseOrderRequests,
  saveGeneralPurchaseOrderPrice: vi.fn(),
}));
vi.mock("@/lib/services/orders/grouped-purchase-order-service", () => ({
  createGroupedPurchaseOrder: vi.fn(),
  getProcurementSummary: mocks.getProcurementSummary,
  listAllocatableBomRowsPage: mocks.listAllocatableBomRowsPage,
  listGroupedPurchaseOrdersPage: mocks.listGroupedPurchaseOrdersPage,
}));
vi.mock("@/lib/services/orders/master-purchase-order-service", () => ({
  createMasterPurchaseOrder: vi.fn(),
  listMasterPurchaseOrdersPage: mocks.listMasterPurchaseOrdersPage,
}));

import { GET } from "./procurement-handler";

describe("procurement list pagination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.requireOrganizationOrderManagementPermission.mockResolvedValue(undefined);
    mocks.listGroupedPurchaseOrdersPage.mockResolvedValue({
      groupedPurchaseOrders: [{ id: "group-1" }],
      nextCursor: "group-1",
    });
  });

  it("uses the tenant-scoped cursor page and clamps the all-view request to 100 rows", async () => {
    const response = await GET(new Request(
      "http://localhost/api/orders/procurement?organizationId=public-org&view=all&limit=250&cursor=cursor-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.listGroupedPurchaseOrdersPage).toHaveBeenCalledWith(
      "internal-org-1",
      undefined,
      { limit: 100, cursor: "cursor-1" },
    );
    await expect(response.json()).resolves.toEqual({
      groupedPurchaseOrders: [{ id: "group-1" }],
      nextGroupedCursor: "group-1",
    });
  });

  it("denies purchase-order reads before loading data when permission is missing", async () => {
    mocks.requireOrganizationOrderManagementPermission.mockRejectedValue(
      new Error("Access denied: VIEW_PURCHASE_ORDERS permission is required."),
    );

    const response = await GET(new Request(
      "http://localhost/api/orders/procurement?organizationId=public-org&view=all",
    ));

    expect(response.status).toBe(403);
    expect(mocks.listGroupedPurchaseOrdersPage).not.toHaveBeenCalled();
  });

  it("rejects malformed or repeated pagination parameters before querying", async () => {
    const malformed = await GET(new Request(
      "http://localhost/api/orders/procurement?organizationId=public-org&view=all&limit=1.5",
    ));
    const repeated = await GET(new Request(
      "http://localhost/api/orders/procurement?organizationId=public-org&view=all&limit=10&limit=20",
    ));

    expect(malformed.status).toBe(400);
    expect(repeated.status).toBe(400);
    expect(mocks.listGroupedPurchaseOrdersPage).not.toHaveBeenCalled();
  });

  it("applies the same hard limit to master cursors in create views", async () => {
    const response = await GET(new Request(
      "http://localhost/api/orders/procurement?organizationId=public-org&view=create&include=master&limit=250&masterCursor=master-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.listMasterPurchaseOrdersPage).toHaveBeenCalledWith(
      "internal-org-1",
      { limit: 100, cursor: "master-1" },
    );
    expect(mocks.listGroupedPurchaseOrdersPage).not.toHaveBeenCalled();
  });
});
