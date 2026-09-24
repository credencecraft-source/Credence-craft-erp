import { prisma } from "@/lib/database/prisma-client";
import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";

export type VersionTransactionRestrictionInput = {
  versionId: string;
  segmentId: string;
  formKey: string;
  monthlyEntryLimit?: number | null;
};

export type VersionTransactionRestrictionBatchInput = {
  versionId: string;
  formKey: string;
  restrictions: Array<Pick<VersionTransactionRestrictionInput, "segmentId" | "monthlyEntryLimit">>;
};

function normalizeLimit(value: number | null | undefined) {
  if (value === null || value === undefined || value === 0) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Monthly entry limit must be a non-negative whole number or blank.");
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

export async function getVersionTransactionRestrictions(versionId: string) {
  return prisma.versionTransactionRestriction.findMany({
    where: { version_id: versionId },
    include: { segment: true },
    orderBy: [{ form_key: "asc" }, { segment: { sort_order: "asc" } }],
  });
}

export async function upsertVersionTransactionRestriction(input: VersionTransactionRestrictionInput) {
  const results = await upsertVersionTransactionRestrictions({
    versionId: input.versionId,
    formKey: input.formKey,
    restrictions: [{ segmentId: input.segmentId, monthlyEntryLimit: input.monthlyEntryLimit }],
  });
  return results[0];
}

export async function upsertVersionTransactionRestrictions(input: VersionTransactionRestrictionBatchInput) {
  const formKey = input.formKey.trim();
  if (!formKey) throw new Error("A form key is required.");

  const segmentIds = [...new Set(input.restrictions.map((restriction) => restriction.segmentId))];
  const [version, assignments] = await Promise.all([
    prisma.platformVersion.findUnique({ where: { id: input.versionId }, select: { id: true } }),
    prisma.versionBusinessTypeSegment.findMany({
      where: {
        segment_id: { in: segmentIds },
        versionBusinessType: { version_id: input.versionId },
      },
      select: { segment_id: true },
    }),
  ]);
  if (!version) throw new Error("The selected platform version does not exist.");
  if (new Set(assignments.map(({ segment_id }) => segment_id)).size !== segmentIds.length) {
    throw new Error("One or more selected segments are not assigned to this platform version.");
  }

  return prisma.$transaction(
    input.restrictions.map((restriction) => prisma.versionTransactionRestriction.upsert({
      where: {
        version_id_segment_id_form_key: {
          version_id: input.versionId,
          segment_id: restriction.segmentId,
          form_key: formKey,
        },
      },
      create: {
        version_id: input.versionId,
        segment_id: restriction.segmentId,
        form_key: formKey,
        monthly_entry_limit: normalizeLimit(restriction.monthlyEntryLimit),
      },
      update: { monthly_entry_limit: normalizeLimit(restriction.monthlyEntryLimit) },
    })),
  );
}

export async function getEffectiveVersionTransactionRestriction(organizationId: string, formKey: string) {
  const [organization, effectivePlans] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { platform_version_id: true } }),
    getEffectivePlansForOrganization(organizationId),
  ]);
  if (!organization?.platform_version_id) return null;

  const businessTypeIds = effectivePlans.map(({ businessType }) => businessType.id);
  const assignments = await prisma.versionBusinessType.findMany({
    where: { version_id: organization.platform_version_id, business_type_id: { in: businessTypeIds } },
    include: { segments: { where: { is_active: true }, include: { segment: true } } },
  });
  const segmentIds = effectivePlans.flatMap(({ businessType, plan }) => {
    if (!plan) return [];
    const assignment = assignments.find((item) => item.business_type_id === businessType.id);
    const segmentNames = segmentNamesForPlan(plan);
    const segment = assignment?.segments.find(({ segment }) => segmentNames.includes(normalize(segment.name)));
    return segment ? [segment.segment_id] : [];
  });
  if (segmentIds.length === 0) return null;

  return prisma.versionTransactionRestriction.findFirst({
    where: { version_id: organization.platform_version_id, segment_id: { in: [...new Set(segmentIds)] }, form_key: formKey },
  });
}