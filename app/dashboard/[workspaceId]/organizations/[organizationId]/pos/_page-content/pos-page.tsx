import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function PosPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Point of Sale</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">POS</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">Create counter sales quickly and keep every invoice connected to your organization records.</p>
        </div>

        <Link href={`${base}/quick-invoice`} className="block max-w-xl">
          <Card className="border-slate-200 transition hover:border-emerald-400 hover:shadow-md">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Sales workspace</p>
            <h2 className="mt-2 text-xl font-bold text-slate-900">Quick Invoice</h2>
            <p className="mt-2 text-sm text-slate-600">Start a fast invoice for walk-in and counter customers.</p>
            <span className="mt-6 inline-block text-sm font-semibold text-emerald-700">Open Quick Invoice -&gt;</span>
          </Card>
        </Link>
      </Section>
    </Page>
  );
}