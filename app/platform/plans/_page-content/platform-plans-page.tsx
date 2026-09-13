import { redirect } from "next/navigation";

import { listPlans, deletePlan, updatePlan } from "@/lib/services/platform/plan-service";
import { countActiveSubscriptionsByPlan } from "@/lib/services/platform/subscription-service";
import { listActiveBusinessTypes } from "@/lib/services/platform/business-type-service";
import PlatformPlansBrowser from "./platform-plans-browser";

export default async function PlatformPlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const [plans, subscriptionCounts, businessTypes] = await Promise.all([
    listPlans(),
    countActiveSubscriptionsByPlan(),
    listActiveBusinessTypes(),
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

  async function updatePlanAction(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "").trim();
    const priceValue = String(formData.get("price") || "").trim();
    const quantityValue = String(formData.get("maxOrderQty") || "").trim();
    try {
      await updatePlan({
        planId,
        description: String(formData.get("description") || ""),
        price: priceValue === "" ? null : Number(priceValue),
        billingCycle: String(formData.get("billingCycle") || ""),
        maxOrderQty: quantityValue === "" ? null : Number(quantityValue),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update plan.";
      redirect(`/platform/plans?error=${encodeURIComponent(message)}`);
    }
    redirect("/platform/plans");
  }

  return (
    <PlatformPlansBrowser
      plans={plans}
      businessTypes={businessTypes}
      subscriptionCounts={Object.fromEntries(subscriptionCounts)}
      error={params.error}
      deletePlanAction={deletePlanAction}
      updatePlanAction={updatePlanAction}
    />
  );
}
