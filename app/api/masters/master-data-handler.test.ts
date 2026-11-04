import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSessionUser: vi.fn(),
  getOrganizationForUser: vi.fn(),
  createMasterValueForOrganization: vi.fn(),
  getMasterValuesForOrganization: vi.fn(),
}));

vi.mock("@/lib/auth/session-manager", () => ({
  requireSessionUser: mocks.requireSessionUser,
}));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  getOrganizationForUser: mocks.getOrganizationForUser,
  requireOrganizationPermission: vi.fn(),
}));
vi.mock("@/lib/master-data/master-data-constants", () => {
  return {
    MASTER_DEFINITIONS: [
      { key: "vendor", label: "Vendor", fields: [] },
      { key: "gst", label: "GST", fields: [] },
      { key: "hsn", label: "HSN", fields: [] },
      { key: "sub-category", label: "Sub Category", fields: [] },
      { key: "internal-test", label: "Internal", fields: [], hidden: true },
    ],
    getMasterDefinition: vi.fn(),
    createMasterValueForOrganization: mocks.createMasterValueForOrganization,
    getMasterValuesForOrganization: mocks.getMasterValuesForOrganization,
  };
});

import { GET } from "./master-data-handler";

describe("/api/masters GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: "user-id", workspace_id: "workspace-id" });
    mocks.getOrganizationForUser.mockResolvedValue({ id: "internal-org-id" });
    mocks.getMasterValuesForOrganization.mockResolvedValue([]);
  });

  it("requires a bounded list of requested module keys", async () => {
    const response = await GET(new Request("http://localhost/api/masters?organizationId=public-org"));

    expect(response.status).toBe(400);
    expect(mocks.getMasterValuesForOrganization).not.toHaveBeenCalled();
  });

  it("loads only the requested visible masters with a bounded limit", async () => {
    const response = await GET(new Request(
      "http://localhost/api/masters?organizationId=public-org&moduleKeys=vendor,gst,vendor&limit=80",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.masters.map((master: { module_key: string }) => master.module_key)).toEqual(["vendor", "gst"]);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledTimes(2);
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledWith(
      "internal-org-id",
      "vendor",
      false,
      { limit: 80 },
    );
    expect(mocks.getMasterValuesForOrganization).toHaveBeenCalledWith(
      "internal-org-id",
      "gst",
      false,
      { limit: 80 },
    );
  });
});
