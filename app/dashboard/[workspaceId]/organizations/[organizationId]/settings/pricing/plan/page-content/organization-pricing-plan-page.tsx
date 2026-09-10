"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

interface Plan {
  id: string;
  plan_name: string;
  description: string | null;
  price: number | null;
  billing_cycle: string | null;
  is_active: boolean;
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
}

interface OrganizationPricingPlanPageProps {
  plans?: Plan[];
  businessTypes?: BusinessType[];
  existingSubscriptions?: Subscription[];
  workspaceId: string;
  organizationId: string;
  activatePlanAction: (formData: FormData) => Promise<void>;
  organizationName?: string;
  workspaceUserEmail?: string;
}

export default function OrganizationPricingPlanPage({
  plans = [],
  businessTypes = [],
  existingSubscriptions = [],
  workspaceId,
  organizationId,
  activatePlanAction,
  organizationName = "",
  workspaceUserEmail = "",
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
    const parts = (plan.plan_name || "").split(" - ");
    const category = parts.length > 1 ? parts[0].trim() : "General";
    if (groupedModules[category]) {
      groupedModules[category].push(plan);
    }
  });

  const initialTab = categories[0] || "Order Management";
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const currentPlans = groupedModules[activeTab] || [];
  const isModuleSelected = Boolean(selections[activeTab]);
  const currentSelectedPlanId = selections[activeTab];

  const matchedBusinessType = safeBusinessTypes.find((bt) => bt.name === activeTab);
  const firstPaidPlan = currentPlans.find(
    (p) => p.price && Number(p.price) > 0
  );

  const handleSelectPlan = (planId: string, planPrice: number | null) => {
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
    setSelections((prev) => {
      const copy = { ...prev };
      delete copy[activeTab];
      return copy;
    });
  };

  const handleProceedToCheckout = () => {
    const params = new URLSearchParams();
    Object.entries(selections).forEach(([category, planId]) => {
      params.append(category, planId);
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
          <button
            onClick={() =>
              router.push(
                `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`
              )
            }
            className="px-4 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors cursor-pointer"
          >
            View Current Plan
          </button>
        </div>
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

      {activeTab && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {activeTab} Module
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure subscription plan tiers for {activeTab}.
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
      )}

      {currentPlans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 pb-12">
          {currentPlans.map((plan) => {
            const nameParts = (plan.plan_name || "").split(" - ");
            const tierName =
              nameParts.length > 1
                ? nameParts.slice(1).join(" - ")
                : plan.plan_name;

            const isChosen =
              isModuleSelected && currentSelectedPlanId === plan.id;

            const isFreePlan = !plan.price || Number(plan.price) === 0;

            const matchedActiveSub = existingSubscriptions.some(
              (sub) =>
                sub.planId === plan.id &&
                sub.businessTypeId === matchedBusinessType?.id &&
                sub.paymentStatus === "paid"
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
                        {tierName}
                      </h3>

                      {matchedActiveSub && (
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-full uppercase tracking-wider">
                          Current Plan
                        </span>
                      )}
                    </div>

                    <div className="text-xl font-extrabold text-slate-900 mt-2">
                      {plan.price
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
                    <p className="text-xs font-semibold text-emerald-600 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100 text-center">
                      ERP Module Access Enabled
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-2 pt-4 border-t border-slate-100">
                  {isFreePlan ? (
                    <form action={activatePlanAction}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input
                        type="hidden"
                        name="businessTypeId"
                        value={matchedBusinessType?.id || ""}
                      />
                      <input
                        type="hidden"
                        name="organizationName"
                        value={organizationName}
                      />
                      <input
                        type="hidden"
                        name="workspaceUserEmail"
                        value={workspaceUserEmail}
                      />

                      <button
                        type="submit"
                        disabled={matchedActiveSub}
                        className={`w-full rounded-lg py-2.5 text-xs font-semibold shadow-sm transition-colors ${
                          matchedActiveSub
                            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                            : "bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                        }`}
                      >
                        {matchedActiveSub ? "Current Plan Active" : "Activate"}
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        !matchedActiveSub &&
                        handleSelectPlan(plan.id, plan.price)
                      }
                      disabled={matchedActiveSub}
                      className={`w-full rounded-lg py-2.5 text-xs font-semibold transition-colors ${
                        matchedActiveSub
                          ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                          : isChosen
                          ? "bg-emerald-600 text-white shadow-sm cursor-pointer"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
                      }`}
                    >
                      {matchedActiveSub
                        ? "Current Plan Active"
                        : isChosen
                        ? "Added to Cart"
                        : `Add to Cart (${tierName})`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
          <p className="text-xs font-medium text-slate-600">
            No database plans created for {activeTab} yet.
          </p>
          <p className="text-[11px] text-slate-400">
            Create plans in the platform setup section to populate these cards.
          </p>
        </div>
      )}
    </div>
  );
}