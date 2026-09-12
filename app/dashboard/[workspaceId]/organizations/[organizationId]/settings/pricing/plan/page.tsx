import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import { activatePlanForBusinessType, listSubscriptions } from "@/lib/services/platform/subscription-service";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationByPublicId, getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
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
  const user = await requireSessionUser();
  const organization = await getOrganizationByPublicId(organizationId);

  if (!organization) {
    redirect(`/dashboard/${workspaceId}/home`);
  }

  async function activatePlanAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    const actionOrganization = await getOrganizationForUser(actionUser.id, organizationId);

    if (!actionOrganization) {
      redirect(`/dashboard/${workspaceId}/home`);
    }
    await requireOrganizationAccess(actionUser.id, actionOrganization.organization_id, ["OWNER", "ADMIN"]);

    const planId = String(formData.get("planId") || "");
    const businessTypeId = String(formData.get("businessTypeId") || "");

    try {
      const existingSubs = await listSubscriptions(actionOrganization.id);
      const isAlreadyActive = (existingSubs ?? []).some(
        (sub: any) => 
          String(sub.organizationId || sub.organization_id || "") === String(organizationId) &&
          String(sub.planId || sub.plan_id || "") === planId && 
          String(sub.businessTypeId || sub.business_type_id || "") === businessTypeId && 
          String(sub.paymentStatus || sub.payment_status || "").toLowerCase() === "paid"
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
      await activatePlanForBusinessType({
        organizationId: actionOrganization.id,
        businessTypeId: businessTypeId || "",
        startDate,
        endDate,
        paymentStatus: "paid",
        planId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to activate plan.";
      redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan?error=${encodeURIComponent(message)}`);
    }

    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan?success=${encodeURIComponent("Plan activated successfully.")}`);
  }

  const [rawPlans, businessTypes, allSubscriptions] = await Promise.all([
    listPlans(),
    listBusinessTypes(),
    listSubscriptions(organization.id).catch(() => []),
  ]);

  const existingSubscriptions = (allSubscriptions ?? []).filter((sub: any) => 
    String(sub.organizationId || sub.organization_id || "") === String(organization.id)
  ).map((sub: any) => ({
    ...sub,
    businessTypeId: sub.businessTypeId ?? sub.business_type_id ?? null,
  }));

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
      existingSubscriptions={existingSubscriptions || []}
      activatePlanAction={activatePlanAction}
    />
  );
}