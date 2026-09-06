import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listSubscriptions, deleteSubscription } from "@/lib/services/platform/subscription-service";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";

interface PageProps {
  params: Promise<{
    workspaceId: string;
    organizationId: string;
  }>;
  searchParams?: Promise<{ error?: string; success?: string }>;
}

export default async function CurrentPlanPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearch = (await searchParams) ?? {};
  const workspaceId = resolvedParams?.workspaceId;
  const organizationId = resolvedParams?.organizationId;

  const [subscriptions, plans, allBusinessTypes] = await Promise.all([
    listSubscriptions(),
    listPlans(),
    listBusinessTypes(),
  ]);

  const redirectBase = `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`;

  async function deleteSubscriptionAction(formData: FormData) {
    "use server";
    const subId = String(formData.get("subId") || "").trim();

    if (!subId) {
      redirect(`${redirectBase}?error=${encodeURIComponent("Invalid subscription ID.")}`);
    }

    try {
      await deleteSubscription(subId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete subscription.";
      redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
    }

    redirect(`${redirectBase}?success=${encodeURIComponent("Subscription deleted successfully.")}`);
  }

  // Filter subscriptions strictly by current organization
  const orgSubscriptions = subscriptions.filter((sub: any) => {
    const subOrg = String(sub.organizationId || sub.organization_id || sub.organization || "").trim();
    return Boolean(organizationId) && subOrg === organizationId;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Settings</p>
          <h1 className="text-2xl font-bold text-slate-900">Current Organization Plan</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Review your active module subscriptions, payment status, and service status.
          </p>
        </div>
        <Link
          href={`/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/plan`}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
        >
          Modify / Change Plan
        </Link>
      </div>

      {resolvedSearch.error && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">{resolvedSearch.error}</p>
      )}
      {resolvedSearch.success && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-700">{resolvedSearch.success}</p>
      )}

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
                <th className="p-3 font-bold">Duration</th>
                <th className="p-3 font-bold">Payment Type</th>
                <th className="p-3 font-bold">Payment Status</th>
                <th className="p-3 font-bold">Subscription / Service Status</th>
                <th className="p-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgSubscriptions.length > 0 ? (
                orgSubscriptions.map((sub: any, idx: number) => {
                  const subBtId = String(sub.businessTypeId || sub.business_type_id || sub.businessType || "").trim();
                  const subPlanId = String(sub.planId || sub.plan_id || sub.plan || "").trim();

                  // Find matching Business Type from database list
                  const matchedBusinessType = allBusinessTypes.find((bt: any) => {
                    const btId = String(bt.id || bt._id || "").trim();
                    return btId === subBtId;
                  });

                  // Find matching Plan from database list
                  const matchedPlan = plans.find((p: any) => {
                    const planId = String(p.id || p._id || "").trim();
                    return planId === subPlanId;
                  });

                  // Display resolved database names instead of raw IDs
                  const businessTypeName =
                    matchedBusinessType?.name ||
                    matchedBusinessType?.title ||
                    sub.business_type_name ||
                    sub.businessTypeName ||
                    "Order Management";

                  const planName =
                    matchedPlan?.plan_name ||
                    matchedPlan?.name ||
                    matchedPlan?.title ||
                    sub.plan_name ||
                    sub.planName ||
                    "—";

                  const rawStartDate = sub.startDate || sub.start_date || "";
                  const rawEndDate = sub.endDate || sub.end_date || sub.expireDate || "";

                  const startDate = rawStartDate ? String(rawStartDate).split("T")[0] : "—";
                  const endDate = rawEndDate ? String(rawEndDate).split("T")[0] : "";

                  const paymentType = sub.paymentType || sub.payment_type || "Offline";
                  const paymentStatus = String(sub.paymentStatus || sub.payment_status || "pending").toLowerCase();

                  const rawStatus = String(
                    sub.status || sub.subscriptionStatus || sub.subscription_status || sub.serviceStatus || sub.service_status || ""
                  ).toLowerCase();

                  const today = new Date().toISOString().split("T")[0];
                  const isDateValid = !endDate || endDate >= today;
                  const isPaid = paymentStatus === "paid";

                  const isActive = rawStatus === "active" || rawStatus === "enabled" || (!rawStatus && isPaid && isDateValid);

                  return (
                    <tr key={sub.id || sub._id || `sub-${idx}`} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800">{businessTypeName}</td>
                      <td className="p-3 font-semibold text-emerald-700">
                        <span className="bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                          {planName}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{startDate} to {endDate || "—"}</td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-700">{paymentType}</span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          paymentStatus === "paid" 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}>
                          {paymentStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isActive 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}>
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {!isActive ? (
                          <form action={deleteSubscriptionAction}>
                            <input type="hidden" name="subId" value={sub.id || sub._id} />
                            <button
                              type="submit"
                              className="px-2 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors text-[10px]"
                            >
                              Delete
                            </button>
                          </form>
                        ) : (
                          <span className="text-slate-400 text-[10px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-500 italic">
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