import { prisma } from "@/lib/database/prisma-client";
import { Prisma } from "@prisma/client";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
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
  await requirePlatformSessionAdmin();
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

async function syncVersionCatalog(versionId: string) {
  const [businessTypes, segments] = await Promise.all([
    prisma.businessType.findMany({
      where: { isActive: true },
      select: { id: true },
    }),
    prisma.segment.findMany({
      where: { is_active: true },
      select: { id: true },
    }),
  ]);

  await prisma.$transaction(async (transaction) => {
    await transaction.versionBusinessType.createMany({
      data: businessTypes.map(({ id: businessTypeId }) => ({
        version_id: versionId,
        business_type_id: businessTypeId,
      })),
      skipDuplicates: true,
    });

    const versionBusinessTypes = await transaction.versionBusinessType.findMany({
      where: { version_id: versionId },
      select: { id: true },
    });

    await transaction.versionBusinessTypeSegment.createMany({
      data: versionBusinessTypes.flatMap(({ id: versionBusinessTypeId }) =>
        segments.map(({ id: segmentId }) => ({
          version_business_type_id: versionBusinessTypeId,
          segment_id: segmentId,
        })),
      ),
      skipDuplicates: true,
    });
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function deleteVersion(id: string) {
  await requirePlatformSessionAdmin();
  return prisma.platformVersion.delete({ where: { id } });
}

export async function getVersionDetails(id: string) {
  await syncVersionCatalog(id);

  return prisma.platformVersion.findUnique({
    where: { id },
    include: {
      businessTypes: {
        orderBy: { businessType: { name: "asc" } },
        include: {
          businessType: true,
          tags: { orderBy: { label: "asc" } },
          segments: { include: { segment: true, tags: { orderBy: { label: "asc" } } }, orderBy: { segment: { sort_order: "asc" } } },
        },
      },
    },
  });
}

export async function addSegmentToVersionBusinessType(versionBusinessTypeId: string, segmentId: string) {
  const [versionBusinessType, segment] = await Promise.all([
    prisma.versionBusinessType.findUnique({ where: { id: versionBusinessTypeId }, select: { id: true } }),
    prisma.segment.findUnique({ where: { id: segmentId }, select: { id: true } }),
  ]);
  if (!versionBusinessType || !segment) throw new Error("The selected business type or segment does not exist.");

  return prisma.versionBusinessTypeSegment.create({
    data: { version_business_type_id: versionBusinessTypeId, segment_id: segmentId },
  });
}

export async function removeSegmentFromVersionBusinessType(id: string) {
  const assignment = await prisma.versionBusinessTypeSegment.findUnique({ where: { id }, select: { id: true } });
  if (!assignment) throw new Error("The selected segment assignment does not exist.");

  return prisma.versionBusinessTypeSegment.delete({ where: { id } });
}

export async function setVersionBusinessTypeSegmentActive(id: string, isActive: boolean) {
  return prisma.versionBusinessTypeSegment.update({
    where: { id },
    data: { is_active: isActive },
  });
}

export async function setVersionBusinessTypeSegmentPrice(id: string, value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return prisma.versionBusinessTypeSegment.update({ where: { id }, data: { price: null } });
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized) || Number(normalized) < 0) {
    throw new Error("Enter a valid non-negative price with up to two decimal places.");
  }

  return prisma.versionBusinessTypeSegment.update({
    where: { id },
    data: { price: new Prisma.Decimal(normalized) },
  });
}

export async function setVersionBusinessTypeSegmentLabel(id: string, label: string) {
  return prisma.versionBusinessTypeSegment.update({
    where: { id },
    data: { label: label.trim() || null },
  });
}

export async function setVersionBusinessTypeFree(id: string, isFree: boolean) {
  return prisma.versionBusinessType.update({
    where: { id },
    data: { is_free: isFree },
  });
}
