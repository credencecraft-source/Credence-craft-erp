"use client";

import { useState } from "react";
import Link from "next/link";

import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";

interface BusinessType {
  id: string;
  name: string;
}

interface Plan {
  id: string;
  plan_name: string;
  business_type_id: string | null;
  businessType?: BusinessType | null;
  description: string | null;
  price: number | null;
  billing_cycle: string | null;
  is_active: boolean;
}

export default function PlatformSetupPlansPage({
  plans = [],
  businessTypes = [],
}: {
  plans?: Plan[];
  businessTypes?: BusinessType[];
}) {
  const safePlans = Array.isArray(plans) ? plans : [];
  const safeBusinessTypes = Array.isArray(businessTypes) ? businessTypes : [];

  // Map business types by ID for quick lookup
  const businessTypeMap = new Map<string, string>();
  safeBusinessTypes.forEach((bt) => {
    businessTypeMap.set(bt.id, bt.name);
  });

  // Group plans by business type id / name
  const groupedPlans: Record<string, Plan[]> = {};
  safeBusinessTypes.forEach((bt) => {
    groupedPlans[bt.name] = [];
  });
  groupedPlans["General Plans"] = [];

  safePlans.forEach((plan) => {
    let categoryName = "General Plans";
    if (plan.business_type_id && businessTypeMap.has(plan.business_type_id)) {
      categoryName = businessTypeMap.get(plan.business_type_id)!;
    } else if (plan.businessType?.name) {
      categoryName = plan.businessType.name;
    }

    if (!groupedPlans[categoryName]) {
      groupedPlans[categoryName] = [];
    }
    groupedPlans[categoryName].push(plan);
  });

  // Filter out categories with 0 plans if preferred, or keep all available business types as tabs
  const activeCategories = safeBusinessTypes.map((bt) => bt.name);
  if (groupedPlans["General Plans"].length > 0 && !activeCategories.includes("General Plans")) {
    activeCategories.push("General Plans");
  }

  const defaultTab = activeCategories[0] || safeBusinessTypes[0]?.name || "General Plans";
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const currentPlans = groupedPlans[activeTab] || [];

  return (
    <Page className="w-full max-w-none px-4 sm:px-6 py-4">
      <Section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="erp-eyebrow">Platform</p>
            <h1 className="text-xl font-bold text-slate-900">Setup Plans</h1>
            <p className="text-xs text-slate-600">
              Select a business category tab to configure ERP features and module access for each tier.
            </p>
          </div>
          <Link href="/platform/plans/create">
            <span className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors">
              + Create Plan
            </span>
          </Link>
        </div>

        {/* Header Level Tabs from Dynamic Business Types */}
        <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
          {activeCategories.map((category) => {
            const isActive = activeTab === category;
            const count = (groupedPlans[category] || []).length;
            return (
              <button
                key={category}
                onClick={() => setActiveTab(category)}
                className={`relative flex items-center gap-2 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border-b-2 -mb-px ${
                  isActive
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <span>{category}</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${
                  isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Plans Listed Under Active Category */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{activeTab} Plans</h2>
            <span className="text-[11px] text-slate-500">{currentPlans.length} available</span>
          </div>

          {currentPlans.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {currentPlans.map((plan) => {
                return (
                  <Link key={plan.id} href={`/platform/setup-plans/${plan.id}`}>
                    <Card className="h-full transition hover:border-slate-400 hover:shadow-sm p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-bold text-slate-900">{plan.plan_name}</p>
                          <span className="text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {plan.price ? `₹${Number(plan.price).toLocaleString("en-IN")}` : "Free"}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{plan.description || "No description."}</p>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <p className="text-xs font-medium text-slate-600">No plans created for {activeTab} yet.</p>
              <Link href="/platform/plans/create" className="inline-block text-xs font-bold text-emerald-600 hover:underline">
                + Create plan for {activeTab}
              </Link>
            </div>
          )}
        </div>
      </Section>
    </Page>
  );
}