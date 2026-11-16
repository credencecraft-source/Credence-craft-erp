import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function PosSalesPage({
  params,
}: {
  params: Promise<{ workspaceId: string; organizationId: string }>;
}) {
  const { workspaceId, organizationId } = await params;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos/sales`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="erp-eyebrow">Point of Sale</p>
          <h1 className="erp-page-heading mt-1">Sales</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--erp-muted)]">
            Create counter invoices, review posted sales, and process returns.
          </p>
        </div>

        <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link href={`${base}/quick-invoice`} className="block min-w-0">
            <Card className="h-full transition hover:border-[var(--erp-brand)] hover:shadow-md">
              <p className="erp-eyebrow">Counter sale</p>
              <h2 className="erp-card-title mt-2">Quick Invoice</h2>
              <p className="mt-2 text-sm text-[var(--erp-muted)]">
                Create a fast invoice linked to customer and stock records.
              </p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">
                Open Quick Invoice -&gt;
              </span>
            </Card>
          </Link>

          <Link href={`${base}/invoice`} className="block min-w-0">
            <Card className="h-full transition hover:border-[var(--erp-brand)] hover:shadow-md">
              <p className="erp-eyebrow">Sales records</p>
              <h2 className="erp-card-title mt-2">Invoices</h2>
              <p className="mt-2 text-sm text-[var(--erp-muted)]">
                Review and print posted sales invoices.
              </p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">
                Open Invoices -&gt;
              </span>
            </Card>
          </Link>

          <Link href={`${base}/sales-return`} className="block min-w-0">
            <Card className="h-full transition hover:border-[var(--erp-brand)] hover:shadow-md">
              <p className="erp-eyebrow">Sales adjustment</p>
              <h2 className="erp-card-title mt-2">Sales Return</h2>
              <p className="mt-2 text-sm text-[var(--erp-muted)]">
                Find a posted invoice and process a stock-linked return.
              </p>
              <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">
                Open Sales Return -&gt;
              </span>
            </Card>
          </Link>
        </div>
      </Section>
    </Page>
  );
}
