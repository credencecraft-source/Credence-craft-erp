import { prisma } from "@/lib/database/prisma-client";
import { Prisma } from "@prisma/client";
import { getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
import { isOrganizationTrialActive } from "@/lib/services/platform/organization-trial-service";
import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";
import {
  getVersionTransactionRestrictions,
} from "@/lib/services/platform/version-transaction-restriction-service";

const FORM_LABEL_OVERRIDES: Record<string, string> = {
  factory_work_orders: "Factory Work Orders",
  factory_production_updates: "Factory Production Updates",
  factory_bundle_transfers: "Factory Bundle Transfers",
  factory_grns: "Factory GRNs",
  factory_daily_production_reports: "Factory Daily Production Reports",
};

function formatFormRestrictionLabel(formKey: string) {
  return FORM_LABEL_OVERRIDES[formKey]
    ?? formKey.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

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

export function resolveMonthlyEntryLimit(
  segmentLimit: number | null | undefined,
  versionRestriction: { monthly_entry_limit: number | null } | null | undefined,
) {
  return versionRestriction ? versionRestriction.monthly_entry_limit : segmentLimit ?? null;
}

export function resolveEffectiveMonthlyFormLimits(
  segmentRestriction: { monthly_qty_limit: number | null; monthly_entry_limit: number | null } | null,
  versionRestriction: { monthly_entry_limit: number | null } | null,
) {
  return {
    monthly_qty_limit: segmentRestriction?.monthly_qty_limit ?? null,
    monthly_entry_limit: versionRestriction
      ? versionRestriction.monthly_entry_limit
      : segmentRestriction?.monthly_entry_limit ?? null,
  };
}

export function exceedsMonthlyQuantityLimit(
  currentTotal: Prisma.Decimal | number | string,
  requestedQuantity: Prisma.Decimal | number | string,
  limit: number | null,
) {
  return limit !== null && new Prisma.Decimal(currentTotal).plus(requestedQuantity).greaterThan(limit);
}

export function getConfiguredMonthlyRecordLimits(
  platformSegmentId: string,
  versionRestrictions: Array<{ segment_id: string; form_key: string; monthly_entry_limit: number | null }>,
) {
  return versionRestrictions
    .filter((restriction) => restriction.segment_id === platformSegmentId && restriction.monthly_entry_limit !== null && restriction.monthly_entry_limit > 0)
    .map((restriction) => ({
      formKey: restriction.form_key,
      label: formatFormRestrictionLabel(restriction.form_key),
      monthlyEntryLimit: restriction.monthly_entry_limit!,
    }))
    .sort((first, second) => first.label.localeCompare(second.label));
}

export async function getMonthlyRecordLimitsForSegments(
  versionId: string,
  segments: Array<{ assignmentId: string; platformSegmentId: string }>,
) {
  if (segments.length === 0) return new Map<string, Array<{ formKey: string; label: string; monthlyEntryLimit: number }>>();

  const versionRestrictions = await getVersionTransactionRestrictions(versionId);

  return new Map(segments.map(({ assignmentId, platformSegmentId }) => [
    assignmentId,
    getConfiguredMonthlyRecordLimits(platformSegmentId, versionRestrictions),
  ]));
}

export async function getMonthlyOrderQuantityLimitsForAssignments(versionBusinessTypeSegmentIds: string[]) {
  const assignmentIds = [...new Set(versionBusinessTypeSegmentIds.filter(Boolean))];
  if (assignmentIds.length === 0) return new Map<string, number>();

  const restrictions = await prisma.segmentFormRestriction.findMany({
    where: {
      version_business_type_segment_id: { in: assignmentIds },
      form_key: "merchandising_orders",
      monthly_qty_limit: { gt: 0 },
    },
    select: { version_business_type_segment_id: true, monthly_qty_limit: true },
  });

  return new Map(restrictions.flatMap((restriction) =>
    restriction.monthly_qty_limit === null
      ? []
      : [[restriction.version_business_type_segment_id, restriction.monthly_qty_limit] as const],
  ));
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
  if (await isOrganizationTrialActive(organizationId)) return null;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { platform_version_id: true, pricing_mode: true },
  });
  if (organization?.pricing_mode === "USER_BASED") return null;
  if (!organization?.platform_version_id) return null;

  const effectivePlans = await getEffectivePlansForOrganization(organizationId);
  const businessTypeIds = [...new Set(effectivePlans.map(({ businessType }) => businessType.id))];
  const assignments = businessTypeIds.length === 0 ? [] : await prisma.versionBusinessType.findMany({
    where: { version_id: organization.platform_version_id, business_type_id: { in: businessTypeIds } },
    include: { segments: { where: { is_active: true }, include: { segment: true } } },
  });

  const versionSegmentIds = effectivePlans.flatMap(({ businessType, plan }) => {
    if (!plan) return [];
    const assignment = assignments.find((item) => item.business_type_id === businessType.id);
    const segmentNames = segmentNamesForPlan(plan);
    const segment = assignment?.segments.find(({ segment: item }) => segmentNames.includes(normalize(item.name)));
    return segment ? [segment.segment_id] : [];
  });
  const applicablePlans = formKey === "merchandising_orders"
    ? effectivePlans.filter(({ businessType }) => getErpModuleForBusinessTypeName(businessType.name)?.pathSegment === "order-management")
    : effectivePlans;
  const assignmentIds = applicablePlans.flatMap(({ businessType, plan }) => {
    if (!plan) return [];
    const assignment = assignments.find((item) => item.business_type_id === businessType.id);
    const segmentNames = segmentNamesForPlan(plan);
    const segment = assignment?.segments.find(({ segment: item }) => segmentNames.includes(normalize(item.name)));
    return segment ? [segment.id] : [];
  });

  const [versionRestriction, segmentRestriction] = await Promise.all([
    versionSegmentIds.length === 0 ? null : prisma.versionTransactionRestriction.findFirst({
      where: {
        version_id: organization.platform_version_id,
        segment_id: { in: [...new Set(versionSegmentIds)] },
        form_key: formKey,
      },
    }),
    assignmentIds.length === 0 ? null : prisma.segmentFormRestriction.findFirst({
      where: {
        version_business_type_segment_id: { in: [...new Set(assignmentIds)] },
        form_key: formKey,
      },
    }),
  ]);
  if (!segmentRestriction && !versionRestriction) return null;

  return {
    ...(segmentRestriction ?? versionRestriction),
    ...resolveEffectiveMonthlyFormLimits(segmentRestriction, versionRestriction),
    restricted_fields: segmentRestriction?.restricted_fields ?? [],
    field_sum_limits: segmentRestriction?.field_sum_limits ?? {},
  };
}

export async function validateMonthlyFormLimits(
  organizationId: string,
  formKey: string,
  quantity: number,
  currentRecordId?: string,
  database: Prisma.TransactionClient | typeof prisma = prisma,
  resolvedRestriction?: Awaited<ReturnType<typeof getEffectiveSegmentFormRestriction>>,
  additionalEntryCount = 1,
) {
  const restriction = resolvedRestriction === undefined
    ? await getEffectiveSegmentFormRestriction(organizationId, formKey)
    : resolvedRestriction;
  if (!restriction) return;
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new Error("Order quantity must be a non-negative number.");
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const where = {
    organization_id: organizationId,
    created_at: { gte: monthStart },
    sourceStatus: { not: "DEMO" },
    ...(currentRecordId ? { id: { not: currentRecordId } } : {}),
  };
  const [entryCount, quantityTotal] = await Promise.all([
    database.merchandisingOrder.count({ where }),
    database.merchandisingOrder.aggregate({ where, _sum: { orderQty: true } }),
  ]);
  const currentQuantityTotal = quantityTotal._sum.orderQty ?? new Prisma.Decimal(0);
  const monthlyQuantityLimit = restriction.monthly_qty_limit;

  if (restriction.monthly_entry_limit !== null && entryCount + additionalEntryCount > restriction.monthly_entry_limit) {
    throw new Error(`This form allows ${restriction.monthly_entry_limit.toLocaleString("en-IN")} entries per month.`);
  }
  if (exceedsMonthlyQuantityLimit(currentQuantityTotal, Math.max(quantity, 0), monthlyQuantityLimit)) {
    throw new Error(`This segment allows a monthly order quantity total of ${monthlyQuantityLimit?.toLocaleString("en-IN")}.`);
  }
}

export async function validateRestrictedFormFields(
  organizationId: string,
  formKey: string,
  values: Record<string, unknown>,
  resolvedRestriction?: Awaited<ReturnType<typeof getEffectiveSegmentFormRestriction>>,
) {
  const restriction = resolvedRestriction === undefined
    ? await getEffectiveSegmentFormRestriction(organizationId, formKey)
    : resolvedRestriction;
  if (!restriction || restriction.restricted_fields.length === 0) return;

  const enteredFields = restriction.restricted_fields.filter((field) => {
    const value = values[field];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });
  if (enteredFields.length > 0) {
    throw new Error(`These fields are restricted for your segment: ${enteredFields.join(", ")}.`);
  }
}
