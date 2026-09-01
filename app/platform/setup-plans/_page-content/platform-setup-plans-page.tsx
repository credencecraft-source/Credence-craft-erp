import Link from "next/link";

import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Card from "@/components/ui/Card";
import { ensurePlatformDefaults } from "@/lib/services/platform/platform-bootstrap-service";
import { listPlans } from "@/lib/services/platform/plan-service";

export default async function PlatformSetupPlansPage() {
  await ensurePlatformDefaults();
  const plans = await listPlans();

  return (
    <Page className="max-w-4xl">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Platform</p>
          <h1 className="text-2xl font-bold text-slate-900">Setup Plans</h1>
          <p className="text-sm text-slate-600">
            Choose a plan to configure which ERP features it includes.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {plans.map((plan) => (
            <Link key={plan.id} href={`/platform/setup-plans/${plan.id}`}>
              <Card className="h-full transition hover:border-emerald-300 hover:shadow-md">
                <p className="text-lg font-semibold text-slate-900">{plan.plan_name}</p>
                <p className="mt-1 text-sm text-slate-600">{plan.description || "No description."}</p>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}
