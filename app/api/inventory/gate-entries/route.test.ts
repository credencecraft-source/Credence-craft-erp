import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  entryFindMany: vi.fn(),
  entryDeleteMany: vi.fn(),
  purchaseOrderFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/organizations/challan-number-configuration-service", () => ({
  reserveChallanNumber: vi.fn(),
}));
vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    gateEntry: { findMany: mocks.entryFindMany, deleteMany: mocks.entryDeleteMany },
    purchaseOrder: { findFirst: mocks.purchaseOrderFindFirst },
  },
}));

import { DELETE, GET, POST } from "./route";

describe("Gate Entry detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.entryFindMany.mockResolvedValue([{ id: "entry-1", entry_no: "GE-0001" }]);
    mocks.entryDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("loads only the requested entry in the authorized organization", async () => {
    const response = await GET(new Request(
      "http://localhost/api/inventory/gate-entries?organizationId=public-org&entryId=entry-1",
    ));

    expect(response.status).toBe(200);
    expect(mocks.entryFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-1", id: "entry-1" },
    }));
    expect(mocks.entryFindMany.mock.calls[0][0]).not.toHaveProperty("take");
  });

  it("returns not found when the entry is outside the authorized organization", async () => {
    mocks.entryFindMany.mockResolvedValue([]);
    const response = await GET(new Request(
      "http://localhost/api/inventory/gate-entries?organizationId=public-org&entryId=other-org-entry",
    ));

    expect(response.status).toBe(404);
  });

  it("denies gate-entry reads without VIEW_GATE_ENTRIES", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: VIEW_GATE_ENTRIES permission is required."),
    );

    const response = await GET(new Request(
      "http://localhost/api/inventory/gate-entries?organizationId=public-org",
    ));

    expect(response.status).toBe(403);
    expect(mocks.entryFindMany).not.toHaveBeenCalled();
  });

  it("denies gate-entry creation without CREATE_GATE_ENTRIES", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: CREATE_GATE_ENTRIES permission is required."),
    );

    const response = await POST(new Request("http://localhost/api/inventory/gate-entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizationId: "public-org",
        direction: "INWARD",
        movementType: "VISITOR",
        personName: "Visitor",
      }),
    }));

    expect(response.status).toBe(403);
    expect(mocks.entryFindMany).not.toHaveBeenCalled();
    expect(mocks.entryDeleteMany).not.toHaveBeenCalled();
  });

  it("requires the dedicated delete permission before removing gate entries", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(new Error("Access denied: This role does not have the required permission."));
    const response = await DELETE(new Request(
      "http://localhost/api/inventory/gate-entries?organizationId=public-org",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds: ["entry-1"] }),
      },
    ));

    expect(response.status).toBe(403);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "DELETE_GATE_ENTRIES",
    );
    expect(mocks.entryDeleteMany).not.toHaveBeenCalled();
  });

  it("deletes only selected entries in the authorized organization", async () => {
    const response = await DELETE(new Request(
      "http://localhost/api/inventory/gate-entries?organizationId=public-org",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryIds: ["entry-1"] }),
      },
    ));

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org",
      "DELETE_GATE_ENTRIES",
    );
    expect(mocks.entryDeleteMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-1", id: { in: ["entry-1"] } },
    });
  });
});
