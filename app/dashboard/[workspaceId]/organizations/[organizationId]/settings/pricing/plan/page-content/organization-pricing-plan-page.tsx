"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CreditCard, LoaderCircle, LockKeyhole, Plus, ShoppingCart, Users } from "lucide-react";
import { getErpBusinessTypeDisplayName, getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

interface Plan {
  id: string;
  billing_plan_id?: string | null;
  business_type_id?: string | null;
  is_pricing_configured?: boolean;
  plan_name: string;
  segment_name?: string | null;
  location_limit?: number | null;
  segment_id?: string | null;
  segment_sort_order?: number;
  segment_price?: number | null;
  version_name?: string | null;
  description: string | null;
  price: number | null;
  billing_cycle: string | null;
  is_active: boolean;
}

interface FeatureSummary {
  key: string;
  label: string;
  path: string;
  sub: string[];
  available: boolean;
}

interface MonthlyRecordLimit {
  formKey: string;
  label: string;
  monthlyEntryLimit: number;
}

interface BusinessType {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  tags?: Array<{ id: string; label: string }>;
}

interface Subscription {
  id?: string;
  planId?: string;
  businessTypeId?: string | null;
  paymentStatus?: string;
  serviceStatus?: string;
}

interface OrganizationPricingPlanPageProps {
  plans?: Plan[];
  businessTypes?: BusinessType[];
  existingSubscriptions?: Subscription[];
  currentPlanIds?: Record<string, string>;
  planFeatures?: Record<string, FeatureSummary[]>;
  monthlyRecordLimits?: Record<string, MonthlyRecordLimit[]>;
  monthlyOrderQuantityLimits?: Record<string, number>;
  workspaceId: string;
  organizationId: string;
  platformVersionName?: string | null;
  pricingMode?: string;
  pricingModeAvailable?: boolean;
  userMonthlyPrice?: number;
  activeUserCount?: number;
}

export default function OrganizationPricingPlanPage({
  plans = [],
  businessTypes = [],
  existingSubscriptions = [],
  currentPlanIds = {},
  planFeatures = {},
  monthlyRecordLimits = {},
  monthlyOrderQuantityLimits = {},
  workspaceId,
  organizationId,
  pricingMode = "MODULE_BASED",
  pricingModeAvailable = true,
  userMonthlyPrice = 0,
  activeUserCount = 0,
}: OrganizationPricingPlanPageProps) {
  const router = useRouter();
  const [isCheckoutPending, startCheckoutTransition] = useTransition();
  const organizationOrdersUrl = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`;
  const handleBackToOrganization = () => {
    router.push(organizationOrdersUrl);
    router.refresh();
  };
  const safePlans = Array.isArray(plans) ? plans : [];
  const safeBusinessTypes = Array.isArray(businessTypes) ? businessTypes : [];

  const activeBusinessTypes = safeBusinessTypes.filter((bt) => bt.isActive === true);
  const categories = activeBusinessTypes.map((bt) => bt.name);
  const audienceTags = Array.from(
    new Set(activeBusinessTypes.flatMap((businessType) => (businessType.tags ?? []).map((tag) => tag.label))),
  ).map((label) => ({
    label,
    businessTypes: activeBusinessTypes.filter((businessType) => businessType.tags?.some((tag) => tag.label === label)),
  }));
  const defaultBusinessType =
    activeBusinessTypes.find((businessType) => getErpModuleForBusinessTypeName(businessType.name)?.pathSegment === "order-management") ??
    activeBusinessTypes[0];
  const defaultTag = audienceTags.find((tag) => tag.businessTypes.some((businessType) => businessType.id === defaultBusinessType?.id));

  const groupedModules: Record<string, Plan[]> = {};
  categories.forEach((cat) => {
    groupedModules[cat] = [];
  });

  safePlans.forEach((plan) => {
    const category = safeBusinessTypes.find((businessType) => businessType.id === plan.business_type_id)?.name;
    if (category && groupedModules[category]) {
      groupedModules[category].push(plan);
    }
  });

  const [activeTag, setActiveTag] = useState<string | null>(defaultTag?.label ?? audienceTags[0]?.label ?? null);
  const [activeModule, setActiveModule] = useState<string | null>(
    defaultBusinessType?.name ?? null,
  );
  const [selections, setSelections] = useState<Record<string, string>>({});

  const selectedTag = audienceTags.find((tag) => tag.label === activeTag);
  const relatedBusinessTypes = selectedTag?.businessTypes ?? [];
  const currentPlans = activeModule
    ? [...(groupedModules[activeModule] || [])].sort(
        (first, second) => (first.segment_sort_order ?? Number.MAX_SAFE_INTEGER) - (second.segment_sort_order ?? Number.MAX_SAFE_INTEGER),
      )
    : [];
  const isModuleSelected = activeModule ? Boolean(selections[activeModule]) : false;
  const currentSelectedPlanId = activeModule ? selections[activeModule] : undefined;

  const matchedBusinessType = activeModule ? safeBusinessTypes.find((bt) => bt.name === activeModule) : undefined;
  const handleSelectPlan = (planId: string, planPrice: number | null) => {
    if (!activeModule) return;
    const isFree = !planPrice || Number(planPrice) === 0;
    if (isFree) return;

    const isAlreadyCurrentPlan = existingSubscriptions.some(
      (sub) =>
        sub.planId === planId &&
        sub.businessTypeId === matchedBusinessType?.id &&
        sub.paymentStatus === "paid"
    );

    if (isAlreadyCurrentPlan) return;

    setSelections((prev) => ({
      ...prev,
      [activeModule]: planId,
    }));
  };

  const handleClearCart = () => {
    setSelections({});
  };

  const handleProceedToCheckout = () => {
    const params = new URLSearchParams();
    Object.values(selections).forEach((segmentPlanId) => {
      const plan = safePlans.find((item) => item.id === segmentPlanId);
      if (plan?.billing_plan_id) params.append("planId", plan.billing_plan_id);
      if (plan?.segment_id) params.append("segmentId", plan.segment_id);
    });
    startCheckoutTransition(() => {
      router.push(
        `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/checkout?${params.toString()}`
      );
    });
  };

  const totalPrice = Object.entries(selections).reduce(
    (sum, [category, planId]) => {
      const catPlans = groupedModules[category] || [];
      const matchedPlan = catPlans.find((p) => p.id === planId);
      const effectivePrice = matchedPlan?.segment_price ?? matchedPlan?.price;
      return sum + (effectivePrice ? Number(effectivePrice) : 0);
    },
    0
  );

  if (!pricingModeAvailable) {
    return (
      <Page as="div" className="max-w-5xl">
        <Section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="erp-eyebrow">Settings / Pricing</p>
              <h1 className="text-2xl font-bold text-slate-900">Pricing unavailable</h1>
            </div>
            <Button type="button" variant="secondary" onClick={handleBackToOrganization}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to organization
            </Button>
          </div>
          <Card role="alert" className="space-y-4 border-[var(--erp-border)] p-6">
            <p className="text-sm text-slate-700">
              The pricing type assigned to this organization is not configured or enabled by the platform. Contact support or your platform administrator before choosing a plan.
            </p>
            <Link
              href={`/dashboard/${workspaceId}/organizations/${encodeURIComponent(organizationId)}/support-tickets`}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-[var(--erp-brand)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--erp-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--erp-brand)] focus-visible:ring-offset-2"
            >
              Contact support
            </Link>
          </Card>
        </Section>
      </Page>
    );
  }

  if (pricingMode === "USER_BASED") {
    return (
      <Page as="div" className="max-w-5xl">
        <Section className="space-y-4">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="erp-eyebrow">Settings / Subscription</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--erp-text)] sm:text-3xl">User plan</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--erp-muted)]">
                Straightforward per-user pricing with flexible billing at checkout.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={handleBackToOrganization}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to organization
              </Button>
              <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`}>
                <Button type="button" variant="secondary">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  View current plan
                </Button>
              </Link>
            </div>
          </header>

          <div className="mx-auto grid w-full max-w-5xl items-stretch gap-5 md:grid-cols-2">
            <Card className="flex flex-col overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-6 py-4">
                <p className="text-sm font-bold tracking-[0.12em] text-[var(--erp-text)]">PREMIUM</p>
                <Badge>Per user</Badge>
              </div>

              <div className="flex flex-1 flex-col gap-5 p-6">
                <div>
                  <p className="text-4xl font-bold tracking-tight text-[var(--erp-text)] sm:text-5xl">
                    ₹{userMonthlyPrice.toLocaleString("en-IN", { useGrouping: false, maximumFractionDigits: 2 })}
                    <span className="ml-2 text-sm font-medium tracking-normal text-[var(--erp-muted)]">/ user / month</span>
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">
                    One simple price for each user license in your organization.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-4 py-3">
                  <span className="flex items-center gap-2 text-sm text-[var(--erp-muted)]">
                    <Users className="h-4 w-4" aria-hidden="true" />
                    Active organization users
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--erp-text)]">{activeUserCount}</span>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[var(--erp-text)]">Plan details</p>
                  <ul className="space-y-2 text-sm leading-6 text-[var(--erp-muted)]">
                    <li className="flex items-start gap-2">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
                      A flat monthly price per user license
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
                      Choose your billing term at checkout
                    </li>
                  </ul>
                </div>

                <Button
                  type="button"
                  className="mt-auto w-full"
                  disabled={activeUserCount < 1 || isCheckoutPending}
                  onClick={() => {
                    const params = new URLSearchParams({ pricingMode: "USER_BASED" });
                    startCheckoutTransition(() => router.push(
                      `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/checkout?${params.toString()}`,
                    ));
                  }}
                >
                  {isCheckoutPending
                    ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Opening checkout</>
                    : <>Continue <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                </Button>

                {activeUserCount < 1 && (
                  <p className="text-xs leading-5 text-[var(--erp-muted)]" role="status">
                    Add an active organization member before starting a subscription.
                  </p>
                )}
              </div>
            </Card>

            <Card className="flex flex-col overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] px-6 py-4">
                <p className="text-sm font-semibold text-[var(--erp-text)]">Enterprise pricing</p>
                <Badge>10+ users</Badge>
              </div>

              <div className="flex flex-1 flex-col gap-5 p-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--erp-text)] sm:text-2xl">
                    A plan for larger teams
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">
                    For organizations with more than 10 users. Contact us for better pricing tailored to your team.
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-[var(--erp-text)]">Talk to our team about</p>
                  <ul className="space-y-2 text-sm leading-6 text-[var(--erp-muted)]">
                    <li className="flex items-start gap-2">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
                      Pricing tailored to your organization
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-1 h-4 w-4 shrink-0 text-[var(--erp-brand)]" aria-hidden="true" />
                      Support for teams with more than 10 users
                    </li>
                  </ul>
                </div>

                <div className="mt-auto pt-1">
                  <Link
                    href={`/dashboard/${workspaceId}/organizations/${encodeURIComponent(organizationId)}/support-tickets`}
                    className="block"
                  >
                    <Button type="button" size="lg" className="w-full">
                      Contact us for better pricing
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </Section>
      </Page>
    );
  }

  return (
    <Page as="div" className="max-w-[1440px]">
      <Section className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Settings / Subscription</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--erp-text)] sm:text-3xl">Choose module subscriptions</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">Select the business modules and plans your organization needs.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={handleBackToOrganization}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to organization
            </Button>
            <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`}>
              <Button type="button" variant="secondary">
                <CreditCard className="h-4 w-4" aria-hidden="true" />
                View current plan
              </Button>
            </Link>
          </div>
        </header>

        <Card className="space-y-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--erp-text)]">Choose a business type</h2>
            <p className="mt-1 text-xs text-slate-600">Plans and access vary by business type and audience segment.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
          {audienceTags.map((tag) => {
            const active = activeTag === tag.label;
            const hasSelection = tag.businessTypes.some((businessType) => Boolean(selections[businessType.name]));

            return (
              <Button
                key={tag.label}
                type="button"
                size="sm"
                variant={active ? "primary" : "secondary"}
                aria-pressed={active}
                onClick={() => {
                  setActiveTag(tag.label);
                  setActiveModule(null);
                }}
                className="min-h-7 px-2 py-1 text-[11px]"
              >
                {tag.label}
                {hasSelection && <span className={`ml-1 inline-block h-2 w-2 rounded-full ${active ? "bg-white" : "bg-[var(--erp-brand)]"}`} />}
              </Button>
            );
          })}
          {audienceTags.length === 0 && <p className="text-sm text-slate-500">No audience tags have been configured for this pricing version yet.</p>}
          </div>
        {selectedTag && (
          <div className="space-y-2 border-t border-[var(--erp-border)] pt-3">
            <h3 className="text-xs font-semibold text-[var(--erp-text)]">Select a business type</h3>
            <div className="flex flex-wrap gap-1.5">
              {relatedBusinessTypes.map((businessType) => {
                const active = activeModule === businessType.name;

                return (
                  <Button
                    key={businessType.id}
                    type="button"
                    size="sm"
                    variant={active ? "outline" : "secondary"}
                    aria-pressed={active}
                    onClick={() => setActiveModule(businessType.name)}
                    className={`min-h-7 px-2 py-1 text-[11px] ${active ? "bg-[var(--erp-brand-soft)]" : ""}`}
                  >
                    {getErpBusinessTypeDisplayName(businessType.name)}
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        </Card>

        {Object.keys(selections).length > 0 && (
          <Card className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--erp-brand-soft)] text-[var(--erp-brand)]">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs font-medium text-slate-600">Selected plans · {Object.keys(selections).length}</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-[var(--erp-text)]">
                  ₹{totalPrice.toLocaleString("en-IN")} <span className="text-xs font-medium text-slate-600">/ month</span>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" onClick={handleClearCart}>Clear selection</Button>
              <Button type="button" onClick={handleProceedToCheckout} disabled={isCheckoutPending}>
                {isCheckoutPending
                  ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Opening checkout</>
                  : <>Continue to checkout <ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
              </Button>
            </div>
          </Card>
        )}

      {activeModule && currentPlans.length > 0 ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="erp-eyebrow">{activeModule}</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--erp-text)]">Available plans</h2>
            </div>
            <span className="text-sm text-slate-600">{currentPlans.length} plan options</span>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {currentPlans.map((plan, planIndex) => {
            const nameParts = (plan.plan_name || "").split(" - ");
            const tierName =
              nameParts.length > 1
                ? nameParts.slice(1).join(" - ")
                : plan.plan_name;
            const displayName = plan.segment_name || tierName;
            const previousPlan = planIndex > 0 ? currentPlans[planIndex - 1] : null;
            const previousPlanName = previousPlan?.segment_name
              || (previousPlan?.plan_name.includes(" - ")
                ? previousPlan.plan_name.split(" - ").slice(1).join(" - ")
                : previousPlan?.plan_name);

            const isChosen =
              isModuleSelected && currentSelectedPlanId === plan.id;

            const isPricingConfigured = plan.is_pricing_configured === true && plan.segment_price != null;
            const effectivePrice = plan.segment_price ?? null;
            const isFreePlan = isPricingConfigured && (!effectivePrice || Number(effectivePrice) === 0);
            const isCurrentPlan = currentPlanIds[matchedBusinessType?.id || ""] === plan.id;
            const featureList = planFeatures[plan.segment_id ?? plan.id] || [];
            const linkedModule = matchedBusinessType ? getErpModuleForBusinessTypeName(matchedBusinessType.name) : null;
            const visibleFeatureList = featureList.filter((feature) => feature.sub.length > 0 && linkedModule && (feature.path === linkedModule.pathSegment || feature.path.startsWith(`${linkedModule.pathSegment}/`)));
            const availableFeatures = visibleFeatureList.filter((feature) => feature.available);
            const restrictedFeatures = visibleFeatureList.filter((feature) => !feature.available);
            const isModuleUnavailable = visibleFeatureList.length > 0 && availableFeatures.length === 0;
            const planHeaderColor = isModuleUnavailable
              ? "bg-rose-800"
              : "bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-800";
            const previousFeatureKeys = new Set(
              currentPlans
                .slice(0, planIndex)
                .flatMap((previousPlan) => planFeatures[previousPlan.segment_id ?? previousPlan.id] ?? [])
                .filter((feature) => feature.available && feature.sub.length > 0 && linkedModule && (feature.path === linkedModule.pathSegment || feature.path.startsWith(`${linkedModule.pathSegment}/`)))
                .map((feature) => feature.key),
            );
            const additionalFeatures = availableFeatures.filter((feature) => !previousFeatureKeys.has(feature.key));
            const formRecordLimits = monthlyRecordLimits[plan.segment_id ?? plan.id] ?? [];
            const monthlyOrderQtyLimit = linkedModule?.pathSegment === "order-management"
              ? monthlyOrderQuantityLimits[plan.segment_id ?? ""] ?? null
              : null;
            const locationLimit = linkedModule?.pathSegment === "inventory-management"
              ? plan.location_limit ?? null
              : null;

            const matchedPendingSub = existingSubscriptions.some(
              (sub) =>
                sub.planId === plan.id &&
                sub.businessTypeId === matchedBusinessType?.id &&
                sub.paymentStatus === "pending"
            );

            return (
              <div
                key={plan.id}
                className={`relative flex min-w-0 flex-col justify-between rounded-xl border p-3 shadow-sm transition-all ${
                  isChosen
                    ? "border-emerald-600 bg-emerald-50/30 ring-2 ring-emerald-500/30 shadow-md"
                    : isModuleUnavailable
                    ? "border-rose-200 bg-rose-50/40"
                    : "border-[var(--erp-border)] bg-white hover:border-emerald-300 hover:shadow-md"
                }`}
              >
                <div className="space-y-2">
                  <div className={`-mx-3 -mt-3 mb-0 rounded-t-[11px] px-3 py-2.5 text-white ${planHeaderColor}`}>
                    {isPricingConfigured && !isModuleUnavailable && !isFreePlan && (
                      <div className="mb-1.5 flex justify-end">
                        <Button
                          type="button"
                          onClick={() =>
                            !isCurrentPlan &&
                            !matchedPendingSub &&
                            handleSelectPlan(plan.id, effectivePrice)
                          }
                          disabled={isCurrentPlan || matchedPendingSub}
                          aria-label={isChosen ? `${displayName} added to cart` : `Add ${displayName} to cart`}
                          className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border border-white/60 px-2.5 py-1 text-[10px] font-semibold shadow-sm transition-colors ${
                            isCurrentPlan || matchedPendingSub
                              ? "cursor-not-allowed bg-white/70 text-slate-500"
                              : isChosen
                              ? "bg-emerald-50 text-emerald-800 hover:bg-white"
                              : "bg-white text-emerald-800 hover:bg-emerald-50"
                          }`}
                        >
                          {isChosen ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <ShoppingCart aria-hidden="true" className="h-3.5 w-3.5" />}
                          {isCurrentPlan
                            ? "Active Plan"
                            : matchedPendingSub
                            ? "Awaiting payment"
                            : isChosen
                            ? "Added to Cart"
                            : "Add to Cart"}
                        </Button>
                      </div>
                    )}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold leading-5 text-white">{displayName}</h3>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-white">
                          {!isPricingConfigured
                            ? "Not priced"
                            : effectivePrice
                            ? `₹${Number(effectivePrice).toLocaleString("en-IN")}`
                            : "Free"}
                        </p>
                        {isPricingConfigured && effectivePrice !== 0 && (
                          <p className="text-[9px] font-medium text-white/75">per month</p>
                        )}
                        {isModuleUnavailable ? (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-white/30 bg-black/10 px-2 py-0.5 text-[9px] font-semibold">
                            <LockKeyhole aria-hidden="true" className="h-3 w-3" />
                            Unavailable
                          </span>
                        ) : isCurrentPlan ? (
                          <span className="mt-1 inline-flex rounded-full border border-white/30 bg-black/10 px-2 py-0.5 text-[9px] font-semibold">Active</span>
                        ) : matchedPendingSub ? (
                          <span className="mt-1 inline-flex rounded-full border border-white/30 bg-black/10 px-2 py-0.5 text-[9px] font-semibold">Awaiting payment</span>
                        ) : null}
                      </div>
                    </div>
                    {previousPlanName && (
                      <div title={`Everything from ${previousPlanName}, plus additional features`} className="mt-2 flex max-w-full items-center gap-1.5 rounded-md border border-white/30 bg-white/95 px-2 py-1.5 shadow-sm">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 text-[10px] leading-4 text-slate-600">
                          Everything from <span className="font-bold text-slate-900">{previousPlanName}</span>
                          <span className="font-semibold text-emerald-700"> + additional features</span>
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-2">
                    <div className={`rounded-lg border p-2 ${isModuleUnavailable ? "border-rose-200 bg-rose-50/40" : "border-[var(--erp-border)] bg-[var(--erp-surface-soft)]/70"}`}>
                      <section>
                        <div className="mb-1.5 flex items-center gap-1.5">
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">1</span>
                          <h4 className="text-xs font-semibold text-slate-800">Module Access</h4>
                        </div>
                        <div className="space-y-1.5">
                          {visibleFeatureList.length > 0 ? (
                            <>
                              {planIndex > 0 && additionalFeatures.length === 0 && restrictedFeatures.length === 0 && availableFeatures.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">
                                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                                  Full Module Access
                                </span>
                              )}
                              {(planIndex === 0 ? availableFeatures : additionalFeatures).map((feature) => (
                                <div key={feature.key} className="flex items-center justify-between gap-2 rounded border border-emerald-100 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-700">
                                  <span className="truncate">{feature.label}</span>
                                  <Check aria-label="Available" className="h-4 w-4 shrink-0 text-emerald-600" />
                                </div>
                              ))}
                              {restrictedFeatures.length > 0 && (
                                <>
                                  <p className="px-1 pt-1 text-[10px] font-semibold text-rose-700">Restricted features</p>
                                  {restrictedFeatures.map((feature) => (
                                    <div key={feature.key} title={`${feature.label} is restricted in this segment`} className="flex items-center justify-between gap-2 rounded border border-rose-200 bg-white px-2 py-1.5 text-[11px] font-medium text-rose-800">
                                      <span className="truncate">{feature.label}</span>
                                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-rose-700">
                                        <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
                                        Restricted
                                      </span>
                                    </div>
                                  ))}
                                </>
                              )}
                            </>
                          ) : (
                            <p className="rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-500">
                              No module features are configured for this business type.
                            </p>
                          )}
                        </div>
                      </section>

                          {formRecordLimits.length > 0 && (
                        <section className="mt-2 border-t border-slate-200 pt-2">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">2</span>
                            <h4 className="text-xs font-semibold text-slate-800">Record Limits</h4>
                          </div>
                          <div className="space-y-1.5">
                            {formRecordLimits.map((form) => (
                              <div key={form.formKey} className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1.5 text-[11px]">
                                <span className="truncate font-medium text-slate-700">{form.label}</span>
                                <span className="shrink-0 font-semibold text-slate-600">
                                  {form.monthlyEntryLimit.toLocaleString("en-IN")} records
                                </span>
                              </div>
                            ))}
                          </div>
                        </section>
                      )}

                      {(monthlyOrderQtyLimit !== null || locationLimit !== null) && (
                        <section className="mt-2 border-t border-slate-200 pt-2">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-700">{formRecordLimits.length > 0 ? "3" : "2"}</span>
                            <h4 className="text-xs font-semibold text-slate-800">Custom Restrictions</h4>
                          </div>
                          <div className="space-y-1.5">
                            {monthlyOrderQtyLimit !== null && (
                              <div className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px]">
                                <span className="font-medium text-slate-800">Order Qty Limit</span>
                                <span className="shrink-0 font-semibold text-amber-900">{monthlyOrderQtyLimit.toLocaleString("en-IN")} PCS PER/MONTH</span>
                              </div>
                            )}
                            {locationLimit !== null && (
                              <div className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px]">
                                <span className="font-medium text-slate-800">Location Limit</span>
                                <span className="shrink-0 font-semibold text-amber-900">{locationLimit.toLocaleString("en-IN")} locations</span>
                              </div>
                            )}
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                </div>

                {(!isPricingConfigured || isModuleUnavailable || isFreePlan) && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-100 pt-2.5">
                  {!isPricingConfigured ? (
                    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-center text-xs font-semibold text-amber-700">
                      Configure pricing for this version segment.
                    </div>
                  ) : isModuleUnavailable ? (
                    <div className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-100 py-2.5 text-xs font-semibold text-rose-800">
                      <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5" />
                      Module unavailable
                    </div>
                  ) : isFreePlan ? (
                    <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-center text-xs font-semibold text-emerald-700">
                      Included by default. No subscription required.
                    </div>
                  ) : null}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </div>
      ) : activeModule ? (
        <Card className="space-y-2 text-center">
          <p className="text-xs font-medium text-slate-600">
            No version segments are configured for {activeModule} yet.
          </p>
          <p className="text-[11px] text-slate-400">
            Add segments under the platform version configuration to populate these cards.
          </p>
        </Card>
      ) : null}
      </Section>
    </Page>
  );
}