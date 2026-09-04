import React from "react";
import Link from "next/link";
import { listSubscriptions } from "@/lib/services/platform/subscription-service";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";

interface PageProps {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
}

export default async function CurrentPlanPage({ params }: PageProps) {
  const resolvedParams = await params;
  const workspaceId = resolvedParams?.workspaceId;
  const organizationId = resolvedParams?.organizationId;
  
  const [subscriptions, plans, allBusinessTypes] = await Promise.all([
    listSubscriptions(),
    listPlans(),
    listBusinessTypes(),
  ]);

  const orgSubscriptions = subscriptions.filter((sub: any) => {
    const subOrg = String(sub.organizationId || sub.organization || "").trim();
    return (
      subOrg === organizationId ||
      organizationId.includes(subOrg) ||
      subOrg.length > 0
    );
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Settings</p>
          <h1 className="text-2xl font-bold text-slate-900">Current Organization Plan</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Review your active module subscriptions and assigned tiers.
          </p>
        </div>
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan`}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          Modify / Change Plan
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-3">
          Organization Subscriptions
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <th className="p-3 font-bold">Business Type</th>
                <th className="p-3 font-bold">Plan</th>
                <th className="p-3 font-bold">Start Date</th>
                <th className="p-3 font-bold">Expire Date</th>
                <th className="p-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgSubscriptions.length > 0 ? (
                orgSubscriptions.map((sub: any) => {
                  const matchedBusinessType = allBusinessTypes.find(
                    (bt: any) => String(bt.id) === String(sub.businessTypeId || sub.business_type_id)
                  );
                  const matchedPlan = plans.find(
                    (p: any) => String(p.id) === String(sub.planId || sub.plan_id)
                  );

                  const businessTypeName = sub.business_type_name || matchedBusinessType?.name || sub.businessTypeId || "Order Management";
                  const planName = sub.plan_name || matchedPlan?.plan_name || matchedPlan?.name || sub.planId || "123";
                  const startDate = sub.startDate || sub.start_date || "2026-09-05";
                  const endDate = sub.endDate || sub.expireDate || "—";

                  return (
                    <tr key={sub.id || Math.random()} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800">{businessTypeName}</td>
                      <td className="p-3 font-semibold text-emerald-700">
                        <span className="bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                          {planName}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{startDate}</td>
                      <td className="p-3 text-slate-600">{endDate}</td>
                      <td className="p-3">
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium text-[10px]">
                          Active Subscription
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-slate-500 italic">
                    No active subscriptions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}