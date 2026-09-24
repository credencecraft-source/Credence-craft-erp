"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getErpModuleForBusinessTypeName } from "@/components/erp/erp-config-registry";

interface Plan {
  id: string;
  billing_plan_id?: string | null;
  business_type_id?: string | null;
  is_pricing_configured?: boolean;
  plan_name: string;
  segment_name?: string | null;
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
  businessTypeId?: string;
  paymentStatus?: string;
  serviceStatus?: string;
}

interface OrganizationPricingPlanPageProps {
  plans?: Plan[];
  businessTypes?: BusinessType[];
  existingSubscriptions?: Subscription[];
  currentPlanIds?: Record<string, string>;
  planFeatures?: Record<string, FeatureSummary[]>;
  workspaceId: string;
  organizationId: string;
  platformVersionName?: string | null;
}

export default function OrganizationPricingPlanPage({
  plans = [],
  businessTypes = [],
  existingSubscriptions = [],
  currentPlanIds = {},
  planFeatures = {},
  workspaceId,
  organizationId,
  platformVersionName = null,
}: OrganizationPricingPlanPageProps) {
  const router = useRouter();
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
  const firstPaidPlan = currentPlans.find(
    (p) => (p.segment_price ?? p.price) && Number(p.segment_price ?? p.price) > 0
  );

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

  const handleDeselectModule = () => {
    if (!activeModule) return;
    setSelections((prev) => {
      const copy = { ...prev };
      delete copy[activeModule];
      return copy;
    });
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
    router.push(
      `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/checkout?${params.toString()}`
    );
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

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-24 sm:px-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="erp-eyebrow">Settings</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
            Pricing & Subscriptions
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
          <div className="mr-1 flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-1.5 text-white shadow-sm">
            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">Cart total</span>
              <span className="text-sm font-black text-emerald-400">₹{totalPrice.toLocaleString("en-IN")} <span className="text-[9px] font-normal text-slate-300">/ mo</span></span>
            </div>
            <button
              type="button"
              onClick={handleProceedToCheckout}
              disabled={Object.keys(selections).length === 0}
              className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pay Now ({Object.keys(selections).length})
            </button>
            {Object.keys(selections).length > 0 && (
              <button
                type="button"
                onClick={handleClearCart}
                className="text-[10px] font-semibold text-slate-300 transition-colors hover:text-white"
              >
                Remove cart
              </button>
            )}
          </div>
            <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              Back
            </button>
            <button type="button" onClick={() => router.push(`/dashboard/${workspaceId}/home`)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50">
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              View Active Plan
            </button>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
          {audienceTags.map((tag) => {
            const active = activeTag === tag.label;
            const hasSelection = tag.businessTypes.some((businessType) => Boolean(selections[businessType.name]));

            return (
              <button
                key={tag.label}
                type="button"
                onClick={() => {
                  setActiveTag(tag.label);
                  setActiveModule(null);
                }}
                className={`rounded-md px-3 py-1.5 text-[11px] font-bold transition-colors ${active ? "bg-emerald-600 text-white shadow-sm" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {tag.label}
                {hasSelection && <span className={`ml-2 inline-block h-2 w-2 rounded-full ${active ? "bg-white" : "bg-emerald-500"}`} />}
              </button>
            );
          })}
          {audienceTags.length === 0 && <p className="text-sm text-slate-500">No audience tags have been configured for this pricing version yet.</p>}
        </div>
        {selectedTag && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-1.5">
              {relatedBusinessTypes.map((businessType) => {
                const active = activeModule === businessType.name;

                return (
                  <button
                    key={businessType.id}
                    type="button"
                    onClick={() => setActiveModule(businessType.name)}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"}`}
                  >
                    {businessType.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {activeModule && currentPlans.length > 0 ? (
        <div className="space-y-2 pb-12">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Segments</p>
            <span className="text-[11px] font-semibold text-slate-400">{currentPlans.length} available</span>
          </div>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3">
          {currentPlans.map((plan, planIndex) => {
            const nameParts = (plan.plan_name || "").split(" - ");
            const tierName =
              nameParts.length > 1
                ? nameParts.slice(1).join(" - ")
                : plan.plan_name;
            const displayName = plan.segment_name || tierName;

            const isChosen =
              isModuleSelected && currentSelectedPlanId === plan.id;

            const isPricingConfigured = plan.is_pricing_configured === true && plan.segment_price != null;
            const effectivePrice = plan.segment_price ?? null;
            const isFreePlan = isPricingConfigured && (!effectivePrice || Number(effectivePrice) === 0);
            const isCurrentPlan = currentPlanIds[matchedBusinessType?.id || ""] === plan.id;
            const featureList = planFeatures[plan.id] || [];
            const linkedModule = matchedBusinessType ? getErpModuleForBusinessTypeName(matchedBusinessType.name) : null;
            const visibleFeatureList = featureList.filter((feature) => feature.sub.length > 0 && linkedModule && (feature.path === linkedModule.pathSegment || feature.path.startsWith(`${linkedModule.pathSegment}/`)));
            const availableFeatures = visibleFeatureList.filter((feature) => feature.available);
            const previousFeatureKeys = new Set(
              currentPlans
                .slice(0, planIndex)
                .flatMap((previousPlan) => planFeatures[previousPlan.id] || [])
                .filter((feature) => feature.available && feature.sub.length > 0 && linkedModule && (feature.path === linkedModule.pathSegment || feature.path.startsWith(`${linkedModule.pathSegment}/`)))
                .map((feature) => feature.key),
            );
            const addedFeatures = availableFeatures.filter((feature) => !previousFeatureKeys.has(feature.key));
            const inheritedFeatureCount = availableFeatures.length - addedFeatures.length;
            const unavailableFeatures = visibleFeatureList.filter((feature) => !feature.available);

            const matchedPendingSub = existingSubscriptions.some(
              (sub) =>
                sub.planId === plan.id &&
                sub.businessTypeId === matchedBusinessType?.id &&
                sub.paymentStatus === "pending"
            );

            return (
              <div
                key={plan.id}
                className={`relative flex min-w-[min(86vw,21rem)] snap-start flex-col justify-between rounded-xl border bg-white p-4 shadow-sm transition-all sm:min-w-[20rem] lg:min-w-[21rem] ${
                  isChosen
                    ? "border-emerald-600 ring-2 ring-emerald-500 shadow-md"
                    : "border-slate-200"
                }`}
              >
                <div className="space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold leading-5 text-slate-800">
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-slate-100 px-1 text-[10px] font-bold text-slate-500">{String(planIndex + 1).padStart(2, "0")}</span>
                        {displayName}
                        <span className="text-sm font-extrabold text-slate-950">
                          {!isPricingConfigured
                            ? "Pricing not configured"
                            : effectivePrice
                            ? `- ₹${Number(effectivePrice).toLocaleString("en-IN")} / mo`
                            : "- Free"}
                        </span>
                      </h3>

                      {isCurrentPlan && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full uppercase tracking-wider">
                          Active
                        </span>
                      )}
                      {!isCurrentPlan && matchedPendingSub && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full uppercase tracking-wider">
                          Awaiting payment
                        </span>
                      )}
                    </div>

                  </div>

                  <div className="border-t border-slate-100 pt-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Included access</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-700">
                            {planIndex === 0 ? "Base access" : `Free + ${addedFeatures.length} added`}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600 shadow-sm">
                          {availableFeatures.length} available
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {addedFeatures.length > 0 ? (
                          <>
                            <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                              {planIndex === 0 ? "Available features" : "Added in this tier"}
                            </p>
                            {addedFeatures.map((feature) => (
                              <div key={feature.key} className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-white px-2.5 py-2 text-[11px] font-medium text-slate-700">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                <span className="truncate">{feature.label}</span>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-medium text-slate-500">
                            No added features in this tier.
                          </p>
                        )}
                        {unavailableFeatures.length > 0 && (
                          <p className="rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2 text-[11px] font-medium text-rose-700">
                            {unavailableFeatures.length} restricted feature{unavailableFeatures.length === 1 ? "" : "s"} for this tier.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-3">
                  {!isPricingConfigured ? (
                    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-center text-xs font-semibold text-amber-700">
                      Configure pricing for this version segment.
                    </div>
                  ) : isFreePlan ? (
                    <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 py-2.5 text-center text-xs font-semibold text-emerald-700">
                      Included by default. No subscription required.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        !isCurrentPlan &&
                        !matchedPendingSub &&
                        handleSelectPlan(plan.id, effectivePrice)
                      }
                      disabled={isCurrentPlan || matchedPendingSub}
                      className={`w-full rounded-lg py-2.5 text-xs font-semibold transition-colors ${
                        isCurrentPlan || matchedPendingSub
                          ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                          : isChosen
                          ? "bg-emerald-600 text-white shadow-sm cursor-pointer"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                      }`}
                    >
                      {isCurrentPlan
                        ? "Active Plan"
                        : matchedPendingSub
                        ? "Awaiting payment"
                        : isChosen
                        ? "Added to Cart"
                        : `Add to Cart (${displayName})`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      ) : activeModule ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
          <p className="text-xs font-medium text-slate-600">
            No version segments are configured for {activeModule} yet.
          </p>
          <p className="text-[11px] text-slate-400">
            Add segments under the platform version configuration to populate these cards.
          </p>
        </div>
      ) : null}
    </div>
  );
}