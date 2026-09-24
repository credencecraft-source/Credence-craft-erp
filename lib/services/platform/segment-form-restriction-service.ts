import { prisma } from "@/lib/database/prisma-client";
import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";
import { getEffectiveVersionTransactionRestriction } from "@/lib/services/platform/version-transaction-restriction-service";

export type SegmentFormRestrictionInput = {
  formKey: string;
  monthlyQtyLimit?: number | null;
  monthlyEntryLimit?: number | null;
  restrictedFields?: string[];
  fieldSumLimits?: Record<string, number | null>;
};

function normalizeLimit(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number or blank.`);
  }
  return value;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function segmentNamesForPlan(plan: { tier_key?: string | null; plan_name: string }) {
  const tierKey = normalize(plan.tier_key || "");
  const planTier = plan.plan_name.includes(" - ") ? plan.plan_name.split(" - ").slice(1).join(" - ") : plan.plan_name;
  const mappedTier = tierKey === "classic" ? "standard" : tierKey === "enterprise" ? "premium" : tierKey;
  return [mappedTier, normalize(planTier)].filter(Boolean);
}

export async function getSegmentFormRestriction(versionBusinessTypeSegmentId: string, formKey: string) {
  return prisma.segmentFormRestriction.findUnique({
    where: {
      version_business_type_segment_id_form_key: {
        version_business_type_segment_id: versionBusinessTypeSegmentId,
        form_key: formKey,
      },
    },
  });
}

export async function listSegmentFormRestrictions(versionBusinessTypeSegmentIds: string[], formKeys: string[]) {
  return prisma.segmentFormRestriction.findMany({
    where: {
      version_business_type_segment_id: { in: [...new Set(versionBusinessTypeSegmentIds)] },
      form_key: { in: [...new Set(formKeys)] },
    },
  });
}

export async function upsertSegmentFormRestriction(
  versionBusinessTypeSegmentId: string,
  input: SegmentFormRestrictionInput,
) {
  const formKey = input.formKey.trim();
  if (!formKey) throw new Error("A form key is required.");

  const assignment = await prisma.versionBusinessTypeSegment.findUnique({
    where: { id: versionBusinessTypeSegmentId },
    select: { id: true },
  });
  if (!assignment) throw new Error("The selected version segment does not exist.");

  const monthlyQtyLimit = normalizeLimit(input.monthlyQtyLimit, "Monthly quantity limit");
  const monthlyEntryLimit = normalizeLimit(input.monthlyEntryLimit, "Monthly entry limit");
  const restrictedFields = [...new Set((input.restrictedFields ?? []).map((field) => field.trim()).filter(Boolean))];
  const fieldSumLimits = Object.fromEntries(
    Object.entries(input.fieldSumLimits ?? {})
      .map(([field, value]) => [field.trim(), normalizeLimit(value, `Sum limit for ${field}`)])
      .filter(([field, value]) => Boolean(field) && value !== null),
  );

  return prisma.segmentFormRestriction.upsert({
    where: {
      version_business_type_segment_id_form_key: {
        version_business_type_segment_id: versionBusinessTypeSegmentId,
        form_key: formKey,
      },
    },
    create: {
      version_business_type_segment_id: versionBusinessTypeSegmentId,
      form_key: formKey,
      monthly_qty_limit: monthlyQtyLimit,
      monthly_entry_limit: monthlyEntryLimit,
      restricted_fields: restrictedFields,
      field_sum_limits: fieldSumLimits,
    },
    update: {
      monthly_qty_limit: monthlyQtyLimit,
      monthly_entry_limit: monthlyEntryLimit,
      restricted_fields: restrictedFields,
      field_sum_limits: fieldSumLimits,
    },
  });
}

export async function getEffectiveSegmentFormRestriction(
  organizationId: string,
  formKey: string,
) {
  const versionRestriction = await getEffectiveVersionTransactionRestriction(organizationId, formKey);
  if (versionRestriction) {
    return {
      ...versionRestriction,
      monthly_qty_limit: null,
      restricted_fields: [],
      field_sum_limits: {},
    };
  }

  const effectivePlans = await getEffectivePlansForOrganization(organizationId);
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { platform_version_id: true } });
  if (!organization?.platform_version_id) return null;

  const businessTypeIds = effectivePlans.map(({ businessType }) => businessType.id);
  const assignments = await prisma.versionBusinessType.findMany({
    where: { version_id: organization.platform_version_id, business_type_id: { in: businessTypeIds } },
    include: { segments: { where: { is_active: true }, include: { segment: true } } },
  });
  const assignmentIds = effectivePlans.flatMap(({ businessType, plan }) => {
    if (!plan) return [];
    const assignment = assignments.find((item) => item.business_type_id === businessType.id);
    const segmentNames = segmentNamesForPlan(plan);
    const segment = assignment?.segments.find(({ segment: item }) => segmentNames.includes(normalize(item.name)));
    return segment ? [segment.id] : [];
  });

  if (assignmentIds.length === 0) return null;

  return prisma.segmentFormRestriction.findFirst({
    where: {
      version_business_type_segment_id: { in: assignmentIds },
      form_key: formKey,
    },
  });
}

export async function validateMonthlyFormLimits(
  organizationId: string,
  formKey: string,
  quantity: number,
  currentRecordId?: string,
) {
  const restriction = await getEffectiveSegmentFormRestriction(organizationId, formKey);
  if (!restriction) return;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const where = {
    organization_id: organizationId,
    created_at: { gte: monthStart },
    ...(currentRecordId ? { id: { not: currentRecordId } } : {}),
  };
  const [entryCount, quantityTotal] = await Promise.all([
    prisma.merchandisingOrder.count({ where }),
    prisma.merchandisingOrder.aggregate({ where, _sum: { orderQty: true } }),
  ]);
  const nextQuantityTotal = Number(quantityTotal._sum.orderQty ?? 0) + Math.max(quantity, 0);

  if (restriction.monthly_entry_limit !== null && entryCount + 1 > restriction.monthly_entry_limit) {
    throw new Error(`This form allows ${restriction.monthly_entry_limit.toLocaleString("en-IN")} entries per month.`);
  }
  if (restriction.monthly_qty_limit !== null && nextQuantityTotal > restriction.monthly_qty_limit) {
    throw new Error(`This form allows a monthly quantity total of ${restriction.monthly_qty_limit.toLocaleString("en-IN")}.`);
  }
}

export async function validateRestrictedFormFields(
  organizationId: string,
  formKey: string,
  values: Record<string, unknown>,
) {
  const restriction = await getEffectiveSegmentFormRestriction(organizationId, formKey);
  if (!restriction || restriction.restricted_fields.length === 0) return;

  const enteredFields = restriction.restricted_fields.filter((field) => {
    const value = values[field];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
  if (enteredFields.length > 0) {
    throw new Error(`These fields are restricted for your segment: ${enteredFields.join(", ")}.`);
  }
}
