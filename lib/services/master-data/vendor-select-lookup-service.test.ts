import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: { masterVendor: { findMany } },
}));

import { listVendorSelectOptionsForOrganization } from "./vendor-select-lookup-service";

describe("vendor select lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects only bounded, organization-scoped vendor labels", async () => {
    findMany.mockResolvedValue([
      { id: "vendor-1", vendor: "Vendor One" },
      { id: "vendor-2", vendor: "Vendor Two" },
    ]);

    await expect(listVendorSelectOptionsForOrganization("internal-org-id", {
      limit: 25,
      includeInactive: false,
    })).resolves.toEqual([
      { id: "vendor-1", label: "Vendor One" },
      { id: "vendor-2", label: "Vendor Two" },
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: { organization_id: "internal-org-id", is_active: true },
      select: { id: true, vendor: true },
      orderBy: [{ sort_order: "asc" }, { vendor: "asc" }],
      take: 25,
    });
  });

  it("caps lookup size and honors inactive-record requests", async () => {
    findMany.mockResolvedValue([]);

    await listVendorSelectOptionsForOrganization("internal-org-id", {
      limit: 500,
      includeInactive: true,
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organization_id: "internal-org-id" },
      take: 200,
    }));
  });
});
