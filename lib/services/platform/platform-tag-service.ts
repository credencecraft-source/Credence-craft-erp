import { requirePlatformConfigurationAccess } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export async function listPlatformTags() {
  await requirePlatformConfigurationAccess();
  return prisma.platformTag.findMany({
    orderBy: [{ sort_order: "asc" }, { label: "asc" }],
    include: {
      _count: { select: { versionBusinessTypes: true } },
    },
  });
}

export async function createPlatformTag(label: string) {
  await requirePlatformConfigurationAccess();
  const normalizedLabel = label.trim();
  validateTagLabel(normalizedLabel);

  const existing = await prisma.platformTag.findUnique({ where: { label: normalizedLabel } });
  if (existing) throw new Error("A tag with this name already exists.");

  const lastTag = await prisma.platformTag.findFirst({
    orderBy: { sort_order: "desc" },
    select: { sort_order: true },
  });

  return prisma.platformTag.create({
    data: {
      label: normalizedLabel,
      sort_order: (lastTag?.sort_order ?? 0) + 1,
    },
  });
}

export async function renamePlatformTag(id: string, label: string) {
  await requirePlatformConfigurationAccess();
  const normalizedLabel = label.trim();
  validateTagLabel(normalizedLabel);

  const existing = await prisma.platformTag.findFirst({
    where: { label: normalizedLabel, NOT: { id } },
    select: { id: true },
  });
  if (existing) throw new Error("A tag with this name already exists.");

  return prisma.platformTag.update({
    where: { id },
    data: { label: normalizedLabel },
  });
}

export async function setPlatformTagActive(id: string, isActive: boolean) {
  await requirePlatformConfigurationAccess();
  return prisma.platformTag.update({
    where: { id },
    data: { is_active: isActive },
  });
}

function validateTagLabel(label: string) {
  if (!label) throw new Error("Tag name is required.");
  if (label.length > 100) throw new Error("Tag name must be 100 characters or fewer.");
}
