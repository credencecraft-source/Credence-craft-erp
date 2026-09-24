import { listVersionSegmentPlansForOrganization } from "@/lib/services/platform/plan-service";
import { getEffectivePlansForOrganization, listSubscriptions } from "@/lib/services/platform/subscription-service";
import { redirect } from "next/navigation";
import { getOrganizationForUser } from "@/lib/services/organizations/organization-service";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { ERP_MODULES } from "@/components/erp/erp-config-registry";
import { restrictionMatchesFeature, type FeaturePath } from "@/lib/services/platform/plan-restriction-matcher";
import { getRestrictionsForPlans } from "@/lib/services/platform/segment-restriction-service";
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

  for (const module of ERP_MODULES) {
    features.push({
      key: module.key,
      label: module.label,
      path: module.pathSegment,
      master: module.key,
      main: "*",
      sub: [],
      route: [module.pathSegment],
    });
    visit(module.children, [module.key], [module.pathSegment]);
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
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    redirect(`/dashboard/${workspaceId}/home`);
  }

  const [versionCatalog, allSubscriptions, effectivePlans] = await Promise.all([
    listVersionSegmentPlansForOrganization(organization.id),
    listSubscriptions(organization.id).catch(() => []),
    getEffectivePlansForOrganization(organization.id),
  ]);

  const existingSubscriptions = (allSubscriptions ?? [])
    .filter((sub: any) => String(sub.organizationId || sub.organization_id || "") === String(organization.id))
    .map((sub: any) => ({
      id: sub.id,
      planId: sub.planId ?? sub.plan_id ?? null,
      businessTypeId: sub.businessTypeId ?? sub.business_type_id ?? null,
      paymentStatus: sub.paymentStatus ?? sub.payment_status ?? null,
      serviceStatus: sub.serviceStatus ?? sub.service_status ?? null,
    }));

  const plans = versionCatalog.plans.map((plan) => ({
    ...plan,
    price: plan.price ? Number(plan.price) : null,
  }));

  const restrictionsByPlan = await getRestrictionsForPlans(organization.id, plans);
  const planRestrictions = plans.flatMap((plan) =>
    (restrictionsByPlan.get(plan.id) ?? []).map((restriction) => ({
      ...restriction,
      plan_id: plan.id,
    })),
  );
  const allSidebarFeatures = getSidebarFeatures();
  const planFeatures: Record<string, FeatureSummary[]> = Object.fromEntries(
    plans.map((plan) => {
      const restrictions = planRestrictions.filter((rule) => rule.plan_id === plan.id && rule.restriction_type.toLowerCase() === "block");
      const features = allSidebarFeatures.map((feature) => {
        const blocked = feature.sub.length > 0 && restrictions.some((rule) => restrictionMatchesFeature(rule, feature));
        return { ...feature, available: !blocked };
      });
      return [plan.id, features];
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
      existingSubscriptions={existingSubscriptions || []}
      currentPlanIds={currentPlanIds}
      planFeatures={planFeatures}
      platformVersionName={versionCatalog.versionName}
    />
  );
}