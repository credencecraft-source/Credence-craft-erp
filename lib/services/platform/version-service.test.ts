import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, transactionMock, requirePlatformSessionAdminMock } = vi.hoisted(() => {
  const delegate = () => ({
    create: vi.fn().mockResolvedValue({ id: "entity-id" }),
    update: vi.fn().mockResolvedValue({ id: "entity-id" }),
    delete: vi.fn().mockResolvedValue({ id: "entity-id" }),
    findUnique: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  });

  const prismaMock = {
    $transaction: vi.fn(),
    platformVersion: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "version-copy-id", version_name: "2026 Copy", description: "source description", is_active: true }),
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
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformSessionAdmin: requirePlatformSessionAdminMock,
}));
vi.mock("@/lib/services/platform/segment-service", () => ({
  ensureDefaultSegments: vi.fn().mockResolvedValue(undefined),
}));

import { duplicateVersion } from "./version-service";

describe("version service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformSessionAdminMock.mockResolvedValue({ id: "admin-id" });
    prismaMock.$transaction.mockImplementation(async (callback: (transaction: typeof transactionMock) => Promise<unknown>) => callback(transactionMock));
    prismaMock.platformVersion.findUnique.mockResolvedValue({
      id: "source-version-id",
      version_name: "2026",
      description: "Original description",
      is_active: true,
      businessTypes: [
        {
          business_type_id: "business-type-1",
          is_free: false,
          tags: [{ label: "Tag A" }],
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
    });
    prismaMock.platformVersion.create.mockResolvedValue({ id: "version-copy-id", version_name: "2026 Copy", description: "Original description", is_active: true });
    prismaMock.versionBusinessType.create.mockResolvedValue({ id: "vbt-id" });
    prismaMock.versionBusinessTypeSegment.create.mockResolvedValue({ id: "vbts-id" });
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
    expect(prismaMock.versionBusinessType.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        version_id: "version-copy-id",
        business_type_id: "business-type-1",
      }),
    }));
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
});
