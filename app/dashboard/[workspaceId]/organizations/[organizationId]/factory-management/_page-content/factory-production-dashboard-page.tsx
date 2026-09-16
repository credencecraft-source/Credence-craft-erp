import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function FactoryProductionDashboardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const basePath = `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/dashboard`;
  const dprPath = `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor/dpr`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Production</p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Production Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Monitor work in progress and record daily production activity.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href={`${basePath}/wip`} className="group block">
            <Card className="h-full border-emerald-200 bg-emerald-50/50 transition hover:border-emerald-400 hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Production Tracking</p>
              <h2 className="mt-3 text-2xl font-bold text-slate-900">WIP</h2>
              <p className="mt-2 text-sm text-slate-600">View every work-order process with completed and pending quantities.</p>
              <span className="mt-6 inline-block text-sm font-semibold text-emerald-700 transition-transform group-hover:translate-x-1">Open WIP -&gt;</span>
            </Card>
          </Link>

          <Link href={dprPath} className="group block">
          <Card className="h-full border-slate-200 bg-white transition hover:border-sky-300 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Daily Production</p>
            <h2 className="mt-3 text-2xl font-bold text-slate-900">DPR</h2>
            <p className="mt-2 text-sm text-slate-600">Review department GRNs, operation actuals, billable work, and approve the daily report.</p>
            <span className="mt-6 inline-block text-sm font-semibold text-sky-700 transition-transform group-hover:translate-x-1">Open DPR -&gt;</span>
          </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
