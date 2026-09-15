import { prisma } from "@/lib/database/prisma-client";
import { ensureDefaultSegments } from "@/lib/services/platform/segment-service";

export async function listVersions() {
  return prisma.platformVersion.findMany({
    orderBy: { version_name: "desc" },
    include: {
      _count: { select: { businessTypes: true } },
    },
  });
}

export async function createVersion(input: { versionName: string; description?: string }) {
  const versionName = input.versionName.trim();
  if (!versionName) throw new Error("Version name is required.");

  const existing = await prisma.platformVersion.findUnique({ where: { version_name: versionName } });
  if (existing) throw new Error("A version with this name already exists.");

  const businessTypes = await prisma.businessType.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  await ensureDefaultSegments();
  const segments = await prisma.segment.findMany({ where: { is_active: true }, select: { id: true } });

  return prisma.platformVersion.create({
    data: {
      version_name: versionName,
      description: input.description?.trim() || null,
      businessTypes: {
        create: businessTypes.map(({ id }) => ({
          business_type_id: id,
          segments: { create: segments.map(({ id: segmentId }) => ({ segment_id: segmentId })) },
        })),
      },
    },
    include: { _count: { select: { businessTypes: true } } },
  });
}

export async function deleteVersion(id: string) {
  return prisma.platformVersion.delete({ where: { id } });
}

export async function getVersionDetails(id: string) {
  return prisma.platformVersion.findUnique({
    where: { id },
    include: {
      businessTypes: {
        orderBy: { businessType: { name: "asc" } },
        include: {
          businessType: true,
          segments: { include: { segment: true }, orderBy: { segment: { name: "asc" } } },
        },
      },
    },
  });
}

export async function addSegmentToVersionBusinessType(versionBusinessTypeId: string, segmentId: string) {
  return prisma.versionBusinessTypeSegment.create({
    data: { version_business_type_id: versionBusinessTypeId, segment_id: segmentId },
  });
}

export async function removeSegmentFromVersionBusinessType(id: string) {
  return prisma.versionBusinessTypeSegment.delete({ where: { id } });
}

export async function setVersionBusinessTypeSegmentActive(id: string, isActive: boolean) {
  return prisma.versionBusinessTypeSegment.update({
    where: { id },
    data: { is_active: isActive },
  });
}
