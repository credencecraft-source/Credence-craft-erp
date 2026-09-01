import Link from "next/link";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Table from "@/components/ui/Table";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";
import { listPlans } from "@/lib/services/platform/plan-service";

export default async function PlatformPlansPage() {
  await ensurePlatformDefaults();
  const plans = await listPlans();

  return (
    <Page className="max-w-5xl">
      <Section className="space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="erp-eyebrow">Platform</p>
            <h1 className="text-2xl font-bold text-slate-900">Plans</h1>
            <p className="text-sm text-slate-600">Subscription plans available to organizations.</p>
          </div>
          <Link href="/platform/plans/create">
            <Button>Create plan</Button>
          </Link>
        </div>

        <Table>
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((plan) => (
              <tr key={plan.id}>
                <td className="px-4 py-3 font-medium text-slate-900">{plan.plan_name}</td>
                <td className="px-4 py-3 text-slate-600">{plan.description || "-"}</td>
                <td className="px-4 py-3 text-slate-600">
                  {plan.price ? `${plan.price.toString()}${plan.billing_cycle ? ` / ${plan.billing_cycle}` : ""}` : "Free"}
                </td>
                <td className="px-4 py-3">
                  <Badge className={plan.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}>
                    {plan.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </Page>
  );
}
