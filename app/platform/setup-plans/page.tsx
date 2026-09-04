import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import PlatformSetupPlansPage from "./_page-content/platform-setup-plans-page";

export default async function Page() {
  const [rawPlans, businessTypes] = await Promise.all([
    listPlans(),
    listBusinessTypes(),
  ]);

  const plans = rawPlans.map((plan) => ({
    ...plan,
    price: plan.price ? Number(plan.price) : null,
  }));

  return <PlatformSetupPlansPage plans={plans} businessTypes={businessTypes} />;
}