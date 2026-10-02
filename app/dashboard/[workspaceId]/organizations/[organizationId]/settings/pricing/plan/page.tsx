import { listVersionSegmentPlansForOrganization } from "@/lib/services/platform/plan-service";
import { getEffectivePlansForOrganization, listSubscriptions } from "@/lib/services/platform/subscription-service";
import { redirect } from "next/navigation";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import { restrictionMatchesFeature, type FeaturePath } from "@/lib/services/platform/plan-restriction-matcher";
import { getRestrictionsForPlans } from "@/lib/services/platform/segment-restriction-service";
import { getMonthlyOrderQuantityLimitsForAssignments, getMonthlyRecordLimitsForSegments } from "@/lib/services/platform/segment-form-restriction-service";
import OrganizationPricingPlanPage from "./page-content/organization-pricing-plan-page";

type FeatureSummary = FeaturePath & { key: string; label: string; path: string; available: boolean };

function getSidebarFeatures() {
  const features: Array<FeaturePath & { key: string; label: string; path: string }> = [];
  const visit = (items: typeof ERP_MODULES[number]["children"], parentPath: string[], parentRoute: string[]) => {
    for (const item of items) {
      const itemParts = (item.pathSegment || item.key).split("/").filter(Boolean);
      const pathParts = [...parentPath, item.key];
      const routeParts = [...parentRoute, ...itemParts];
      features.push({
        key: pathParts.join("/"),
        label: item.label,
        path: routeParts.join("/"),
        master: pathParts[0] || "",
        main: pathParts[1] || "",
        sub: pathParts.slice(2),
        route: routeParts,
      });
      if (item.children?.length) visit(item.children, pathParts, routeParts);
    }
  };

  for (const erpModule of ERP_MODULES) {
    features.push({
      key: erpModule.key,
      label: erpModule.label,
      path: erpModule.pathSegment,
      master: erpModule.key,
      main: "*",
      sub: [],
      route: [erpModule.pathSegment],
    });
    visit(erpModule.children, [erpModule.key], [erpModule.pathSegment]);
  }
  return features;
}

interface PageProps {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
}

export default async function Page({ params }: PageProps) {
  const resolvedParams = await params;
  const workspaceId = resolvedParams?.workspaceId;
  const organizationId = resolvedParams?.organizationId;
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) redirect(`/dashboard/${user.workspace_id}/home`);
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    redirect(`/dashboard/${workspaceId}/home`);
  }

  const [versionCatalog, allSubscriptions, effectivePlans] = await Promise.all([
    listVersionSegmentPlansForOrganization(organization.id),
    listSubscriptions(organization.id),
    getEffectivePlansForOrganization(organization.id),
  ]);

  const existingSubscriptions = allSubscriptions.map((sub) => ({
      id: sub.id,
      planId: sub.planId,
      businessTypeId: sub.businessTypeId,
      paymentStatus: sub.paymentStatus,
      serviceStatus: sub.service_status,
    }));

  const plans = versionCatalog.plans.map((plan) => ({
    ...plan,
    price: plan.price ? Number(plan.price) : null,
  }));

  const [restrictionsBySegment, monthlyRestrictionData] = await Promise.all([
    getRestrictionsForPlans(organization.id, plans),
    versionCatalog.versionId
      ? Promise.all([
          getMonthlyRecordLimitsForSegments(versionCatalog.versionId, plans.flatMap((plan) =>
            plan.segment_id && plan.platform_segment_id
              ? [{ assignmentId: plan.segment_id, platformSegmentId: plan.platform_segment_id }]
              : [],
          )),
          getMonthlyOrderQuantityLimitsForAssignments(plans.map((plan) => plan.segment_id).filter((id): id is string => Boolean(id))),
        ])
      : Promise.resolve([new Map(), new Map()]),
  ]);
  const [monthlyRecordLimits, monthlyOrderQuantityLimits] = monthlyRestrictionData;
  const allSidebarFeatures = getSidebarFeatures();
  const planFeatures: Record<string, FeatureSummary[]> = Object.fromEntries(
    plans.map((plan) => {
      const segmentKey = plan.segment_id ?? plan.id;
      const restrictions = restrictionsBySegment.get(segmentKey) ?? [];
      const features = allSidebarFeatures.map((feature) => {
        const blocked = feature.sub.length > 0 && restrictions.some((rule) => restrictionMatchesFeature(rule, feature));
        return { ...feature, available: !blocked };
      });
      return [segmentKey, features];
    }),
  );

  const currentPlanIds = Object.fromEntries(
    effectivePlans
      .filter(({ plan, isFree }) => Boolean(plan) && !isFree)
      .map(({ businessType, plan }) => [businessType.id, plan!.id]),
  );

  return (
    <OrganizationPricingPlanPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      plans={plans}
      businessTypes={versionCatalog.businessTypes}
      existingSubscriptions={existingSubscriptions}
      currentPlanIds={currentPlanIds}
      planFeatures={planFeatures}
      monthlyRecordLimits={Object.fromEntries(monthlyRecordLimits)}
      monthlyOrderQuantityLimits={Object.fromEntries(monthlyOrderQuantityLimits)}
      platformVersionName={versionCatalog.versionName}
    />
  );
}