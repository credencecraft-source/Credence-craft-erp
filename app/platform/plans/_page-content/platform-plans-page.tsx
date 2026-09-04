import Link from "next/link";
import { redirect } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { listPlans, deletePlan } from "@/lib/services/platform/plan-service";

export default async function PlatformPlansPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const plans = await listPlans();
  const params = (await searchParams) ?? {};

  async function deletePlanAction(formData: FormData) {
    "use server";
    const planId = String(formData.get("planId") || "");
    try {
      if (planId) {
        await deletePlan(planId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete plan.";
      redirect(`/platform/plans?error=${encodeURIComponent(message)}`);
    }
    redirect("/platform/plans");
  }

  return (
    <Page className="max-w-5xl">
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

        {params.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Business Type</th>
              <th className="px-4 py-3">Tier Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {plans.map((plan) => {
              const nameParts = plan.plan_name.split(" - ");
              const businessType = nameParts.length > 1 ? nameParts[0] : "General";
              const tierName = nameParts.length > 1 ? nameParts.slice(1).join(" - ") : plan.plan_name;

              return (
                <tr key={plan.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-bold text-slate-800">
                    <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                      {businessType}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{tierName}</td>
                  <td className="px-4 py-3 text-slate-600">{plan.description || "-"}</td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {plan.price ? `₹${Number(plan.price).toLocaleString("en-IN")}${plan.billing_cycle ? ` / ${plan.billing_cycle}` : ""}` : "Free"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={plan.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
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
      </Section>
    </Page>
  );
}