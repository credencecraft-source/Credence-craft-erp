import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { findPlanForVersionSegment, getPlanById } from "@/lib/services/platform/plan-service";
import { createPendingSubscriptions, createPendingUserBasedSubscription, getEffectivePlansForOrganization } from "@/lib/services/platform/subscription-service";
import { resolveOrganizationSegmentPrice } from "@/lib/services/platform/organization-segment-pricing-service";
import { countActiveOrganizationMembers, getPlatformPricingSettings, isPricingModeEnabled } from "@/lib/services/platform/pricing-mode-service";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { prisma } from "@/lib/database/prisma-client";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import SubscriptionCheckoutForm from "./_page-content/subscription-checkout-form";

interface PageProps {
  params: Promise<{ workspaceId: string; organizationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const MAX_STANDARD_USER_LICENSES = 10;

function valuesOf(value: string | string[] | undefined) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

export default async function CheckoutPage({ params, searchParams }: PageProps) {
  const { workspaceId, organizationId } = await params;
  const query = (await searchParams) ?? {};
  const explicitPlanIds = valuesOf(query.planId);
  const selectedSegmentIds = valuesOf(query.segmentId);
  const isUserBasedCheckout = query.pricingMode === "USER_BASED";
  const legacyPlanIds = Object.entries(query)
    .filter(([key]) => !["error", "billingCycle", "billingMonths", "billedUserCount", "planId", "segmentId", "pricingMode"].includes(key))
    .flatMap(([, value]) => valuesOf(value));
  const selectedPlanIds = explicitPlanIds.length ? explicitPlanIds : legacyPlanIds;
  const billingMonths = Number(query.billingMonths) === 6 ? 6 : 12;
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) redirect(`/dashboard/${user.workspace_id}/home`);
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) redirect(`/dashboard/${workspaceId}/home`);
  const [pricingSettings, activeUserCount] = await Promise.all([
    getPlatformPricingSettings(),
    countActiveOrganizationMembers(organization.id),
  ]);
  const requestedBilledUserCount = query.billedUserCount === undefined
    ? activeUserCount
    : typeof query.billedUserCount === "string"
      ? Number(query.billedUserCount)
      : Number.NaN;
  const isBilledUserCountValid = Number.isSafeInteger(requestedBilledUserCount)
    && requestedBilledUserCount >= activeUserCount
    && requestedBilledUserCount <= MAX_STANDARD_USER_LICENSES
    && requestedBilledUserCount > 0;
  const billedUserCount = isBilledUserCountValid ? requestedBilledUserCount : activeUserCount;

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
  const hasInvalidSelection = isUserBasedCheckout
    ? organization.pricing_mode !== "USER_BASED"
      || !isPricingModeEnabled(pricingSettings, "USER_BASED")
      || activeUserCount < 1
      || !isBilledUserCountValid
    : organization.pricing_mode !== "MODULE_BASED"
      || !isPricingModeEnabled(pricingSettings, "MODULE_BASED")
      || selectedPlanIds.length === 0
      || selectedPlanIds.length !== selectedSegmentIds.length
      || checkoutItems.length !== selectedPlanIds.length;
  const effectivePlans = await getEffectivePlansForOrganization(organization.id);
  const now = new Date();
  const projectedStartByBusinessType = new Map(
    effectivePlans.map(({ businessType, subscription, isFree }) => [
      businessType.id,
      !isFree && subscription?.end_date && subscription.end_date > now ? subscription.end_date : now,
    ]),
  );
  const displayPlans = isUserBasedCheckout
    ? [{
        id: "user-based-subscription",
        plan_name: "User Based Pricing",
        price: pricingSettings.user_monthly_price.toNumber(),
        projectedStartDate: now.toISOString(),
      }]
    : checkoutItems.map(({ plan, price }) => {
    const projectedStart = projectedStartByBusinessType.get(plan.business_type_id ?? "") ?? now;
    return {
      id: plan.id,
      plan_name: plan.plan_name,
      price: price?.toNumber() ?? null,
      projectedStartDate: projectedStart.toISOString(),
    };
  });
  const pricingPlanUrl = `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan`;
  const checkoutParams = new URLSearchParams();
  selectedPlanIds.forEach((planId, index) => {
    checkoutParams.append("planId", planId);
    const segmentId = selectedSegmentIds[index];
    if (segmentId) checkoutParams.append("segmentId", segmentId);
  });
  if (isUserBasedCheckout) checkoutParams.set("pricingMode", "USER_BASED");
  checkoutParams.set("billingMonths", String(billingMonths));
  if (isUserBasedCheckout) checkoutParams.set("billedUserCount", String(billedUserCount));
  const checkoutUrl = `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/checkout?${checkoutParams.toString()}`;

  async function handleCheckoutAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) redirect(`/dashboard/${actionUser.workspace_id}/home`);
    const actionOrganization = await getOrganizationForUser(actionUser.id, organizationId);
    if (!actionOrganization) redirect(`/dashboard/${workspaceId}/home`);
    await requireOrganizationAccess(actionUser.id, actionOrganization.organization_id, ["OWNER", "ADMIN"]);

    const requestedMonths = Number(formData.get("billingMonths"));
    if (isUserBasedCheckout) {
      const requestedLicenseCount = Number(formData.get("billedUserCount"));
      try {
        if (requestedMonths !== 6 && requestedMonths !== 12) {
          throw new Error("Choose a 6 or 12 month billing term.");
        }
        await createPendingUserBasedSubscription({
          organizationId: actionOrganization.id,
          organizationName: actionOrganization.organization_name,
          userId: actionUser.id,
          billingMonths: requestedMonths,
          billedUserCount: requestedLicenseCount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to submit the payment request.";
        redirect(`${checkoutUrl}&error=${encodeURIComponent(message)}`);
      }
      redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan?success=${encodeURIComponent("Payment request submitted. Awaiting payment approval.")}`);
    }

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
      const pendingItems = [];

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
        pendingItems.push({
          businessTypeId: plan.business_type_id,
          planId: plan.id,
          monthlyPrice,
        });
      }
      await createPendingSubscriptions({
        organizationId: actionOrganization.id,
        organizationName: actionOrganization.organization_name,
        items: pendingItems,
        billingMonths: requestedMonths,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit the payment request.";
      redirect(`${checkoutUrl}&error=${encodeURIComponent(message)}`);
    }

    redirect(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan?success=${encodeURIComponent("Payment request submitted. Awaiting payment approval.")}`);
  }

  return (
    <Page as="div" className="max-w-4xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Settings / Pricing</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--erp-text)] sm:text-3xl">Complete your subscription</h1>
          <p className="mt-2 text-sm text-[var(--erp-muted)]">Review the billing details below before sending the request for approval.</p>
        </div>

        {typeof query.error === "string" && query.error && (
          <Card role="alert" className="border-[var(--erp-danger)] p-4 text-xs font-medium text-[var(--erp-danger)]">
            {query.error}
          </Card>
        )}

        {hasInvalidSelection ? (
          <Card role="alert" className="p-6 text-sm text-[var(--erp-text)]">
            {isUserBasedCheckout ? (
              <div className="space-y-2">
                <p>
                  {!isBilledUserCountValid
                    ? requestedBilledUserCount > MAX_STANDARD_USER_LICENSES
                      ? "For more than 10 users, contact support for better pricing."
                      : `Choose a whole-number license count from ${Math.max(activeUserCount, 1)} to ${MAX_STANDARD_USER_LICENSES}.`
                    : "User Based Pricing is unavailable, has no active members, or has no configured rate. Contact your platform administrator."}
                </p>
                <Link
                  href={`/dashboard/${workspaceId}/organizations/${encodeURIComponent(organizationId)}/support-tickets`}
                  className="font-semibold text-[var(--erp-brand)] underline-offset-2 hover:underline"
                >
                  Contact support
                </Link>
              </div>
            ) : "No valid paid plans were selected. Return to the plan page and choose a paid tier."}
          </Card>
        ) : (
          <SubscriptionCheckoutForm
            plans={displayPlans}
            organizationName={organization.organization_name}
            defaultBillingMonths={billingMonths as 6 | 12}
            userBasedLicenseCount={isUserBasedCheckout ? billedUserCount : undefined}
            userBasedMonthlyRate={isUserBasedCheckout ? pricingSettings.user_monthly_price.toNumber() : undefined}
            minimumBilledUserCount={activeUserCount}
            pricingPlanUrl={pricingPlanUrl}
            handleCheckoutAction={handleCheckoutAction}
          />
        )}
      </Section>
    </Page>
  );
}
