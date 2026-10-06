import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/lib/auth/session-manager";
import { getOrganizationForUser, requireOrganizationAccess } from "@/lib/services/organizations/organization-service";
import { isSubscriptionActiveAt, listSubscriptions, deleteSubscription, subscriptionMatchesPricingMode } from "@/lib/services/platform/subscription-service";
import { listBusinessTypes } from "@/lib/services/platform/business-type-service";
import FormSubmitButton from "@/components/ui/FormSubmitButton";

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
  const user = await requireSessionUser();
  if (user.workspace_id !== workspaceId) redirect(`/dashboard/${user.workspace_id}/home`);
  const organization = await getOrganizationForUser(user.id, organizationId);

  if (!organization) {
    redirect(`/dashboard/${workspaceId}/home`);
  }

  const [allBusinessTypes, subscriptions] = await Promise.all([
    listBusinessTypes(),
    listSubscriptions(organization.id),
  ]);
  const businessTypeById = new Map(allBusinessTypes.map((businessType) => [businessType.id, businessType]));
  const activeSubscriptionIds = new Set(
    subscriptions
      .filter((subscription) =>
        subscriptionMatchesPricingMode(subscription, organization.pricing_mode)
        && isSubscriptionActiveAt(subscription, subscription.plan),
      )
      .map(({ id }) => id),
  );
  const orgSubscriptions = subscriptions.map((subscription) => ({
    ...subscription,
    planId: subscription.plan_id,
    businessTypeId: subscription.business_type_id,
    plan_name: subscription.plan_name,
    business_type_name: subscription.plan.tier_key === "USER_BASED" && !subscription.business_type_id
      ? "Per-user pricing"
      : businessTypeById.get(subscription.business_type_id ?? "")?.name ?? "—",
    isCurrentPlan: activeSubscriptionIds.has(subscription.id),
  }));

  const redirectBase = `/dashboard/${workspaceId}/organizations/${organizationId}/settings/pricing/current-plan`;

  async function deleteSubscriptionAction(formData: FormData) {
    "use server";
    const actionUser = await requireSessionUser();
    if (actionUser.workspace_id !== workspaceId) redirect(`/dashboard/${actionUser.workspace_id}/home`);
    const actionOrganization = await getOrganizationForUser(actionUser.id, organizationId);

    if (!actionOrganization) {
      redirect(`/dashboard/${workspaceId}/home`);
    }
    await requireOrganizationAccess(actionUser.id, actionOrganization.organization_id, ["OWNER", "ADMIN"]);

    const subId = String(formData.get("subId") || "").trim();

    if (!subId) {
      redirect(`${redirectBase}?error=${encodeURIComponent("Invalid subscription ID.")}`);
    }

    try {
      const organizationSubscriptions = await listSubscriptions(actionOrganization.id);
      if (!organizationSubscriptions.some((subscription) => subscription.id === subId)) {
        redirect(`${redirectBase}?success=${encodeURIComponent("Subscription was already deleted.")}`);
      }
      const result = await deleteSubscription(subId, undefined, actionOrganization.id, actionUser.id);
      if (!result.deleted) {
        redirect(`${redirectBase}?success=${encodeURIComponent("Subscription was already deleted.")}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete subscription.";
      redirect(`${redirectBase}?error=${encodeURIComponent(message)}`);
    }

    redirect(`${redirectBase}?success=${encodeURIComponent("Subscription deleted successfully.")}`);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Settings</p>
          <h1 className="text-2xl font-bold text-slate-900">Current Organization Plan</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Review your active plan or per-user subscription, payment status, and expiry dates.
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
                <th className="p-3 font-bold">Billable Users</th>
                <th className="p-3 font-bold">Plan</th>
                <th className="p-3 font-bold">Start Date</th>
                <th className="p-3 font-bold">End Date</th>
                <th className="p-3 font-bold">Term</th>
                <th className="p-3 font-bold">Amount</th>
                <th className="p-3 font-bold">Payment Type</th>
                <th className="p-3 font-bold">Payment Status</th>
                <th className="p-3 font-bold">Subscription / Service Status</th>
                <th className="p-3 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgSubscriptions.length > 0 ? (
                orgSubscriptions.map((sub) => {
                  const planName = sub.plan_name;
                  const businessTypeName = sub.business_type_name;
                  const startDate = sub.start_date ? String(sub.start_date).split("T")[0] : "—";
                  const endDate = sub.end_date ? String(sub.end_date).split("T")[0] : "";
                  const paymentType = "Offline";
                  const paymentStatus = String(sub.payment_status || "pending").toLowerCase();
                  const serviceStatus = String(sub.service_status || "inactive").toLowerCase();
                  const isActive = activeSubscriptionIds.has(String(sub.id));
                  const paymentLabel = paymentStatus === "pending" ? "Awaiting payment" : paymentStatus;
                  const serviceLabel = isActive ? "Active" : paymentStatus === "pending" ? "Awaiting approval" : sub.isScheduled ? "Scheduled" : sub.isExpired ? "Expired" : serviceStatus;
                  const isCurrentPlan = Boolean(sub.isCurrentPlan);

                  return (
                    <tr key={sub.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-800">
                        <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                          {businessTypeName}
                        </span>
                      </td>
                      <td className="p-3 tabular-nums">{sub.billed_user_count ?? "—"}</td>
                      <td className="p-3 font-semibold text-emerald-700">
                        <span className="bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                          {planName}
                        </span>
                        {isCurrentPlan && (
                          <span className="ml-2 inline-block rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                            Current Plan
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600">{startDate}</td>
                      <td className="p-3 text-slate-600">{endDate || "—"}</td>
                      <td className="p-3 text-slate-600">{sub.billing_months ? `${sub.billing_months} months` : "—"}</td>
                      <td className="p-3 text-slate-600">{sub.total_amount != null ? `₹${Number(sub.total_amount).toLocaleString("en-IN")}` : "—"}</td>
                      <td className="p-3">
                        <span className="font-semibold text-slate-700">{paymentType}</span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          paymentStatus === "paid"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}>
                          {paymentLabel}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isActive 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}>
                          {serviceLabel}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {paymentStatus === "pending" ? (
                          <form action={deleteSubscriptionAction}>
                            <input type="hidden" name="subId" value={sub.id} />
                            <FormSubmitButton
                              variant="danger"
                              size="sm"
                              pendingLabel="Deleting..."
                              className="px-2 py-1 rounded bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors text-[10px]"
                            >
                              Delete
                            </FormSubmitButton>
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
                  <td colSpan={11} className="p-6 text-center text-slate-500 italic">
                    No paid subscription requests found.
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