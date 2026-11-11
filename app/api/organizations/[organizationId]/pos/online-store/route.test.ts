import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  requireOrganizationContext: vi.fn(),
  requireOrganizationPermission: vi.fn(),
  getSettings: vi.fn(),
  getPresentation: vi.fn(),
  savePresentation: vi.fn(),
  setEnabled: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationContext: mocks.requireOrganizationContext,
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));
vi.mock("@/lib/services/pos/public-online-store-service", () => ({
  getOrganizationOnlineStorePresentation: mocks.getPresentation,
  getOrganizationOnlineStoreSettings: mocks.getSettings,
  saveOrganizationOnlineStorePresentation: mocks.savePresentation,
  setOrganizationOnlineStoreEnabled: mocks.setEnabled,
}));

import { GET, PATCH } from "./route";

const context = { params: Promise.resolve({ organizationId: "public-org" }) };

describe("POS online-store settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-1" });
    mocks.requireOrganizationContext.mockResolvedValue({ id: "internal-org-1" });
    mocks.requireOrganizationPermission.mockResolvedValue(undefined);
    mocks.getSettings.mockResolvedValue({
      online_store_enabled: false,
      online_store_public_key: null,
    });
    mocks.getPresentation.mockResolvedValue({});
    mocks.setEnabled.mockResolvedValue(undefined);
    mocks.savePresentation.mockResolvedValue({});
  });

  it("requires the online-store view permission to load settings", async () => {
    const response = await GET(new Request("http://localhost/api/online-store"), context);

    expect(response.status).toBe(200);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "internal-org-1",
      "VIEW_POS_ONLINE_STORE",
    );
  });

  it("requires the online-store management permission before changing its enabled state", async () => {
    mocks.requireOrganizationPermission.mockRejectedValue(
      new Error("Access denied: This role does not have the required permission."),
    );

    const response = await PATCH(
      new Request("http://localhost/api/online-store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
      context,
    );

    expect(response.status).toBe(403);
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });
});
