import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, requirePlatformConfigurationAccessMock } = vi.hoisted(() => ({
  prismaMock: {
    platformTag: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    versionBusinessType: {
      findUnique: vi.fn(),
    },
    versionBusinessTypeTag: {
      createMany: vi.fn(),
      delete: vi.fn(),
    },
  },
  requirePlatformConfigurationAccessMock: vi.fn().mockResolvedValue({ id: "admin-id" }),
}));

vi.mock("@/lib/database/prisma-client", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth/platform-session-manager", () => ({
  requirePlatformConfigurationAccess: requirePlatformConfigurationAccessMock,
}));

import { createPlatformTag, listPlatformTags, renamePlatformTag, setPlatformTagActive } from "./platform-tag-service";
import { assignVersionBusinessTypeTag, removeVersionBusinessTypeTag } from "./version-business-type-tag-service";

describe("platform tag catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePlatformConfigurationAccessMock.mockResolvedValue({ id: "admin-id" });
  });

  it("lists catalog tags with their assignment counts after authorizing configuration access", async () => {
    prismaMock.platformTag.findMany.mockResolvedValue([]);

    await listPlatformTags();

    expect(requirePlatformConfigurationAccessMock).toHaveBeenCalledOnce();
    expect(prismaMock.platformTag.findMany).toHaveBeenCalledWith({
      orderBy: [{ sort_order: "asc" }, { label: "asc" }],
      include: { _count: { select: { versionBusinessTypes: true } } },
    });
  });

  it("trims and ranks a newly created catalog tag", async () => {
    prismaMock.platformTag.findUnique.mockResolvedValue(null);
    prismaMock.platformTag.findFirst.mockResolvedValue({ sort_order: 4 });
    prismaMock.platformTag.create.mockResolvedValue({ id: "tag-id", label: "Retail" });

    await createPlatformTag("  Retail  ");

    expect(prismaMock.platformTag.create).toHaveBeenCalledWith({
      data: { label: "Retail", sort_order: 5 },
    });
  });

  it("rejects blank and duplicate catalog tag names", async () => {
    await expect(createPlatformTag("   ")).rejects.toThrow("Tag name is required.");
    prismaMock.platformTag.findUnique.mockResolvedValue({ id: "existing", label: "Retail" });
    await expect(createPlatformTag("Retail")).rejects.toThrow("A tag with this name already exists.");
    expect(prismaMock.platformTag.create).not.toHaveBeenCalled();
  });

  it("renames catalog tags without allowing duplicate names", async () => {
    prismaMock.platformTag.findFirst.mockResolvedValue(null);
    prismaMock.platformTag.update.mockResolvedValue({ id: "tag-id", label: "Retail Stores" });

    await renamePlatformTag("tag-id", " Retail Stores ");

    expect(prismaMock.platformTag.update).toHaveBeenCalledWith({
      where: { id: "tag-id" },
      data: { label: "Retail Stores" },
    });
    prismaMock.platformTag.findFirst.mockResolvedValue({ id: "other-tag" });
    await expect(renamePlatformTag("tag-id", "Wholesale")).rejects.toThrow(
      "A tag with this name already exists.",
    );
  });

  it("updates catalog tag activation after authorizing configuration access", async () => {
    prismaMock.platformTag.update.mockResolvedValue({ id: "tag-id", is_active: false });

    await setPlatformTagActive("tag-id", false);

    expect(requirePlatformConfigurationAccessMock).toHaveBeenCalledOnce();
    expect(prismaMock.platformTag.update).toHaveBeenCalledWith({
      where: { id: "tag-id" },
      data: { is_active: false },
    });
  });

  it("only assigns an active catalog tag to an existing version business type", async () => {
    prismaMock.versionBusinessType.findUnique.mockResolvedValue({ id: "assignment-id" });
    prismaMock.platformTag.findFirst.mockResolvedValue({ id: "tag-id" });
    prismaMock.versionBusinessTypeTag.createMany.mockResolvedValue({ count: 1 });

    await assignVersionBusinessTypeTag("assignment-id", "tag-id");

    expect(requirePlatformConfigurationAccessMock).toHaveBeenCalledOnce();
    expect(prismaMock.platformTag.findFirst).toHaveBeenCalledWith({
      where: { id: "tag-id", is_active: true },
      select: { id: true },
    });
    expect(prismaMock.versionBusinessTypeTag.createMany).toHaveBeenCalledWith({
      data: [{ version_business_type_id: "assignment-id", platform_tag_id: "tag-id" }],
      skipDuplicates: true,
    });
  });

  it("rejects assigning an inactive or missing tag", async () => {
    prismaMock.versionBusinessType.findUnique.mockResolvedValue({ id: "assignment-id" });
    prismaMock.platformTag.findFirst.mockResolvedValue(null);

    await expect(assignVersionBusinessTypeTag("assignment-id", "inactive-tag")).rejects.toThrow(
      "The selected tag is unavailable.",
    );
    expect(prismaMock.versionBusinessTypeTag.createMany).not.toHaveBeenCalled();
  });

  it("authorizes removing a tag assignment", async () => {
    prismaMock.versionBusinessTypeTag.delete.mockResolvedValue({ id: "assignment-tag-id" });

    await removeVersionBusinessTypeTag("assignment-tag-id");

    expect(requirePlatformConfigurationAccessMock).toHaveBeenCalledOnce();
    expect(prismaMock.versionBusinessTypeTag.delete).toHaveBeenCalledWith({
      where: { id: "assignment-tag-id" },
    });
  });
});
