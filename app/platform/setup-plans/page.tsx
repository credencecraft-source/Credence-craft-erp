import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import PlatformSetupPlansPage from "./_page-content/platform-setup-plans-page";

export default async function Page() {
  const [plans, businessTypes] = await Promise.all([
    listPlans(),
    listBusinessTypes(),
  ]);

  return <PlatformSetupPlansPage plans={plans} businessTypes={businessTypes} />;
}