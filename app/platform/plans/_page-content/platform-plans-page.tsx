import { redirect } from "next/navigation";

import { listPlans, deletePlan } from "@/lib/services/platform/plan-service";
import { countActiveSubscriptionsByPlan } from "@/lib/services/platform/subscription-service";
import PlatformPlansBrowser from "./platform-plans-browser";

export default async function PlatformPlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const [plans, subscriptionCounts] = await Promise.all([
    listPlans(),
    countActiveSubscriptionsByPlan(),
  ]);
  const params = (await searchParams) ?? {};

  async function deletePlanAction(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    try {
      if (planId) await deletePlan(planId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete plan.";
      redirect(`/platform/plans?error=${encodeURIComponent(message)}`);
    }
    redirect("/platform/plans");
  }

  return (
    <PlatformPlansBrowser
      plans={plans}
      subscriptionCounts={Object.fromEntries(subscriptionCounts)}
      error={params.error}
      deletePlanAction={deletePlanAction}
    />
  );
}
