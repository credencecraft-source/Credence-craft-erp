import { listPlans } from "@/lib/services/platform/plan-service";
import OrganizationPricingPlanPage from "./page-content/organization-pricing-plan-page";

export default async function Page() {
  const rawPlans = await listPlans();
  const plans = rawPlans.map((plan) => ({
    ...plan,
    price: plan.price ? Number(plan.price) : null,
  }));
  return <OrganizationPricingPlanPage plans={plans} />;
}