import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  requireOrganizationAccess: vi.fn(),
  requireOrganizationPermission: vi.fn(),
}));

vi.mock("@/lib/database/prisma-client", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationAccess: mocks.requireOrganizationAccess,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import { setOrganizationTaxProfile } from "./organization-tax-profile-service";

describe("setOrganizationTaxProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationAccess.mockResolvedValue({ role: "FINANCE" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
  });

  it("requires tax-rule management permission before writing", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: MANAGE_TAX_RULES permission is required."),
    );

    await expect(setOrganizationTaxProfile("org-internal", "user-1", {}))
      .rejects.toThrow("MANAGE_TAX_RULES permission is required.");

    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "org-internal",
      "MANAGE_TAX_RULES",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
