import { Prisma } from "@prisma/client";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export function parseOrganizationSegmentPrice(value: string) {
  const normalized = value.trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a non-negative price with up to two decimal places.");
  }
  return new Prisma.Decimal(normalized);
}

export function resolveOrganizationSegmentPrice(
  organizationPrice: { snapshot_price: Prisma.Decimal | null; custom_price: Prisma.Decimal | null } | null,
  versionPrice: Prisma.Decimal | null,
) {
  return organizationPrice
    ? organizationPrice.custom_price ?? organizationPrice.snapshot_price
    : versionPrice;
}

export async function listOrganizationSegmentPricing(organizationId: string) {
  await requirePlatformSessionAdmin();

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      platform_version_id: true,
      platformVersion: {
        select: {
          version_name: true,
          businessTypes: {
            orderBy: { businessType: { name: "asc" } },
            include: {
              businessType: { select: { id: true, name: true } },
              segments: {
                orderBy: { segment: { sort_order: "asc" } },
                include: { segment: { select: { id: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!organization) throw new Error("Organization not found.");
  if (!organization.platform_version_id || !organization.platformVersion) {
    return { versionName: null, businessTypes: [] };
  }

  const assignments = organization.platformVersion.businessTypes.flatMap((businessType) =>
    businessType.segments.map((assignment) => assignment.id),
  );
  const priceRows = await prisma.organizationSegmentPrice.findMany({
    where: {
      organization_id: organization.id,
      version_business_type_segment_id: { in: assignments },
    },
  });
  const priceByAssignment = new Map(priceRows.map((price) => [price.version_business_type_segment_id, price]));

  return {
    versionName: organization.platformVersion.version_name,
    businessTypes: organization.platformVersion.businessTypes.map((businessType) => ({
      id: businessType.business_type_id,
      name: businessType.businessType.name,
      isFree: businessType.is_free,
      segments: businessType.segments.map((assignment) => {
        const organizationPrice = priceByAssignment.get(assignment.id);
        const snapshotPrice = organizationPrice ? organizationPrice.snapshot_price : assignment.price;
        const effectivePrice = organizationPrice?.custom_price ?? snapshotPrice;
        return {
          assignmentId: assignment.id,
          segmentId: assignment.segment.id,
          segmentName: assignment.segment.name,
          isActive: assignment.is_active,
          versionPrice: assignment.price?.toNumber() ?? null,
          snapshotPrice: snapshotPrice?.toNumber() ?? null,
          effectivePrice: effectivePrice?.toNumber() ?? null,
          isCustomPrice: organizationPrice?.custom_price != null,
        };
      }),
    })),
  };
}

export async function setOrganizationSegmentCustomPrice(
  organizationId: string,
  assignmentId: string,
  inputPrice: string,
) {
  const admin = await requirePlatformSessionAdmin();
  const customPrice = parseOrganizationSegmentPrice(inputPrice);

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, platform_version_id: true },
    });
    if (!organization) throw new Error("Organization not found.");
    if (!organization.platform_version_id) throw new Error("Assign a platform version before setting prices.");

    const assignment = await transaction.versionBusinessTypeSegment.findFirst({
      where: {
        id: assignmentId,
        versionBusinessType: { is: { version_id: organization.platform_version_id } },
      },
      select: { id: true, price: true },
    });
    if (!assignment) throw new Error("The selected segment does not belong to this organization's assigned version.");

    const existing = await transaction.organizationSegmentPrice.findUnique({
      where: {
        organization_id_version_business_type_segment_id: {
          organization_id: organization.id,
          version_business_type_segment_id: assignment.id,
        },
      },
    });
    const beforePrice = existing?.custom_price ?? existing?.snapshot_price ?? assignment.price;
    const organizationPrice = await transaction.organizationSegmentPrice.upsert({
      where: {
        organization_id_version_business_type_segment_id: {
          organization_id: organization.id,
          version_business_type_segment_id: assignment.id,
        },
      },
      create: {
        organization_id: organization.id,
        version_business_type_segment_id: assignment.id,
        snapshot_price: assignment.price,
        custom_price: customPrice,
        updated_by_platform_admin_id: admin.id,
      },
      update: {
        custom_price: customPrice,
        updated_by_platform_admin_id: admin.id,
      },
    });

    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        module: "pricing",
        action: "CUSTOM_SEGMENT_PRICE_SET",
        entity_type: "OrganizationSegmentPrice",
        entity_id: organizationPrice.id,
        details: {
          platformAdminId: admin.id,
          versionBusinessTypeSegmentId: assignment.id,
          beforePrice: beforePrice?.toString() ?? null,
          afterPrice: customPrice.toString(),
        },
      },
    });

    return organizationPrice;
  });
}

export async function resetOrganizationSegmentPrice(organizationId: string, assignmentId: string) {
  const admin = await requirePlatformSessionAdmin();

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, platform_version_id: true },
    });
    if (!organization) throw new Error("Organization not found.");
    if (!organization.platform_version_id) throw new Error("Assign a platform version before resetting prices.");

    const assignment = await transaction.versionBusinessTypeSegment.findFirst({
      where: {
        id: assignmentId,
        versionBusinessType: { is: { version_id: organization.platform_version_id } },
      },
      select: { id: true },
    });
    if (!assignment) throw new Error("The selected segment does not belong to this organization's assigned version.");

    const existing = await transaction.organizationSegmentPrice.findUnique({
      where: {
        organization_id_version_business_type_segment_id: {
          organization_id: organization.id,
          version_business_type_segment_id: assignment.id,
        },
      },
    });
    if (!existing?.custom_price) return { reset: false };

    await transaction.organizationSegmentPrice.update({
      where: { id: existing.id },
      data: { custom_price: null, updated_by_platform_admin_id: admin.id },
    });
    await transaction.auditEvent.create({
      data: {
        organization_id: organization.id,
        module: "pricing",
        action: "CUSTOM_SEGMENT_PRICE_RESET",
        entity_type: "OrganizationSegmentPrice",
        entity_id: existing.id,
        details: {
          platformAdminId: admin.id,
          versionBusinessTypeSegmentId: assignment.id,
          beforePrice: existing.custom_price.toString(),
          afterPrice: existing.snapshot_price?.toString() ?? null,
        },
      },
    });

    return { reset: true };
  });
}