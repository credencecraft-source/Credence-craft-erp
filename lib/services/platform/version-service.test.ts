import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  transactionMock,
  requirePlatformSessionAdminMock,
  requirePlatformConfigurationAccessMock,
} = vi.hoisted(() => {
  const prismaMock = {
    $transaction: vi.fn(),
    platformVersion: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "version-copy-id", version_name: "2026 Copy", version_type: "PREMIUM", description: "source description", is_active: true }),
      delete: vi.fn().mockResolvedValue({ id: "version-id" }),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      count: vi.fn().mockResolvedValue(0),
    },
    businessType: { findMany: vi.fn().mockResolvedValue([]) },
    segment: { findMany: vi.fn().mockResolvedValue([]) },
    versionBusinessType: { create: vi.fn().mockResolvedValue({ id: "vbt-id" }) },
    versionBusinessTypeTag: { create: vi.fn().mockResolvedValue({ id: "vbt-tag-id" }) },
    versionBusinessTypeSegment: { create: vi.fn().mockResolvedValue({ id: "vbts-id" }) },
    versionBusinessTypeSegmentTag: { create: vi.fn().mockResolvedValue({ id: "vbts-tag-id" }) },
    versionBusinessTypeSegmentLocationLimit: { create: vi.fn().mockResolvedValue({ id: "limit-id" }) },
    segmentRestriction: { create: vi.fn().mockResolvedValue({ id: "restriction-id" }) },
    segmentFormRestriction: { create: vi.fn().mockResolvedValue({ id: "form-restriction-id" }) },
    versionTransactionRestriction: { create: vi.fn().mockResolvedValue({ id: "version-restriction-id" }) },
  };

  return {
    prismaMock,
    transactionMock: {
      platformVersion: prismaMock.platformVersion,
      versionBusinessType: prismaMock.versionBusinessType,
      versionBusinessTypeTag: prismaMock.versionBusinessTypeTag,
      versionBusinessTypeSegment: prismaMock.versionBusinessTypeSegment,
      versionBusinessTypeSegmentTag: prismaMock.versionBusinessTypeSegmentTag,
      versionBusinessTypeSegmentLocationLimit: prismaMock.versionBusinessTypeSegmentLocationLimit,
      segmentRestriction: prismaMock.segmentRestriction,
      segmentFormRestriction: prismaMock.segmentFormRestriction,
      versionTransactionRestriction: prismaMock.versionTransactionRestriction,
    },
    requirePlatformSessionAdminMock: vi.fn().mockResolvedValue({ id: "admin-id" }),
    requirePlatformConfigurationAccessMock: vi.fn().mockResolvedValue({ id: "admin-id" }),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
  requirePlatformConfigurationAccess: requirePlatformConfigurationAccessMock,
}));
vi.mock("@/lib/services/platform/segment-service", () => ({
  ensureDefaultSegments: vi.fn().mockResolvedValue(undefined),
}));

import { createVersion, deleteVersion, duplicateVersion, updateVersionDetails } from "./version-service";

describe("version service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-id" });
    prismaMock.$transaction.mockImplementation(async (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock));
    prismaMock.platformVersion.findUnique.mockResolvedValueOnce({
      id: "source-version-id",
      version_name: "2026",
      version_type: "PREMIUM",
      description: "Original description",
      is_active: true,
      businessTypes: [
        {
          business_type_id: "business-type-1",
          is_free: false,
          tags: [{ platform_tag_id: "tag-a-id" }],
          segments: [
            {
              segment_id: "segment-1",
              is_active: true,
              label: "Base label",
              price: "12.50",
              tags: [{ label: "Segment Tag" }],
              restrictions: [{
                master_module: "Orders",
                main_module: "Sales",
                sub_module: "Create",
                action_level: "Create",
                url_pattern: "/orders",
                restriction_type: "block",
                custom_message: "Blocked",
              }],
              formRestrictions: [{
                form_key: "order_form",
                monthly_qty_limit: 5,
                monthly_entry_limit: 10,
                restricted_fields: ["fieldA"],
                field_sum_limits: { total: 20 },
              }],
              locationLimit: { max_locations: 3 },
            },
          ],
        },
      ],
      transactionRestrictions: [{
        segment_id: "segment-1",
        form_key: "order_form",
        monthly_entry_limit: 15,
      }],
    }).mockResolvedValue(null);
    prismaMock.platformVersion.create.mockResolvedValue({ id: "version-copy-id", version_name: "2026 Copy", version_type: "PREMIUM", description: "Original description", is_active: true });
    prismaMock.versionBusinessType.create.mockResolvedValue({ id: "vbt-id" });
    prismaMock.versionBusinessTypeSegment.create.mockResolvedValue({ id: "vbts-id" });
  });

  it("creates a version with its selected type", async () => {
    prismaMock.platformVersion.findUnique.mockReset().mockResolvedValue(null);

    await createVersion({
      versionName: "2027",
      versionType: "BEST_PRICE",
      description: "Best price release",
    });

    expect(prismaMock.platformVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version_name: "2027",
        version_type: "BEST_PRICE",
        description: "Best price release",
      }),
    }));
  });

  it("rejects an unsupported version type", async () => {
    await expect(createVersion({
      versionName: "2027",
      versionType: "INVALID",
    })).rejects.toThrow("Select a valid version type.");

    expect(prismaMock.platformVersion.create).not.toHaveBeenCalled();
  });

  it("duplicates a version as a distinct standalone record with copied restrictions", async () => {
    const result = await duplicateVersion("source-version-id");

    expect(result).toMatchObject({ id: "version-copy-id", version_name: "2026 Copy" });
    expect(prismaMock.platformVersion.findUnique).toHaveBeenCalledWith({
      where: { id: "source-version-id" },
      include: expect.objectContaining({
        businessTypes: { include: expect.objectContaining({ segments: { include: expect.objectContaining({ restrictions: true }) } }) },
      }),
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.platformVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ version_type: "PREMIUM" }),
    }));
    expect(prismaMock.versionBusinessType.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version_id: "version-copy-id",
        business_type_id: "business-type-1",
      }),
    }));
    expect(prismaMock.versionBusinessTypeTag.create).toHaveBeenCalledWith({
      data: {
        version_business_type_id: "vbt-id",
        platform_tag_id: "tag-a-id",
      },
    });
    expect(prismaMock.versionBusinessTypeSegment.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version_business_type_id: "vbt-id",
        segment_id: "segment-1",
      }),
    }));
    expect(prismaMock.versionTransactionRestriction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version_id: "version-copy-id",
        segment_id: "segment-1",
      }),
    }));
  });

  it("blocks deleting a version that is already assigned to an organization", async () => {
    prismaMock.organization.count.mockResolvedValueOnce(1);

    await expect(deleteVersion("version-id")).rejects.toThrow(
      "This version is already assigned to one or more organizations and cannot be deleted."
    );

    expect(prismaMock.organization.count).toHaveBeenCalledWith({ where: { platform_version_id: "version-id" } });
    expect(prismaMock.platformVersion.delete).not.toHaveBeenCalled();
  });

  it("updates version name, type, and description after configuration authorization", async () => {
    prismaMock.platformVersion.findFirst.mockResolvedValue(null);
    prismaMock.platformVersion.update.mockResolvedValue({
      id: "version-id",
      version_name: "2027",
      description: "Annual release",
    });

    await updateVersionDetails("version-id", "  2027  ", "  Annual release  ", "BEST_PRICE");

    expect(requirePlatformConfigurationAccessMock).toHaveBeenCalledOnce();
    expect(prismaMock.platformVersion.update).toHaveBeenCalledWith({
      where: { id: "version-id" },
      data: { version_name: "2027", description: "Annual release", version_type: "BEST_PRICE" },
    });
  });

  it("rejects duplicate version names and invalid lengths", async () => {
    await expect(updateVersionDetails("version-id", " ", undefined, "REGULAR_PRICE")).rejects.toThrow("Version name is required.");
    await expect(updateVersionDetails("version-id", "x".repeat(101), undefined, "REGULAR_PRICE")).rejects.toThrow(
      "Version name must be 100 characters or fewer.",
    );
    await expect(updateVersionDetails("version-id", "2027", "x".repeat(501), "REGULAR_PRICE")).rejects.toThrow(
      "Version description must be 500 characters or fewer.",
    );
    prismaMock.platformVersion.findFirst.mockResolvedValue({ id: "other-version" });
    await expect(updateVersionDetails("version-id", "2027", undefined, "REGULAR_PRICE")).rejects.toThrow(
      "A version with this name already exists.",
    );
    expect(prismaMock.platformVersion.update).not.toHaveBeenCalled();
  });

  it("rejects an unsupported version type when updating a version", async () => {
    await expect(updateVersionDetails("version-id", "2027", undefined, "INVALID")).rejects.toThrow(
      "Select a valid version type.",
    );

    expect(prismaMock.platformVersion.update).not.toHaveBeenCalled();
  });
});
