import { prisma } from "@/lib/database/prisma-client";

function normalizeLabels(value: string) {
  return [...new Set(value.split(",").map((label) => label.trim()).filter(Boolean))].slice(0, 20);
}

export async function addVersionBusinessTypeTags(versionBusinessTypeId: string, labels: string) {
  const normalizedLabels = normalizeLabels(labels);
  if (normalizedLabels.length === 0) throw new Error("Enter at least one tag.");

  return prisma.versionBusinessTypeTag.createMany({
    data: normalizedLabels.map((label) => ({
      version_business_type_id: versionBusinessTypeId,
      label,
    })),
    skipDuplicates: true,
  });
}

export async function removeVersionBusinessTypeTag(tagId: string) {
  return prisma.versionBusinessTypeTag.delete({ where: { id: tagId } });
}