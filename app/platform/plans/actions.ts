"use server";

import { redirect } from "next/navigation";
import { deletePlan } from "@/lib/services/platform/plan-service";
import { listSubscriptions } from "@/lib/services/platform/subscription-service";
import { prisma } from "@/lib/database/prisma-client";

export async function deletePlanAction(formData: FormData) {
  const planId = String(formData.get("planId") || "");
  
  try {
    if (!planId) throw new Error("Invalid plan ID.");

    // Check active subscriptions count
    const subscriptions = await listSubscriptions();
    const activeSubsCount = subscriptions.filter((sub: any) => {
      const matchPlan = sub.planId === planId || sub.plan_id === planId;
      const status = sub.status || sub.serviceStatus || sub.service_status;
      return matchPlan && status === "active";
    }).length;

    if (activeSubsCount > 0) {
      throw new Error("Cannot delete a plan with active subscriptions.");
    }

    // Delete associated restrictions first to avoid foreign key constraint errors
    await prisma.plan_restrictions.deleteMany({
      where: { plan_id: planId },
    });

    // Delete the plan
    await deletePlan(planId);
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Unable to delete plan.";
    redirect(`/platform/plans?error=${encodeURIComponent(message)}`);
  }
  
  redirect("/platform/plans");
}