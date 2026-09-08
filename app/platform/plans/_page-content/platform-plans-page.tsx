import Link from "next/link";
import { redirect } from "next/navigation";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { listPlans } from "@/lib/services/platform/plan-service";
import { listSubscriptions } from "@/lib/services/platform/subscription-service";
import { prisma } from "@/lib/database/prisma-client";

interface PageProps {
  searchParams?: Promise<{ error?: string; success?: string; editPlanId?: string }>;
}

async function deletePlanAction(formData: FormData) {
  "use server";
  const planId = String(formData.get("planId") || "").trim();

  if (!planId) {
    redirect("/platform/plans?error=" + encodeURIComponent("Invalid plan ID."));
  }

  try {
    const subscriptions = await listSubscriptions();
    const activeSubsCount = subscriptions.filter((sub: any) => {
      const matchPlan = sub.planId === planId || sub.plan_id === planId;
      const status = sub.status || sub.serviceStatus || sub.service_status;
      return matchPlan && status === "active";
    }).length;

    if (activeSubsCount >= 1) {
      redirect(`/platform/plans?error=` + encodeURIComponent("Cannot delete this plan because it has active subscriptions."));
    }

    try {
      await prisma.plan_restrictions.deleteMany({
        where: { plan_id: planId },
      });
    } catch {}

    try {
      await prisma.subscription.deleteMany({
        where: { plan_id: planId },
      });
    } catch {
      try {
        await prisma.subscription.deleteMany({
          where: { plan_id: planId },
        });
      } catch {}
    }

    try {
      if ((prisma as any).plans?.delete) {
        await (prisma as any).plans.delete({ where: { id: planId } });
      } else {
        throw new Error();
      }
    } catch {
      await prisma.$executeRawUnsafe(`DELETE FROM plans WHERE id = $1`, planId);
    }
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Unable to delete plan.";
    redirect(`/platform/plans?error=${encodeURIComponent(message)}`);
  }

  redirect("/platform/plans?success=" + encodeURIComponent("Plan deleted successfully."));
}

async function updatePlanAction(formData: FormData) {
  "use server";
  const planId = String(formData.get("planId") || "").trim();
  const planName = String(formData.get("planName") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const price = parseFloat(String(formData.get("price") || "0"));
  const billingCycle = String(formData.get("billingCycle") || "month").trim();
  const isActive = formData.get("isActive") === "on";

  if (!planId || !planName) {
    redirect(`/platform/plans?editPlanId=${planId}&error=` + encodeURIComponent("Plan name is required."));
  }

  try {
    let updated = false;
    try {
      if ((prisma as any).plans?.update) {
        await (prisma as any).plans.update({
          where: { id: planId },
          data: {
            plan_name: planName,
            description: description || null,
            price: isNaN(price) ? 0 : price,
            billing_cycle: billingCycle,
            is_active: isActive,
          },
        });
        updated = true;
      }
    } catch {}

    if (!updated) {
      await prisma.$executeRawUnsafe(
        `UPDATE plans SET plan_name = $1, description = $2, price = $3, billing_cycle = $4, is_active = $5 WHERE id = $6`,
        planName,
        description || null,
        isNaN(price) ? 0 : price,
        billingCycle,
        isActive,
        planId
      );
    }
  } catch (error: any) {
    redirect(`/platform/plans?editPlanId=${planId}&error=` + encodeURIComponent(error.message || "Failed to update plan details."));
  }

  redirect("/platform/plans?success=" + encodeURIComponent("Plan updated successfully."));
}

export default async function PlatformPlansPage({ searchParams }: PageProps) {
  const plans = await listPlans();
  const subscriptions = await listSubscriptions();
  const params = (await searchParams) ?? {};
  const editingPlanId = params.editPlanId;
  const editingPlan = editingPlanId ? plans.find((p: any) => p.id === editingPlanId) : null;

  return (
    <Page className="max-w-6xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="erp-eyebrow">Platform</p>
            <h1 className="text-2xl font-bold text-slate-900">Plans</h1>
            <p className="text-sm text-slate-600">Subscription plans available categorized by business modules.</p>
          </div>
          <Link href="/platform/plans/create">
            <Button>Create plan</Button>
          </Link>
        </div>

        {params.error && !editingPlan && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        {params.success && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {params.success}
          </p>
        )}

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Business Type</th>
              <th className="px-4 py-3">Plan ID</th>
              <th className="px-4 py-3">Tier Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {plans.map((plan: any) => {
              const nameParts = plan.plan_name.split(" - ");
              const businessType = nameParts.length > 1 ? nameParts[0] : "General";
              const tierName = nameParts.length > 1 ? nameParts.slice(1).join(" - ") : plan.plan_name;

              const activeSubsCount = subscriptions.filter((sub: any) => {
                const matchPlan = sub.planId === plan.id || sub.plan_id === plan.id;
                const status = sub.status || sub.serviceStatus || sub.service_status;
                return matchPlan && status === "active";
              }).length;

              return (
                <tr key={plan.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-slate-800">
                    <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                      {businessType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600">{plan.id}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{tierName}</td>
                  <td className="px-4 py-3 text-slate-600">{plan.description || "-"}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {plan.price !== null && plan.price !== undefined && Number(plan.price) > 0 ? `₹${Number(plan.price).toLocaleString("en-IN")}${plan.billing_cycle ? ` / ${plan.billing_cycle}` : ""}` : "Free"}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold">
                      {activeSubsCount}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={plan.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Link
                      href={`/platform/plans?editPlanId=${plan.id}`}
                      className="px-2.5 py-1 text-xs font-semibold text-sky-600 bg-sky-50 hover:bg-sky-100 rounded border border-sky-200 transition-colors inline-block"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/platform/plans/${plan.id}/restrictions`}
                      className="px-2.5 py-1 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors inline-block"
                    >
                      Restrictions
                    </Link>
                    <form action={deletePlanAction} className="inline">
                      <input type="hidden" name="planId" value={plan.id} />
                      <button
                        type="submit"
                        className="px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded border border-rose-200 transition-colors cursor-pointer"
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        {editingPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-6 border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Edit Plan Details</h3>
                  <p className="text-xs text-slate-500">Update plan name, description, and pricing.</p>
                </div>
                <Link 
                  href="/platform/plans"
                  className="text-slate-400 hover:text-slate-600 font-bold text-sm"
                >
                  ✕
                </Link>
              </div>

              {params.error && (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {params.error}
                </p>
              )}

              <form action={updatePlanAction} className="space-y-4 text-xs">
                <input type="hidden" name="planId" value={(editingPlan as any).id} />

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Plan Name</label>
                  <input 
                    type="text" 
                    name="planName" 
                    defaultValue={(editingPlan as any).plan_name} 
                    required 
                    className="w-full border rounded-lg px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Description</label>
                  <textarea 
                    name="description" 
                    defaultValue={(editingPlan as any).description || ""} 
                    rows={2}
                    className="w-full border rounded-lg px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Price (₹)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      name="price" 
                      defaultValue={(editingPlan as any).price ?? 0} 
                      className="w-full border rounded-lg px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Billing Cycle</label>
                    <select 
                      name="billingCycle" 
                      defaultValue={(editingPlan as any).billing_cycle || "month"} 
                      className="w-full border rounded-lg px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                    >
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                      <option value="quarter">Quarter</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input 
                    type="checkbox" 
                    name="isActive" 
                    id="isActive" 
                    defaultChecked={(editingPlan as any).is_active} 
                    className="w-4 h-4 text-sky-600 rounded border-slate-300"
                  />
                  <label htmlFor="isActive" className="font-semibold text-slate-700">Active Plan</label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Link 
                    href="/platform/plans"
                    className="px-4 py-2 border rounded-lg font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </Link>
                  <button 
                    type="submit" 
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-lg shadow-sm"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Section>
    </Page>
  );
}