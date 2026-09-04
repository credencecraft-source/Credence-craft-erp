import { listPlans } from "@/lib/services/platform/plan-service";
import OrganizationPricingPlanPage from "./page-content/organization-pricing-plan-page";

export default async function Page() {
  const plans = await listPlans();
  return <OrganizationPricingPlanPage plans={plans} />;
}