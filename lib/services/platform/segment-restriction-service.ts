import { prisma } from "@/lib/database/prisma-client";
import { getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
import { getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";

export type SegmentRestrictionInput = {
  masterModule: string;
  mainModule: string;
  subModule: string;
  actionLevel?: string;
  restrictionType?: string;
  customMessage?: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function restrictionMatchesBusinessTypeModule(restriction: { master_module?: string | null }, businessTypeName: string | null) {
  const targetModule = getErpModuleForBusinessTypeName(businessTypeName ?? "")?.pathSegment ?? "";
  const targetKey = normalize(targetModule);
  const restrictionKey = normalize(restriction.master_module ?? "");

  if (!targetKey || !restrictionKey) return true;
  return restrictionKey === targetKey;
}

function segmentNamesForPlan(plan: { tier_key?: string | null; plan_name: string }) {
  const tierKey = normalize(plan.tier_key || "");
  const planTier = plan.plan_name.includes(" - ") ? plan.plan_name.split(" - ").slice(1).join(" - ") : plan.plan_name;
  const mappedTier = tierKey === "classic" ? "standard" : tierKey === "enterprise" ? "premium" : tierKey;
  return [mappedTier, normalize(planTier)].filter(Boolean);
}

async function getOrganizationVersionId(organizationId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { platform_version_id: true },
  });

  if (organization?.platform_version_id) return organization.platform_version_id;

  const latestVersion = await prisma.platformVersion.findFirst({
    where: { is_active: true },
    orderBy: [{ created_at: "desc" }, { version_name: "desc" }],
    select: { id: true },
  });

  return latestVersion?.id ?? null;
}

export async function listSegmentRestrictions(versionBusinessTypeSegmentId: string) {
  return prisma.segmentRestriction.findMany({
    where: { version_business_type_segment_id: versionBusinessTypeSegmentId },
    orderBy: { created_at: "desc" },
  });
}

export async function createSegmentRestriction(
  versionBusinessTypeSegmentId: string,
  input: SegmentRestrictionInput,
) {
  const masterModule = input.masterModule.trim();
  const mainModule = input.mainModule.trim();
  const subModule = input.subModule.trim();
  const actionLevel = input.actionLevel?.trim() || "*";

  if (!masterModule || !mainModule || !subModule || subModule === "*") {
    throw new Error("Select a third-level submodule.");
  }

  const assignment = await prisma.versionBusinessTypeSegment.findUnique({
    where: { id: versionBusinessTypeSegmentId },
    include: { versionBusinessType: { include: { businessType: true } } },
  });
  const erpModule = assignment
    ? getErpModuleForBusinessTypeName(assignment.versionBusinessType.businessType.name)
    : null;

  if (!assignment || !erpModule || normalize(masterModule) !== normalize(erpModule.pathSegment)) {
    throw new Error("Restriction must belong to this business type's module.");
  }

  const formattedMaster = normalize(masterModule);
  const formattedMain = normalize(mainModule);
  const formattedSub = normalize(subModule);
  const formattedAction = normalize(actionLevel);
  const defaultMessage = `This feature is not available for the ${assignment.versionBusinessType.businessType.name} segment. Upgrade or contact your administrator to unlock ${masterModule} > ${mainModule} > ${subModule}.`;

  return prisma.segmentRestriction.create({
    data: {
      version_business_type_segment_id: versionBusinessTypeSegmentId,
      master_module: masterModule,
      main_module: mainModule,
      sub_module: subModule,
      action_level: actionLevel,
      url_pattern: `/dashboard/*/organizations/*/${formattedMaster}/${formattedMain}/${formattedSub}/${formattedAction}`,
      restriction_type: input.restrictionType?.trim() || "block",
      custom_message: input.customMessage?.trim() || defaultMessage,
    },
  });
}

export async function deleteSegmentRestriction(restrictionId: string) {
  return prisma.segmentRestriction.delete({ where: { restriction_id: restrictionId } });
}

export async function getEffectiveSegmentRestrictions(organizationId: string) {
  const [versionId, effectivePlans] = await Promise.all([
    getOrganizationVersionId(organizationId),
    getEffectivePlansForOrganization(organizationId),
  ]);

  if (!versionId || effectivePlans.length === 0) return [];

  const businessTypeIds = effectivePlans.map(({ businessType }) => businessType.id);
  const assignments = await prisma.versionBusinessType.findMany({
    where: { version_id: versionId, business_type_id: { in: businessTypeIds } },
    include: {
      businessType: true,
      segments: { where: { is_active: true }, include: { segment: true, restrictions: true } },
    },
  });
  const assignmentsByBusinessType = new Map(assignments.map((assignment) => [assignment.business_type_id, assignment]));

  return effectivePlans.flatMap(({ businessType, plan }) => {
    if (!plan) return [];
    const assignment = assignmentsByBusinessType.get(businessType.id);
    const segmentNames = segmentNamesForPlan(plan);
    const segment = assignment?.segments.find(({ segment: item }) => segmentNames.includes(normalize(item.name)));
    const erpModule = getErpModuleForBusinessTypeName(businessType.name);
    if (!segment) return [];

    return segment.restrictions
      .filter((restriction) => restrictionMatchesBusinessTypeModule(restriction, businessType.name))
      .map((restriction) => ({
        ...restriction,
        business_type_id: businessType.id,
        segment_id: segment.segment_id,
        plan_module_path: erpModule?.pathSegment ?? null,
      }));
  });
}

export async function getRestrictionsForPlans(
  organizationId: string,
  plans: Array<{ id: string; business_type_id: string | null; segment_id?: string | null; tier_key?: string | null; plan_name: string }>,
) {
  const versionId = await getOrganizationVersionId(organizationId);
  if (!versionId || plans.length === 0) return new Map<string, Awaited<ReturnType<typeof listSegmentRestrictions>>>();

  const segmentAssignmentIds = plans
    .map((plan) => plan.segment_id)
    .filter((id): id is string => Boolean(id));
  const businessTypeIds = plans
    .map((plan) => plan.business_type_id)
    .filter((id): id is string => Boolean(id));
  const [assignments, businessTypes] = await Promise.all([
    prisma.versionBusinessTypeSegment.findMany({
      where: {
        id: { in: segmentAssignmentIds },
        is_active: true,
        versionBusinessType: { version_id: versionId },
      },
      select: {
        id: true,
        restrictions: true,
      },
    }),
    prisma.businessType.findMany({
      where: { id: { in: businessTypeIds } },
      select: { id: true, name: true },
    }),
  ]);
  const businessTypeById = new Map(businessTypes.map((businessType) => [businessType.id, businessType]));
  const restrictionsBySegmentAssignment = new Map(
    assignments.map((assignment) => [assignment.id, assignment.restrictions]),
  );
  return new Map(
    plans.map((plan) => {
      const restrictions = plan.segment_id ? restrictionsBySegmentAssignment.get(plan.segment_id) ?? [] : [];
      const businessType = plan.business_type_id ? businessTypeById.get(plan.business_type_id) : null;
      const filteredRestrictions = restrictions.filter((restriction) =>
        restrictionMatchesBusinessTypeModule(restriction, businessType?.name ?? null),
      );
      return [plan.id, filteredRestrictions];
    }),
  );
}
