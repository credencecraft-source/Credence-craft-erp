import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock, requirePlatformSessionAdminMock } = vi.hoisted(() => {
  const transactionMock = {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    platformVersion: {
      findFirst: vi.fn(),
    },
    versionBusinessTypeSegment: {
      findMany: vi.fn(),
    },
    organizationSegmentPrice: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
  };

  return {
    transactionMock,
    prismaMock: {
      platformVersion: { findMany: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: typeof transactionMock) => Promise<unknown>) =>
        callback(transactionMock),
      ),
    },
    requirePlatformSessionAdminMock: vi.fn().mockResolvedValue({ id: "admin-id" }),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));

import { assignOrganizationPlatformVersion, listPlatformVersions } from "./client-service";

describe("organization platform version service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-id" });
    transactionMock.organization.findUnique.mockResolvedValue({
      id: "organization-id",
      platform_version_id: "previous-version-id",
    });
    transactionMock.platformVersion.findFirst.mockResolvedValue({
      id: "version-id",
      version_type: "PREMIUM",
    });
    transactionMock.versionBusinessTypeSegment.findMany.mockResolvedValue([
      { id: "segment-assignment-id", price: "15.00" },
    ]);
    transactionMock.organization.update.mockResolvedValue({
      id: "organization-id",
      platform_version_id: "version-id",
    });
  });

  it("includes version types in the active version catalog", async () => {
    await listPlatformVersions();

    expect(prismaMock.platformVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ version_type: true }),
    }));
  });

  it("prevents assignment when the selected version does not match the chosen type", async () => {
    await expect(assignOrganizationPlatformVersion(
      "organization-id",
      "version-id",
      "BEST_PRICE",
    )).rejects.toThrow("The selected version does not match the chosen version type.");

    expect(transactionMock.organization.update).not.toHaveBeenCalled();
    expect(transactionMock.organizationSegmentPrice.deleteMany).not.toHaveBeenCalled();
  });

  it("assigns a version when its type matches the chosen type", async () => {
    await assignOrganizationPlatformVersion("organization-id", "version-id", "PREMIUM");

    expect(transactionMock.organization.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "organization-id" },
      data: { platform_version_id: "version-id" },
    }));
    expect(transactionMock.organizationSegmentPrice.createMany).toHaveBeenCalledWith({
      data: [{
        organization_id: "organization-id",
        version_business_type_segment_id: "segment-assignment-id",
        snapshot_price: "15.00",
        updated_by_platform_admin_id: "admin-id",
      }],
    });
    expect(transactionMock.auditEvent.create).toHaveBeenCalledOnce();
  });
});
