import { Prisma } from "@prisma/client";
import { getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
import { requirePlatformSessionAdmin } from "@/lib/auth/platform-session-manager";
import { prisma } from "@/lib/database/prisma-client";

export const MERCHANDISING_ORDERS_FORM_KEY = "merchandising_orders";

function parseMonthlyQuantityLimit(value: string) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) throw new Error("Monthly order quantity limit must be a whole number or blank.");
  const limit = Number(normalized);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 2_147_483_647) {
    throw new Error("Monthly order quantity limit must be between 1 and 2,147,483,647.");
  }
  return limit;
}

export async function listOrderQuantityLimits() {
  await requirePlatformSessionAdmin();
  const versions = await prisma.platformVersion.findMany({
    orderBy: { version_name: "asc" },
    include: {
      businessTypes: {
        where: { businessType: { isActive: true } },
        include: {
          businessType: { select: { id: true, name: true } },
          segments: {
            where: { is_active: true },
            orderBy: { segment: { sort_order: "asc" } },
            include: {
              segment: { select: { id: true, name: true } },
              formRestrictions: {
                where: { form_key: MERCHANDISING_ORDERS_FORM_KEY },
                select: { monthly_qty_limit: true },
              },
            },
          },
        },
      },
    },
  });

  return versions.map(({ businessTypes, ...version }) => ({
    ...version,
    segments: businessTypes
      .filter(({ businessType }) => getErpModuleForBusinessTypeName(businessType.name)?.pathSegment === "order-management")
      .flatMap(({ segments }) => segments.map((assignment) => ({
        assignmentId: assignment.id,
        segmentId: assignment.segment.id,
        segmentName: assignment.segment.name,
        monthlyQtyLimit: assignment.formRestrictions[0]?.monthly_qty_limit ?? null,
      }))),
  }));
}

export async function saveOrderQuantityLimits(
  versionId: string,
  values: Array<{ segmentAssignmentId: string; monthlyQtyLimit: string }>,
) {
  await requirePlatformSessionAdmin();
  const uniqueValues = [...new Map(values.map((value) => [value.segmentAssignmentId, value])).values()];
  const limits = uniqueValues.map((value) => ({
    segmentAssignmentId: value.segmentAssignmentId,
    monthlyQtyLimit: parseMonthlyQuantityLimit(value.monthlyQtyLimit),
  }));
  const segmentIds = limits.map(({ segmentAssignmentId }) => segmentAssignmentId);
  if (segmentIds.some((id) => !id)) throw new Error("A segment allocation is missing.");

  const assignments = segmentIds.length === 0 ? [] : await prisma.versionBusinessTypeSegment.findMany({
    where: {
      id: { in: segmentIds },
      versionBusinessType: { version_id: versionId, businessType: { isActive: true } },
    },
    include: { versionBusinessType: { include: { businessType: { select: { name: true } } } } },
  });
  if (assignments.length !== segmentIds.length || assignments.some(({ versionBusinessType }) =>
    getErpModuleForBusinessTypeName(versionBusinessType.businessType.name)?.pathSegment !== "order-management"
  )) {
    throw new Error("One or more segments do not belong to Order Management in this version.");
  }

  await prisma.$transaction(async (transaction) => {
    for (const { segmentAssignmentId, monthlyQtyLimit } of limits) {
      const where = {
        version_business_type_segment_id_form_key: {
          version_business_type_segment_id: segmentAssignmentId,
          form_key: MERCHANDISING_ORDERS_FORM_KEY,
        },
      };
      const existing = await transaction.segmentFormRestriction.findUnique({ where });
      if (monthlyQtyLimit === null) {
        if (existing) {
          await transaction.segmentFormRestriction.update({ where, data: { monthly_qty_limit: null } });
        }
        continue;
      }
      await transaction.segmentFormRestriction.upsert({
        where,
        create: {
          version_business_type_segment_id: segmentAssignmentId,
          form_key: MERCHANDISING_ORDERS_FORM_KEY,
          monthly_qty_limit: monthlyQtyLimit,
        },
        update: { monthly_qty_limit: monthlyQtyLimit },
      });
    }
  }, { maxWait: 10_000, timeout: 30_000 });
}

export async function lockOrganizationOrderQuantityLimit(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  const organizations = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "organizations" WHERE "id" = ${organizationId} FOR UPDATE
  `);
  if (organizations.length === 0) throw new Error("Organization not found.");
}
