import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function SalesInvoicePage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions`;
  const createPath = `${base}/sales-invoice/new`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Link href={base} className="text-xs font-semibold text-sky-700">&larr; Transactions</Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Sales Invoice</h1>
          </div>
          <Link href={createPath} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">
            Create New
          </Link>
        </div>

        <Card className="border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Report</p>
              <h2 className="mt-2 text-xl font-bold text-slate-900">Sales Invoice Report</h2>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No sales invoice records found.
          </div>
        </Card>
      </Section>
    </Page>
  );
}
