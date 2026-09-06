import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import { createSubscription, listSubscriptions } from "@/lib/services/platform/subscription-service";
import { redirect } from "next/navigation";
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

  async function activatePlanAction(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    const businessTypeId = String(formData.get("businessTypeId") || "");
    const organizationName = String(formData.get("organizationName") || "");
    const workspaceUserEmail = String(formData.get("workspaceUserEmail") || "");

    try {
      const existingSubs = await listSubscriptions({ organizationId });
      const isAlreadyActive = existingSubs?.some(
        (sub: any) => sub.planId === planId && sub.businessTypeId === businessTypeId && sub.paymentStatus === "paid"
      );

      if (isAlreadyActive) {
        redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan?error=${encodeURIComponent("This plan is already active for this organization.")}`);
      }
    } catch (e: any) {
      if (e?.message?.includes("NEXT_REDIRECT")) throw e;
    }

    const startDate = new Date().toISOString().split("T")[0];
    const endDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    try {
      await createSubscription({
        organizationId,
        organization_name: organizationName,
        workspaceUserEmail,
        businessTypeId,
        planId,
        startDate,
        expireDate: endDate,
        paymentType: "Online",
        paymentStatus: "paid",
      } as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to activate plan.";
      redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan?error=${encodeURIComponent(message)}`);
    }

    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan?success=${encodeURIComponent("Plan activated successfully.")}`);
  }

  const [rawPlans, businessTypes, existingSubscriptions] = await Promise.all([
    listPlans(),
    listBusinessTypes(),
    listSubscriptions({ organizationId }).catch(() => []),
  ]);

  const plans = rawPlans.map((plan) => ({
    ...plan,
    price: plan.price ? Number(plan.price) : null,
  }));

  const organizationName = ""; 
  const workspaceUserEmail = "";

  return (
    <OrganizationPricingPlanPage
      workspaceId={workspaceId}
      organizationId={organizationId}
      plans={plans}
      businessTypes={businessTypes}
      existingSubscriptions={existingSubscriptions || []}
      activatePlanAction={activatePlanAction}
      organizationName={organizationName}
      workspaceUserEmail={workspaceUserEmail}
    />
  );
}