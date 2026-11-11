import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createPurchaseBill: vi.fn(),
  listPurchaseBills: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/purchase-bill-service", () => ({
  createPurchaseBill: mocks.createPurchaseBill,
  listPurchaseBills: mocks.listPurchaseBills,
}));

import { GET, POST } from "./route";

describe("POS purchase bill report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.createPurchaseBill.mockResolvedValue({ id: "bill-1" });
    mocks.listPurchaseBills.mockResolvedValue({
      bills: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it("uses a bounded tenant-authorized page and returns its cursor", async () => {
    const createdAt = new Date("2026-10-17T00:00:00.000Z");
    mocks.listPurchaseBills.mockResolvedValue({
      bills: [{ id: "bill-1", documentNumber: "PB-001" }],
      hasMore: true,
      nextCursor: { id: "bill-1", createdAt },
    });

    const response = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/purchase-bill?limit=25&search=vendor"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationContext).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      ["OWNER", "ADMIN", "FINANCE", "MERCHANDISING"],
    );
    expect(mocks.listPurchaseBills).toHaveBeenCalledWith("internal-org-1", {
      take: 25,
      cursor: undefined,
      search: "vendor",
    });
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_PURCHASE_RECORDS",
    );
    expect(result.bills).toEqual([{ id: "bill-1", documentNumber: "PB-001" }]);
    expect(result.nextCursor).toBe(Buffer.from(JSON.stringify({
      id: "bill-1",
      createdAt: createdAt.toISOString(),
    })).toString("base64url"));
  });

  it("rejects malformed cursors, page sizes, and oversized searches", async () => {
    const invalidCursor = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/purchase-bill?cursor=invalid"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const invalidLimit = await GET(
      new Request("http://localhost/api/organizations/public-org/pos/purchase-bill?limit=101"),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );
    const oversizedSearch = await GET(
      new Request(`http://localhost/api/organizations/public-org/pos/purchase-bill?search=${"a".repeat(101)}`),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(invalidCursor.status).toBe(400);
    expect(invalidLimit.status).toBe(400);
    expect(oversizedSearch.status).toBe(400);
    expect(mocks.listPurchaseBills).not.toHaveBeenCalled();
  });

  it("requires bill-post permission before creating a purchase bill", async () => {
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/purchase-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: "entity-1",
          vendorId: "vendor-1",
          billNumber: "BILL-1",
          billDate: "2026-11-11",
          recordIds: ["record-1"],
        }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "POST_POS_PURCHASE_BILLS",
    );
    expect(mocks.createPurchaseBill).toHaveBeenCalledWith("internal-org-1", "user-1", expect.objectContaining({
      entityId: "entity-1",
      vendorId: "vendor-1",
      recordIds: ["record-1"],
    }));
  });

  it("does not post bills when the dedicated permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );
    const response = await POST(
      new Request("http://localhost/api/organizations/public-org/pos/purchase-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordIds: ["record-1"] }),
      }),
      { params: Promise.resolve({ organizationId: "public-org" }) },
    );

    expect(response.status).toBe(403);
    expect(mocks.createPurchaseBill).not.toHaveBeenCalled();
  });
});
