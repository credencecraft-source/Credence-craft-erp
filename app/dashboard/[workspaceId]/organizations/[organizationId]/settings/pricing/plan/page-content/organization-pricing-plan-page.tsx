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
  version_name?: string | null;
  description: string | null;
  price: number | null;
  billing_cycle: string | null;
  is_active: boolean;
  max_order_qty?: number | null;
}

interface FeatureSummary {
  key: string;
  label: string;
  path: string;
  available: boolean;
}

interface BusinessType {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
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

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const currentPlans = activeTab ? groupedModules[activeTab] || [] : [];
  const isModuleSelected = activeTab ? Boolean(selections[activeTab]) : false;
  const currentSelectedPlanId = activeTab ? selections[activeTab] : undefined;

  const matchedBusinessType = activeTab ? safeBusinessTypes.find((bt) => bt.name === activeTab) : undefined;
  const firstPaidPlan = currentPlans.find(
    (p) => p.price && Number(p.price) > 0
  );

  const handleSelectPlan = (planId: string, planPrice: number | null) => {
    if (!activeTab) return;
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
      [activeTab]: planId,
    }));
  };

  const handleDeselectModule = () => {
    if (!activeTab) return;
    setSelections((prev) => {
      const copy = { ...prev };
      delete copy[activeTab];
      return copy;
    });
  };

  const handleProceedToCheckout = () => {
    const params = new URLSearchParams();
    Object.values(selections).forEach((segmentPlanId) => {
      const plan = safePlans.find((item) => item.id === segmentPlanId);
      if (plan?.billing_plan_id) params.append("planId", plan.billing_plan_id);
    });
    router.push(
      `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/checkout?${params.toString()}`
    );
  };

  const totalPrice = Object.entries(selections).reduce(
    (sum, [category, planId]) => {
      const catPlans = groupedModules[category] || [];
      const matchedPlan = catPlans.find((p) => p.id === planId);
      return sum + (matchedPlan?.price ? Number(matchedPlan.price) : 0);
    },
    0
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-36">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="erp-eyebrow">Settings</p>
          <h1 className="text-2xl font-bold text-slate-900">
            Pricing & Subscriptions
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Manage your active business modules, review tier limits, and adjust your organization pricing plan.
          </p>
        </div>
        <div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => router.back()} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
              Back
            </button>
            <button type="button" onClick={() => router.push(`/dashboard/${workspaceId}/home`)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
              Dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
            >
              View Current Plan
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Assigned pricing version</p><p className="mt-1 text-sm font-bold text-slate-900">{platformVersionName || "Default platform version"}</p></div>
        <p className="text-xs text-slate-600">Plans and segment restrictions are evaluated against this version.</p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Active Modules Summary
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Mix and match business modules across tabs and choose tiers tailored to your setup.
          </p>
        </div>

        <div className="bg-slate-900 text-white px-5 py-3 rounded-xl flex items-center gap-4 shadow-sm">
          <div>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">
              Total Subscription
            </span>
            <div className="text-2xl font-black text-emerald-400">
              ₹{totalPrice.toLocaleString("en-IN")}{" "}
              <span className="text-xs font-normal text-slate-300">/ mo</span>
            </div>
          </div>

          <button
            onClick={handleProceedToCheckout}
            disabled={Object.keys(selections).length === 0}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Pay Now ({Object.keys(selections).length})
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-4">
        {categories.map((category) => {
          const active = activeTab === category;
          const hasSelection = Boolean(selections[category]);

          return (
            <button
              key={category}
              onClick={() => setActiveTab(category)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
                active
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{category}</span>
              {hasSelection && (
                <span
                  className={`h-2 w-2 rounded-full ${
                    active ? "bg-white" : "bg-emerald-500"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {activeTab ? (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {activeTab} Module
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Version segments and their live pricing for {activeTab}.
            </p>
          </div>

          <div>
            {isModuleSelected ? (
              <button
                onClick={handleDeselectModule}
                className="px-4 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
              >
                Remove From Cart
              </button>
            ) : (
              <button
                onClick={() =>
                  firstPaidPlan &&
                  handleSelectPlan(firstPaidPlan.id, firstPaidPlan.price)
                }
                disabled={!firstPaidPlan}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Add to Cart
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/50 px-6 py-10 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Choose a master module</p>
          <h2 className="mt-2 text-lg font-bold text-slate-900">Select a module to view plans</h2>
          <p className="mt-1 max-w-md text-sm text-slate-600">Choose a business module above to compare its prices, order quantity limits, and feature access.</p>
        </div>
      )}

      {activeTab && currentPlans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-12">
          {currentPlans.map((plan) => {
            const nameParts = (plan.plan_name || "").split(" - ");
            const tierName =
              nameParts.length > 1
                ? nameParts.slice(1).join(" - ")
                : plan.plan_name;
            const displayName = plan.segment_name || tierName;

            const isChosen =
              isModuleSelected && currentSelectedPlanId === plan.id;

            const isPricingConfigured = plan.is_pricing_configured === true && Boolean(plan.billing_plan_id);
            const isFreePlan = isPricingConfigured && (!plan.price || Number(plan.price) === 0);
            const isCurrentPlan = currentPlanIds[matchedBusinessType?.id || ""] === plan.id;
            const featureList = planFeatures[plan.id] || [];
            const linkedModule = matchedBusinessType ? getErpModuleForBusinessTypeName(matchedBusinessType.name) : null;
            const visibleFeatureList = featureList.filter((feature) => linkedModule && (feature.path === linkedModule.pathSegment || feature.path.startsWith(`${linkedModule.pathSegment}/`)));
            const availableFeatureCount = visibleFeatureList.filter((feature) => feature.available).length;

            const matchedPendingSub = existingSubscriptions.some(
              (sub) =>
                sub.planId === plan.id &&
                sub.businessTypeId === matchedBusinessType?.id &&
                sub.paymentStatus === "pending"
            );

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl border p-6 flex flex-col justify-between shadow-sm relative transition-all ${
                  isChosen
                    ? "border-emerald-600 ring-2 ring-emerald-500 shadow-md"
                    : "border-slate-200"
                }`}
              >
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-800">
                        {displayName}
                      </h3>

                      {isCurrentPlan && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full uppercase tracking-wider">
                          Current Plan
                        </span>
                      )}
                      {!isCurrentPlan && matchedPendingSub && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-full uppercase tracking-wider">
                          Awaiting payment
                        </span>
                      )}
                    </div>

                    <div className="text-xl font-extrabold text-slate-900 mt-2">
                      {!isPricingConfigured
                        ? "Pricing not configured"
                        : plan.price
                        ? `₹${Number(plan.price).toLocaleString("en-IN")} / mo`
                        : "Free"}
                    </div>
                  </div>

                  <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                    <p className="line-clamp-3 text-slate-600">
                      {plan.description || "No specific details provided."}
                    </p>
                  </div>

                  <div className="border-t border-slate-100 pt-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Feature access</p>
                        <span className="text-[10px] font-bold text-slate-500">{availableFeatureCount}/{visibleFeatureList.length} available</span>
                      </div>
                      {plan.max_order_qty != null && <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-xs font-semibold text-blue-800">Order quantity: up to {plan.max_order_qty.toLocaleString("en-IN")}</p>}
                      {plan.max_order_qty == null && <p className="mt-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-800">Order quantity: Unlimited</p>}
                      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                        {visibleFeatureList.map((feature) => (
                          <div key={feature.key} className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] ${feature.available ? "bg-white text-slate-700" : "bg-rose-50 text-rose-700"}`}>
                            <span className="truncate">{feature.label}</span>
                            <span className="shrink-0 font-bold">{feature.available ? "Available" : "Not available"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-2 pt-4 border-t border-slate-100">
                  {!isPricingConfigured ? (
                    <div className="w-full rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-center text-xs font-semibold text-amber-700">
                      Configure a billing plan for this version segment.
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
                        handleSelectPlan(plan.id, plan.price)
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
                        ? "Current Plan Active"
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
      ) : activeTab ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
          <p className="text-xs font-medium text-slate-600">
            No version segments are configured for {activeTab} yet.
          </p>
          <p className="text-[11px] text-slate-400">
            Add segments under the platform version configuration to populate these cards.
          </p>
        </div>
      ) : null}
    </div>
  );
}