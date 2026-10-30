import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    $executeRaw: vi.fn(),
    designDevelopmentPageSetupTemplate: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  };
  return {
    transaction,
    prisma: {
      $transaction: vi.fn(),
      designDevelopmentPageSetupTemplate: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    requireOrganizationPermission: vi.fn(),
  };
});

vi.mock("@/lib/database/prisma-client", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/services/organizations/organization-service", () => ({
  requireOrganizationPermission: mocks.requireOrganizationPermission,
}));

import {
  createPageSetupTemplate,
  deletePageSetupTemplates,
  getPageSetupTemplate,
  listPageSetupTemplates,
  updatePageSetupTemplate,
} from "./page-setup-template-service";

describe("page setup template service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrganizationPermission.mockResolvedValue({
      organization_id: "internal-org-1",
    });
    mocks.prisma.$transaction.mockImplementation(
      async (callback: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        callback(mocks.transaction),
    );
    mocks.prisma.designDevelopmentPageSetupTemplate.findMany.mockResolvedValue([
      {
        id: "page-1",
        name: "A4 LABEL",
        paper_size: "A4",
        orientation: "PORTRAIT",
        sticker_width_mm: 46,
        sticker_length_mm: 11.1,
        margin_top_mm: 5,
        margin_bottom_mm: 5,
        margin_left_mm: 5,
        margin_right_mm: 5,
        horizontal_gap_mm: 2,
        vertical_gap_mm: 2,
        created_at: new Date("2026-10-28T00:00:00.000Z"),
        updated_at: new Date("2026-10-28T00:00:00.000Z"),
      },
    ]);
  });

  it("lists only the authorized organization's records with a bounded query", async () => {
    await expect(listPageSetupTemplates("user-1", "public-org-1")).resolves.toMatchObject([
      {
        id: "page-1",
        name: "A4 LABEL",
        paperSize: "A4",
        orientation: "PORTRAIT",
        stickerWidthMm: 46,
        stickerLengthMm: 11.1,
        marginTopMm: 5,
        marginBottomMm: 5,
        marginLeftMm: 5,
        marginRightMm: 5,
        horizontalGapMm: 2,
        verticalGapMm: 2,
      },
    ]);
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "VIEW_REPORTS",
    );
    expect(mocks.prisma.designDevelopmentPageSetupTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1" },
        take: 100,
      }),
    );
  });

  it("creates and updates tenant-scoped records with transaction-local audit actors", async () => {
    const saved = {
      id: "page-1",
      name: "PAGE ONE",
      paper_size: "A4",
      orientation: "LANDSCAPE",
      sticker_width_mm: 46,
      sticker_length_mm: 11.1,
      margin_top_mm: 5,
      margin_bottom_mm: 5,
      margin_left_mm: 10,
      margin_right_mm: 20,
      horizontal_gap_mm: 2,
      vertical_gap_mm: 3,
      created_at: new Date("2026-10-28T00:00:00.000Z"),
      updated_at: new Date("2026-10-28T00:00:00.000Z"),
    };
    mocks.transaction.designDevelopmentPageSetupTemplate.create.mockResolvedValue(saved);
    mocks.transaction.designDevelopmentPageSetupTemplate.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.designDevelopmentPageSetupTemplate.findFirst.mockResolvedValue(saved);

    await createPageSetupTemplate("user-1", "public-org-1", {
      name: "page one",
      paperSize: "A4",
      orientation: "LANDSCAPE",
      stickerWidthMm: 46,
      stickerLengthMm: 11.1,
      marginTopMm: 5,
      marginBottomMm: 5,
      marginLeftMm: 10,
      marginRightMm: 20,
      horizontalGapMm: 2,
      verticalGapMm: 3,
    });
    await updatePageSetupTemplate("user-1", "public-org-1", "page-1", {
      name: "PAGE ONE",
      paperSize: "A4",
      orientation: "LANDSCAPE",
      stickerWidthMm: 46,
      stickerLengthMm: 11.1,
      marginTopMm: 5,
      marginBottomMm: 5,
      marginLeftMm: 10,
      marginRightMm: 20,
      horizontalGapMm: 2,
      verticalGapMm: 3,
    });

    expect(mocks.transaction.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.transaction.designDevelopmentPageSetupTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organization_id: "internal-org-1",
          name: "PAGE ONE",
          sticker_width_mm: 46,
          sticker_length_mm: 11.1,
          margin_top_mm: 5,
          margin_bottom_mm: 5,
        }),
      }),
    );
    expect(mocks.transaction.designDevelopmentPageSetupTemplate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "page-1" },
      }),
    );
    expect(mocks.requireOrganizationPermission).toHaveBeenCalledWith(
      "user-1",
      "public-org-1",
      "MANAGE_MASTER_DATA",
    );
  });

  it("loads records using both the ID and authorized internal organization ID", async () => {
    mocks.prisma.designDevelopmentPageSetupTemplate.findFirst.mockResolvedValue(null);
    await expect(
      getPageSetupTemplate("user-1", "public-org-1", "page-1"),
    ).resolves.toBeNull();
    expect(mocks.prisma.designDevelopmentPageSetupTemplate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organization_id: "internal-org-1", id: "page-1" },
      }),
    );
  });

  it("deletes the complete selected set inside the authorized organization and records the actor", async () => {
    mocks.transaction.designDevelopmentPageSetupTemplate.findMany.mockResolvedValue([
      { id: "page-1" },
      { id: "page-2" },
    ]);
    mocks.transaction.designDevelopmentPageSetupTemplate.deleteMany.mockResolvedValue({ count: 2 });

    await expect(
      deletePageSetupTemplates("user-1", "public-org-1", ["page-1", "page-2"]),
    ).resolves.toEqual({ success: true, deletedCount: 2 });

    expect(mocks.transaction.$executeRaw).toHaveBeenCalledWith(
      ["SELECT set_config('app.user_id', ", ", true)"],
      "user-1",
    );
    expect(mocks.transaction.designDevelopmentPageSetupTemplate.findMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["page-1", "page-2"] },
      },
      select: { id: true },
    });
    expect(mocks.transaction.designDevelopmentPageSetupTemplate.deleteMany).toHaveBeenCalledWith({
      where: {
        organization_id: "internal-org-1",
        id: { in: ["page-1", "page-2"] },
      },
    });
    expect(mocks.requireOrganizationPermission).toHaveBeenLastCalledWith(
      "user-1",
      "public-org-1",
      "MANAGE_MASTER_DATA",
    );
  });

  it("does not delete any Page Setup templates when the selection includes a missing or foreign record", async () => {
    mocks.transaction.designDevelopmentPageSetupTemplate.findMany.mockResolvedValue([{ id: "page-1" }]);

    await expect(
      deletePageSetupTemplates("user-1", "public-org-1", ["page-1", "foreign-page"]),
    ).resolves.toEqual({ success: false, reason: "NOT_FOUND" });
    expect(mocks.transaction.designDevelopmentPageSetupTemplate.deleteMany).not.toHaveBeenCalled();
  });
});
