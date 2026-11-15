import { prisma } from "@/lib/database/prisma-client";
import { Prisma } from "@prisma/client";
import { requirePlatformConfigurationAccess } from "@/lib/auth/platform-session-manager";
import { ensureDefaultSegments } from "@/lib/services/platform/segment-service";
import { isPlatformVersionType } from "@/lib/constants/platform-version-types";

export async function listVersions() {
  await requirePlatformConfigurationAccess();
  return prisma.platformVersion.findMany({
    orderBy: { version_name: "desc" },
    include: {
      _count: { select: { businessTypes: true, organizations: true } },
    },
  });
}

export async function createVersion(input: { versionName: string; versionType: string; description?: string }) {
  await requirePlatformConfigurationAccess();
  const versionName = input.versionName.trim();
  if (!versionName) throw new Error("Version name is required.");
  if (!isPlatformVersionType(input.versionType)) throw new Error("Select a valid version type.");

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
      version_type: input.versionType,
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

export async function duplicateVersion(id: string, input?: { versionName?: string; description?: string }) {
  await requirePlatformConfigurationAccess();

  const sourceVersion = await prisma.platformVersion.findUnique({
    where: { id },
    include: {
      businessTypes: {
        include: {
          tags: true,
          segments: {
            include: {
              tags: true,
              restrictions: true,
              formRestrictions: true,
              locationLimit: true,
            },
          },
        },
      },
      transactionRestrictions: true,
    },
  });

  if (!sourceVersion) {
    throw new Error("Version not found.");
  }

  const baseName = (input?.versionName?.trim() || `${sourceVersion.version_name} Copy`).trim();
  let candidateName = baseName || `${sourceVersion.version_name} Copy`;
  let counter = 2;

  while (true) {
    const existing = await prisma.platformVersion.findUnique({ where: { version_name: candidateName } });
    if (!existing) break;
    candidateName = `${baseName} ${counter}`;
    counter += 1;
  }

  return prisma.$transaction(async (transaction) => {
    const createdVersion = await transaction.platformVersion.create({
      data: {
        version_name: candidateName,
        version_type: sourceVersion.version_type,
        description: input?.description?.trim() ?? sourceVersion.description,
        is_active: sourceVersion.is_active,
      },
      include: { _count: { select: { businessTypes: true } } },
    });

    for (const businessType of sourceVersion.businessTypes) {
      const createdBusinessType = await transaction.versionBusinessType.create({
        data: {
          version_id: createdVersion.id,
          business_type_id: businessType.business_type_id,
          is_free: businessType.is_free,
        },
      });

      for (const tag of businessType.tags) {
        await transaction.versionBusinessTypeTag.create({
          data: {
            version_business_type_id: createdBusinessType.id,
            platform_tag_id: tag.platform_tag_id,
          },
        });
      }

      for (const segment of businessType.segments) {
        const createdSegment = await transaction.versionBusinessTypeSegment.create({
          data: {
            version_business_type_id: createdBusinessType.id,
            segment_id: segment.segment_id,
            is_active: segment.is_active,
            label: segment.label,
            price: segment.price ?? undefined,
          },
        });

        for (const tag of segment.tags) {
          await transaction.versionBusinessTypeSegmentTag.create({
            data: {
              version_business_type_segment_id: createdSegment.id,
              label: tag.label,
            },
          });
        }

        if (segment.locationLimit) {
          await transaction.versionBusinessTypeSegmentLocationLimit.create({
            data: {
              version_business_type_segment_id: createdSegment.id,
              max_locations: segment.locationLimit.max_locations,
            },
          });
        }

        for (const restriction of segment.restrictions) {
          await transaction.segmentRestriction.create({
            data: {
              version_business_type_segment_id: createdSegment.id,
              master_module: restriction.master_module,
              main_module: restriction.main_module,
              sub_module: restriction.sub_module,
              action_level: restriction.action_level,
              url_pattern: restriction.url_pattern,
              restriction_type: restriction.restriction_type,
              custom_message: restriction.custom_message,
            },
          });
        }

        for (const formRestriction of segment.formRestrictions) {
          await transaction.segmentFormRestriction.create({
            data: {
              version_business_type_segment_id: createdSegment.id,
              form_key: formRestriction.form_key,
              monthly_qty_limit: formRestriction.monthly_qty_limit,
              monthly_entry_limit: formRestriction.monthly_entry_limit,
              restricted_fields: formRestriction.restricted_fields,
              field_sum_limits:
                formRestriction.field_sum_limits === null
                  ? Prisma.JsonNull
                  : formRestriction.field_sum_limits,
            },
          });
        }
      }
    }

    for (const versionRestriction of sourceVersion.transactionRestrictions) {
      await transaction.versionTransactionRestriction.create({
        data: {
          version_id: createdVersion.id,
          segment_id: versionRestriction.segment_id,
          form_key: versionRestriction.form_key,
          monthly_entry_limit: versionRestriction.monthly_entry_limit,
        },
      });
    }

    return createdVersion;
  }, { maxWait: 10_000, timeout: 120_000 });
}

export async function deleteVersion(id: string) {
  await requirePlatformConfigurationAccess();

  const assignedOrganizationCount = await prisma.organization.count({
    where: { platform_version_id: id },
  });

  if (assignedOrganizationCount > 0) {
    throw new Error("This version is already assigned to one or more organizations and cannot be deleted.");
  }

  return prisma.platformVersion.delete({ where: { id } });
}

export async function updateVersionDetails(
  id: string,
  versionName: string,
  description: string | undefined,
  versionType: string,
) {
  await requirePlatformConfigurationAccess();
  const normalizedName = versionName.trim();
  if (!normalizedName) throw new Error("Version name is required.");
  if (normalizedName.length > 100) throw new Error("Version name must be 100 characters or fewer.");
  if (!isPlatformVersionType(versionType)) throw new Error("Select a valid version type.");
  const normalizedDescription = description?.trim() || null;
  if (normalizedDescription && normalizedDescription.length > 500) {
    throw new Error("Version description must be 500 characters or fewer.");
  }

  const existing = await prisma.platformVersion.findFirst({
    where: { version_name: normalizedName, NOT: { id } },
    select: { id: true },
  });
  if (existing) throw new Error("A version with this name already exists.");

  return prisma.platformVersion.update({
    where: { id },
    data: { version_name: normalizedName, description: normalizedDescription, version_type: versionType },
  });
}

export async function getVersionDetails(id: string) {
  await requirePlatformConfigurationAccess();
  await syncVersionCatalog(id);

  return prisma.platformVersion.findUnique({
    where: { id },
    include: {
      businessTypes: {
        orderBy: { businessType: { name: "asc" } },
        include: {
          businessType: true,
          tags: {
            orderBy: { platformTag: { label: "asc" } },
            include: { platformTag: true },
          },
          segments: { include: { segment: true, tags: { orderBy: { label: "asc" } } }, orderBy: { segment: { sort_order: "asc" } } },
        },
      },
    },
  });
}

export async function addSegmentToVersionBusinessType(versionBusinessTypeId: string, segmentId: string) {
  await requirePlatformConfigurationAccess();
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
  await requirePlatformConfigurationAccess();
  const assignment = await prisma.versionBusinessTypeSegment.findUnique({ where: { id }, select: { id: true } });
  if (!assignment) throw new Error("The selected segment assignment does not exist.");

  return prisma.versionBusinessTypeSegment.delete({ where: { id } });
}

export async function setVersionBusinessTypeSegmentActive(id: string, isActive: boolean) {
  await requirePlatformConfigurationAccess();
  return prisma.versionBusinessTypeSegment.update({
    where: { id },
    data: { is_active: isActive },
  });
}

export async function setVersionBusinessTypeSegmentPrice(id: string, value: string) {
  await requirePlatformConfigurationAccess();
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
  await requirePlatformConfigurationAccess();
  return prisma.versionBusinessTypeSegment.update({
    where: { id },
    data: { label: label.trim() || null },
  });
}

export async function setVersionBusinessTypeFree(id: string, isFree: boolean) {
  await requirePlatformConfigurationAccess();
  return prisma.versionBusinessType.update({
    where: { id },
    data: { is_free: isFree },
  });
}
