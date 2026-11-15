import { prisma } from "@/lib/database/prisma-client";

function normalizeLabels(value: string) {
  return [...new Set(value.split(",").map((label) => label.trim()).filter(Boolean))].slice(0, 20);
}

export async function addSegmentTags(versionBusinessTypeSegmentId: string, labels: string) {
  const normalizedLabels = normalizeLabels(labels);
  if (normalizedLabels.length === 0) throw new Error("Enter at least one tag.");

  return prisma.versionBusinessTypeSegmentTag.createMany({
    data: normalizedLabels.map((label) => ({
      version_business_type_segment_id: versionBusinessTypeSegmentId,
      label,
    })),
    skipDuplicates: true,
  });
}

export async function removeSegmentTag(tagId: string) {
  return prisma.versionBusinessTypeSegmentTag.delete({ where: { id: tagId } });
}