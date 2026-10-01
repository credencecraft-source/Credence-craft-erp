import React from "react";
import { redirect } from "next/navigation";
import { findPlanForVersionSegment, getPlanById } from "@/lib/services/platform/plan-service";
import { createPendingSubscription } from "@/lib/services/platform/subscription-service";
import { resolveOrganizationSegmentPrice } from "@/lib/services/platform/organization-segment-pricing-service";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { prisma } from "@/lib/database/prisma-client";
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
  const selectedSegmentIds = valuesOf(query.segmentId);
  const legacyPlanIds = Object.entries(query)
    .filter(([key]) => !["error", "billingCycle", "billingMonths", "planId", "segmentId"].includes(key))
    .flatMap(([, value]) => valuesOf(value));
  const selectedPlanIds = explicitPlanIds.length ? explicitPlanIds : legacyPlanIds;
  const billingMonths = Number(query.billingMonths) === 6 ? 6 : 12;
  const user = await requireSessionUser();
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) redirect(`/dashboard/${workspaceId}/home`);

  const segmentAssignments = await prisma.versionBusinessTypeSegment.findMany({
    where: {
      id: { in: selectedSegmentIds },
      is_active: true,
      versionBusinessType: { is: { version_id: organization.platform_version_id ?? "" } },
    },
    select: {
      id: true,
      price: true,
      segment: { select: { name: true } },
      versionBusinessType: { select: { business_type_id: true } },
    },
  });
  const assignmentById = new Map(segmentAssignments.map((assignment) => [assignment.id, assignment]));
  const organizationPrices = await prisma.organizationSegmentPrice.findMany({
    where: {
      organization_id: organization.id,
      version_business_type_segment_id: { in: segmentAssignments.map(({ id }) => id) },
    },
    select: {
      version_business_type_segment_id: true,
      snapshot_price: true,
      custom_price: true,
    },
  });
  const organizationPriceBySegment = new Map(
    organizationPrices.map((price) => [price.version_business_type_segment_id, price]),
  );
  const loadedPlans = await Promise.all(selectedPlanIds.map((id) => getPlanById(id)));
  const checkoutItems = selectedPlanIds.flatMap((planId, index) => {
    const plan = loadedPlans[index];
    const assignment = assignmentById.get(selectedSegmentIds[index] ?? "");
    if (
      !plan ||
      !plan.is_active ||
      !assignment ||
      plan.business_type_id !== assignment.versionBusinessType.business_type_id ||
      findPlanForVersionSegment([plan], assignment.versionBusinessType.business_type_id, assignment.segment.name) !== plan
    ) return [];

    const organizationPrice = organizationPriceBySegment.get(assignment.id) ?? null;
    const price = resolveOrganizationSegmentPrice(organizationPrice, assignment.price);
    return [{ plan, price }];
  });
  const hasInvalidSelection =
    selectedPlanIds.length === 0 ||
    selectedPlanIds.length !== selectedSegmentIds.length ||
    checkoutItems.length !== selectedPlanIds.length;
  const monthlySubtotal = checkoutItems.reduce(
    (sum, item) => sum + (item.price?.toNumber() ?? 0),
    0,
  );
  const pricingPlanUrl = `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan`;

  async function handleCheckoutAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) redirect(`/dashboard/${actionUser.workspace_id}/home`);
    const actionOrganization = await getOrganizationForUser(actionUser.id, organizationId);
    if (!actionOrganization) redirect(`/dashboard/${workspaceId}/home`);
    await requireOrganizationAccess(actionUser.id, actionOrganization.organization_id, ["OWNER", "ADMIN"]);

    const requestedMonths = Number(formData.get("billingMonths"));
    if (
      !selectedPlanIds.length ||
      selectedPlanIds.length !== selectedSegmentIds.length ||
      (requestedMonths !== 6 && requestedMonths !== 12)
    ) {
      redirect(`${pricingPlanUrl}?error=${encodeURIComponent("Select a valid paid plan and a 6 or 12 month term.")}`);
    }

    try {
      const currentAssignments = await prisma.versionBusinessTypeSegment.findMany({
        where: {
          id: { in: selectedSegmentIds },
          is_active: true,
          versionBusinessType: { is: { version_id: actionOrganization.platform_version_id ?? "" } },
        },
        select: {
          id: true,
          price: true,
          segment: { select: { name: true } },
          versionBusinessType: { select: { business_type_id: true } },
        },
      });
      const currentAssignmentById = new Map(currentAssignments.map((assignment) => [assignment.id, assignment]));
      const currentOrganizationPrices = await prisma.organizationSegmentPrice.findMany({
        where: {
          organization_id: actionOrganization.id,
          version_business_type_segment_id: { in: currentAssignments.map(({ id }) => id) },
        },
        select: {
          version_business_type_segment_id: true,
          snapshot_price: true,
          custom_price: true,
        },
      });
      const currentPriceBySegment = new Map(
        currentOrganizationPrices.map((price) => [price.version_business_type_segment_id, price]),
      );
      const currentPlans = await Promise.all(selectedPlanIds.map((id) => getPlanById(id)));
      const seenBusinessTypes = new Set<string>();

      for (const index of selectedPlanIds.keys()) {
        const plan = currentPlans[index];
        const assignment = currentAssignmentById.get(selectedSegmentIds[index] ?? "");
        if (!plan || !plan.is_active || !plan.business_type_id || !assignment) {
          throw new Error("One of the selected plans is no longer available.");
        }
        if (
          assignment.versionBusinessType.business_type_id !== plan.business_type_id ||
          findPlanForVersionSegment([plan], assignment.versionBusinessType.business_type_id, assignment.segment.name) !== plan ||
          seenBusinessTypes.has(plan.business_type_id)
        ) {
          throw new Error("The selected plan and segment do not match the organization's assigned version.");
        }
        seenBusinessTypes.add(plan.business_type_id);
        const organizationPrice = currentPriceBySegment.get(assignment.id) ?? null;
        const monthlyPrice = resolveOrganizationSegmentPrice(organizationPrice, assignment.price);
        if (!monthlyPrice || monthlyPrice.lessThanOrEqualTo(0)) throw new Error("The selected segment price is not available.");
        await createPendingSubscription({
          organizationId: actionOrganization.id,
          organizationName: actionOrganization.organization_name,
          businessTypeId: plan.business_type_id,
          planId: plan.id,
          monthlyPrice,
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

        {hasInvalidSelection ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">No valid paid plans were selected. Return to the plan page and choose a paid tier.</div>
        ) : (
          <SubscriptionCheckoutForm
            plans={checkoutItems.map(({ plan, price }) => ({ id: plan.id, plan_name: plan.plan_name, price: price?.toNumber() ?? null }))}
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
