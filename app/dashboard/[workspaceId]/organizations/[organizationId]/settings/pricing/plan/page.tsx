import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import OrganizationPricingPlanPage from "./page-content/organization-pricing-plan-page";

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

  // Fetch both plans and business types concurrently
  const [rawPlans, businessTypes] = await Promise.all([
    listPlans(),
    listBusinessTypes(),
  ]);

  const plans = rawPlans.map((plan) => ({
    ...plan,
    price: plan.price ? Number(plan.price) : null,
  }));

  return (
    <OrganizationPricingPlanPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      plans={plans}
      businessTypes={businessTypes}
    />
  );
}