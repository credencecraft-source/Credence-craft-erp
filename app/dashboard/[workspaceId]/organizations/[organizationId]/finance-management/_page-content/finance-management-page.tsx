import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function FinanceManagementPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Finance</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Finance Management</h1>
          <p className="mt-2 text-sm text-slate-600">Manage finance transactions and core accounting entries.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link href={`${base}/transactions`} className="block">
            <Card className="border-slate-200 transition hover:border-sky-400 hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Transactions</p>
              <h2 className="mt-3 text-2xl font-bold text-slate-900">Transactions</h2>
              <p className="mt-2 text-sm text-slate-600">Sales invoice, purchase invoice, credit note, debit note, and delivery challan.</p>
              <span className="mt-6 inline-block text-sm font-semibold text-sky-700">Open -&gt;</span>
            </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
