import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  createPurchaseRecord: vi.fn(),
  deletePurchaseRecords: vi.fn(),
  listPurchaseRecords: vi.fn(),
  updatePurchaseRecord: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({ requireSessionUser: mocks.requireSessionUser }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/purchase-bill-service", () => ({
  createPurchaseRecord: mocks.createPurchaseRecord,
  deletePurchaseRecords: mocks.deletePurchaseRecords,
  listPurchaseRecords: mocks.listPurchaseRecords,
  updatePurchaseRecord: mocks.updatePurchaseRecord,
}));

import { DELETE, GET, PATCH, POST } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };
const request = (method: string, body?: unknown) => new Request(
  "http://localhost/api/organizations/public-org/pos/purchase-bill/records",
  {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  },
);

describe("POS purchase-record API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.listPurchaseRecords.mockResolvedValue([]);
    mocks.createPurchaseRecord.mockResolvedValue({ id: "record-1" });
    mocks.updatePurchaseRecord.mockResolvedValue({ id: "record-1" });
    mocks.deletePurchaseRecords.mockResolvedValue({ deleted: 1 });
  });

  it("requires view permission before listing purchase records", async () => {
    const response = await GET(request("GET"), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_PURCHASE_RECORDS",
    );
    expect(mocks.listPurchaseRecords).toHaveBeenCalledWith("internal-org-1", undefined);
  });

  it("requires management permission for record creation and updates", async () => {
    const create = await POST(request("POST", { itemType: "RAW_MATERIAL", lines: [] }), context);
    const update = await PATCH(request("PATCH", {
      recordId: "record-1",
      itemType: "RAW_MATERIAL",
      lines: [],
    }), context);

    expect(create.status).toBe(201);
    expect(update.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledTimes(2);
    for (const [actorId, organizationId, permission] of mocks.requireOrganizationPermission.mock.calls) {
      expect([actorId, organizationId, permission]).toEqual([
        "user-1",
        "internal-org-1",
        "MANAGE_POS_PURCHASE_RECORDS",
      ]);
    }
  });

  it("does not delete records when delete permission is missing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );
    const response = await DELETE(request("DELETE", { recordIds: ["record-1"] }), context);

    expect(response.status).toBe(403);
    expect(mocks.deletePurchaseRecords).not.toHaveBeenCalled();
  });
});
