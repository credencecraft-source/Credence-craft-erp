import { Prisma } from "@prisma/client";
import { getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";
import { segmentNamesForPlan } from "@/lib/services/platform/plan-service";
import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";

export function parseLocationLimit(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) throw new Error("Location limit must be a whole number or blank.");
  const limit = Number(normalized);
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 2_147_483_647) {
    throw new Error("Location limit must be between 0 and 2,147,483,647.");
  }
  return limit;
}

export function isLocationLimitReached(currentCount: number, maxLocations: number | null) {
  return maxLocations !== null && currentCount >= maxLocations;
}

export async function listInventoryLocationLimits(versionId: string) {
  await requirePlatformSessionAdmin();
  const version = await prisma.platformVersion.findUnique({
    where: { id: versionId },
    select: { id: true, version_name: true },
  });
  if (!version) return null;

  const assignments = await prisma.versionBusinessType.findMany({
    where: { version_id: version.id, businessType: { isActive: true } },
    include: {
      businessType: { select: { name: true } },
      segments: {
        where: { is_active: true },
        orderBy: { segment: { sort_order: "asc" } },
        include: { segment: { select: { id: true, name: true } }, locationLimit: true },
      },
    },
  });
  const inventoryAssignments = assignments.filter(({ businessType }) =>
    getErpModuleForBusinessTypeName(businessType.name)?.pathSegment === "inventory-management",
  );

  return {
    version,
    segments: inventoryAssignments.flatMap(({ segments }) => segments.map((assignment) => ({
      assignmentId: assignment.id,
      segmentId: assignment.segment.id,
      segmentName: assignment.segment.name,
      maxLocations: assignment.locationLimit?.max_locations ?? null,
    }))),
  };
}

export async function saveInventoryLocationLimits(
  versionId: string,
  values: Array<{ segmentAssignmentId: string; maxLocations: string }>,
) {
  await requirePlatformSessionAdmin();
  const uniqueValues = [...new Map(values.map((value) => [value.segmentAssignmentId, value])).values()];
  const limits = uniqueValues.map((value) => ({
    segmentAssignmentId: value.segmentAssignmentId,
    maxLocations: parseLocationLimit(value.maxLocations),
  }));
  const assignmentIds = limits.map(({ segmentAssignmentId }) => segmentAssignmentId);
  if (assignmentIds.some((id) => !id)) throw new Error("A segment allocation is missing.");

  const assignments = assignmentIds.length === 0 ? [] : await prisma.versionBusinessTypeSegment.findMany({
    where: {
      id: { in: assignmentIds },
      is_active: true,
      versionBusinessType: { version_id: versionId, businessType: { isActive: true } },
    },
    include: { versionBusinessType: { include: { businessType: { select: { name: true } } } } },
  });
  if (assignments.length !== assignmentIds.length || assignments.some(({ versionBusinessType }) =>
    getErpModuleForBusinessTypeName(versionBusinessType.businessType.name)?.pathSegment !== "inventory-management"
  )) {
    throw new Error("One or more segments do not belong to Inventory Management in this version.");
  }

  await prisma.$transaction(async (transaction) => {
    for (const { segmentAssignmentId, maxLocations } of limits) {
      if (maxLocations === null) {
        await transaction.versionBusinessTypeSegmentLocationLimit.deleteMany({
          where: { version_business_type_segment_id: segmentAssignmentId },
        });
      } else {
        await transaction.versionBusinessTypeSegmentLocationLimit.upsert({
          where: { version_business_type_segment_id: segmentAssignmentId },
          create: { version_business_type_segment_id: segmentAssignmentId, max_locations: maxLocations },
          update: { max_locations: maxLocations },
        });
      }
    }
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function enforceInventoryLocationLimit(
  transaction: Prisma.TransactionClient,
  organizationId: string,
  locationName: string,
) {
  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "organizations" WHERE "id" = ${organizationId} FOR UPDATE
  `);

  const organization = await transaction.organization.findUnique({
    where: { id: organizationId },
    select: { platform_version_id: true },
  });
  if (!organization?.platform_version_id) return;

  const existingLocation = await transaction.masterLocation.findFirst({
    where: { organization_id: organizationId, location_name: locationName },
    select: { id: true },
  });
  if (existingLocation) return;

  const effectivePlans = await getEffectivePlansForOrganization(organizationId, transaction);
  const inventoryPlan = effectivePlans.find(({ businessType }) =>
    getErpModuleForBusinessTypeName(businessType.name)?.pathSegment === "inventory-management",
  );
  if (!inventoryPlan?.plan) return;

  const assignments = await transaction.versionBusinessType.findMany({
    where: {
      version_id: organization.platform_version_id,
      business_type_id: inventoryPlan.businessType.id,
    },
    include: {
      segments: {
        where: { is_active: true },
        include: { segment: { select: { name: true } }, locationLimit: true },
      },
    },
  });
  const activeSegmentNames = segmentNamesForPlan(inventoryPlan.plan);
  const segment = assignments.flatMap(({ segments }) => segments).find(({ segment: item }) =>
    activeSegmentNames.has(item.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
  );
  const maxLocations = segment?.locationLimit?.max_locations ?? null;
  if (maxLocations === null) return;

  const currentCount = await transaction.masterLocation.count({ where: { organization_id: organizationId } });
  if (isLocationLimitReached(currentCount, maxLocations)) {
    throw new Error(`Your Inventory Management segment allows up to ${maxLocations.toLocaleString("en-IN")} locations.`);
  }
}
