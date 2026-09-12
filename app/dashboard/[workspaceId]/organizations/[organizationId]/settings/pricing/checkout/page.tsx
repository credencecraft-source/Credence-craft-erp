import React from "react";
import { redirect } from "next/navigation";
import { getPlanById } from "@/lib/services/platform/plan-service";
import { createPendingSubscription } from "@/lib/services/platform/subscription-service";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import SubscriptionCheckoutForm from "./_page-content/subscription-checkout-form";

interface PageProps {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function valuesOf(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

export default async function CheckoutPage({ params, searchParams }: PageProps) {
  const { workspaceId, organizationId } = await params;
  const query = (await searchParams) ?? {};
  const explicitPlanIds = valuesOf(query.planId);
  const legacyPlanIds = Object.entries(query)
    .filter(([key]) => !["error", "billingCycle", "billingMonths", "planId"].includes(key))
    .flatMap(([, value]) => valuesOf(value));
  const selectedPlanIds = [...new Set(explicitPlanIds.length ? explicitPlanIds : legacyPlanIds)];
  const billingMonths = Number(query.billingMonths) === 6 ? 6 : 12;
  const user = await requireSessionUser();
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) redirect(`/dashboard/${workspaceId}/home`);

  const plans = (await Promise.all(selectedPlanIds.map((id) => getPlanById(id)))).filter(
    (plan): plan is NonNullable<typeof plan> => Boolean(plan),
  );
  const monthlySubtotal = plans.reduce((sum, plan) => sum + Number(plan?.price || 0), 0);
  const pricingPlanUrl = `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan`;

  async function handleCheckoutAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    const actionOrganization = await getOrganizationForUser(actionUser.id, organizationId);
    if (!actionOrganization) redirect(`/dashboard/${workspaceId}/home`);
    await requireOrganizationAccess(actionUser.id, actionOrganization.organization_id, ["OWNER", "ADMIN"]);

    const requestedMonths = Number(formData.get("billingMonths"));
    if (!selectedPlanIds.length || (requestedMonths !== 6 && requestedMonths !== 12)) {
      redirect(`${pricingPlanUrl}?error=${encodeURIComponent("Select a valid paid plan and a 6 or 12 month term.")}`);
    }

    try {
      for (const selectedPlanId of selectedPlanIds) {
        const plan = await getPlanById(selectedPlanId);
        if (!plan || !plan.business_type_id || Number(plan.price || 0) <= 0) {
          throw new Error("One of the selected plans is no longer available.");
        }
        await createPendingSubscription({
          organizationId: actionOrganization.id,
          organizationName: actionOrganization.organization_name,
          businessTypeId: plan.business_type_id,
          planId: plan.id,
          monthlyPrice: Number(plan.price || 0),
          billingMonths: requestedMonths,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit the payment request.";
      redirect(`${pricingPlanUrl}?error=${encodeURIComponent(message)}`);
    }

    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan?success=${encodeURIComponent("Payment request submitted. Awaiting payment approval.")}`);
  }

  return (
    <div className="min-h-full bg-slate-50 p-6 sm:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">Settings / Pricing</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Complete your subscription</h1>
          <p className="mt-2 text-sm text-slate-600">Review the billing details below before sending the request for approval.</p>
        </div>

        {typeof query.error === "string" && query.error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">{query.error}</p>}

        {plans.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">No valid paid plans were selected. Return to the plan page and choose a paid tier.</div>
        ) : (
          <SubscriptionCheckoutForm
            plans={plans.map((plan) => ({ id: plan.id, plan_name: plan.plan_name, price: plan.price }))}
            organizationName={organization.organization_name}
            organizationId={organizationId}
            workspaceId={workspaceId}
            monthlySubtotal={monthlySubtotal}
            defaultBillingMonths={billingMonths as 6 | 12}
            pricingPlanUrl={pricingPlanUrl}
            handleCheckoutAction={handleCheckoutAction}
          />
        )}
      </div>
    </div>
  );
}
