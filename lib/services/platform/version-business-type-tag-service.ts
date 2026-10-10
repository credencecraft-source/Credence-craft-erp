import { requirePlatformConfigurationAccess } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export async function assignVersionBusinessTypeTag(versionBusinessTypeId: string, platformTagId: string) {
  await requirePlatformConfigurationAccess();
  if (!platformTagId.trim()) throw new Error("Select a tag.");

  const [assignment, tag] = await Promise.all([
    prisma.versionBusinessType.findUnique({
      where: { id: versionBusinessTypeId },
      select: { id: true },
    }),
    prisma.platformTag.findFirst({
      where: { id: platformTagId, is_active: true },
      select: { id: true },
    }),
  ]);

  if (!assignment) throw new Error("The selected version business type does not exist.");
  if (!tag) throw new Error("The selected tag is unavailable.");

  return prisma.versionBusinessTypeTag.createMany({
    data: [{ version_business_type_id: assignment.id, platform_tag_id: tag.id }],
    skipDuplicates: true,
  });
}

export async function removeVersionBusinessTypeTag(tagId: string) {
  await requirePlatformConfigurationAccess();
  return prisma.versionBusinessTypeTag.delete({ where: { id: tagId } });
}