import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";

interface PageProps {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
}

export default async function PricingPlanPage({ params }: PageProps) {
  const resolvedParams = await params;
  const workspaceId = resolvedParams?.workspaceId;
  const organizationId = resolvedParams?.organizationId;

  const [plans, businessTypes] = await Promise.all([
    listPlans(),
    listBusinessTypes(),
  ]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Settings</p>
          <h1 className="text-2xl font-bold text-slate-900">Pricing & Subscriptions</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Manage your active business modules, review tier limits, and adjust your organization pricing plan.
          </p>
        </div>
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`}
          className="px-4 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-colors"
        >
          View Current Plan
        </Link>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl p-6 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Modules Summary</p>
          <p className="text-sm text-slate-300">Mix and match business modules across tabs and choose tiers tailored to your setup.</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Subscription</p>
            <p className="text-2xl font-bold text-white">₹0 <span className="text-xs font-normal text-slate-400">/ mo</span></p>
          </div>
          <Link
            href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/checkout`}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            Pay Now (0)
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {["Retail Store", "Designer Boutique", "Wholesale Distributor", "Buying House", "Garment Factory / Manufacturer"].map((tab, idx) => (
          <button
            key={tab}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              idx === 0
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Retail Store Module</h2>
            <p className="text-xs text-slate-500 mt-0.5">Configure subscription plan tiers for Retail Store.</p>
          </div>
          <button className="px-4 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors">
            Add Module to Plan
          </button>
        </div>

        <div className="py-12 text-center space-y-2">
          <p className="text-sm font-medium text-slate-700">No database plans created for Retail Store yet.</p>
          <p className="text-xs text-slate-400">Create plans in the platform setup section to populate these cards.</p>
        </div>
      </div>
    </div>
  );
}