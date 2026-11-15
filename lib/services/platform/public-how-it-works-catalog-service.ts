import { prisma } from "@/lib/database/prisma-client";

export async function getPublicHowItWorksCatalog(versionId?: string) {
  const version = versionId
    ? await prisma.platformVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        version_name: true,
        businessTypes: {
          orderBy: { businessType: { name: "asc" } },
          select: {
            businessType: { select: { name: true } },
            tags: {
              orderBy: { platformTag: { label: "asc" } },
              select: { platformTag: { select: { label: true } } },
            },
          },
        },
      },
    })
    : await prisma.platformVersion.findFirst({
      where: { is_active: true },
      orderBy: { version_name: "desc" },
      select: {
        id: true,
        version_name: true,
        businessTypes: {
          orderBy: { businessType: { name: "asc" } },
          select: {
            businessType: { select: { name: true } },
            tags: {
              orderBy: { platformTag: { label: "asc" } },
              select: { platformTag: { select: { label: true } } },
            },
          },
        },
      },
    });

  if (!version) return null;

  return {
    versionId: version.id,
    versionName: version.version_name,
    businessTypes: version.businessTypes.map((entry) => ({
      name: entry.businessType.name,
      tags: entry.tags.map((tag) => tag.platformTag.label),
    })),
  };
}
