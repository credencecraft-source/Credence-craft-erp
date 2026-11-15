import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  getEffectiveSegmentRestrictions: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/services/platform/segment-restriction-service", () => ({
  getEffectiveSegmentRestrictions: mocks.getEffectiveSegmentRestrictions,
}));

import { validateOrganizationAccess } from "./restriction-guard";

describe("organization pricing-mode restrictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => {
      throw Object.assign(new Error(`Redirected to ${path}`), {
        digest: "NEXT_REDIRECT;replace",
      });
    });
  });

  it("does not apply segment restrictions to User Based organizations", async () => {
    mocks.getEffectiveSegmentRestrictions.mockResolvedValue([
      {
        master_module: "order-management",
        main_module: "merchandising",
        sub_module: "order-summary",
        restriction_type: "block",
      },
    ]);

    await expect(validateOrganizationAccess(
      { id: "internal-org-id", organization_id: "public-org-id", pricing_mode: "USER_BASED" },
      "/dashboard/workspace-id/organizations/public-org-id/order-management/merchandising/order-summary",
    )).resolves.toEqual([]);

    expect(mocks.getEffectiveSegmentRestrictions).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("continues enforcing segment restrictions for Module Based organizations", async () => {
    mocks.getEffectiveSegmentRestrictions.mockResolvedValue([
      {
        master_module: "order-management",
        main_module: "merchandising",
        sub_module: "order-summary",
        restriction_type: "block",
      },
    ]);

    await expect(validateOrganizationAccess(
      { id: "internal-org-id", organization_id: "public-org-id", pricing_mode: "MODULE_BASED" },
      "/dashboard/workspace-id/organizations/public-org-id/order-management/merchandising/order-summary",
    )).rejects.toMatchObject({ digest: "NEXT_REDIRECT;replace" });

    expect(mocks.getEffectiveSegmentRestrictions).toHaveBeenCalledWith("internal-org-id", undefined);
    expect(mocks.redirect).toHaveBeenCalledOnce();
  });
});
