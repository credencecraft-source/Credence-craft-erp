import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function FinanceTransactionsPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions`;
  const modules = [
    { key: "sales-invoice", label: "Sales Invoice", href: `${base}/sales-invoice` },
    { key: "purchase-invoice", label: "Purchase Invoice", href: `${base}/purchase-invoice` },
    { key: "debit-note", label: "Debit Note", href: `${base}/debit-note` },
    { key: "credit-note", label: "Credit Note", href: `${base}/credit-note` },
    { key: "delivery-challan", label: "Delivery Challan", href: `${base}/delivery-challan` },
  ];

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Transactions</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Finance Transactions</h1>
          <p className="mt-2 text-sm text-slate-600">Create and review finance documents under the transaction module.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <Link key={module.key} href={module.href} className="block">
              <Card className="border-slate-200 transition hover:border-sky-400 hover:shadow-md">
                <h2 className="text-xl font-bold text-slate-900">{module.label}</h2>
                <p className="mt-2 text-sm text-slate-600">Document, vendor, item, GST, tax, and total summary controls.</p>
                <span className="mt-6 inline-block text-sm font-semibold text-sky-700">Open -&gt;</span>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </Page>
  );
}
