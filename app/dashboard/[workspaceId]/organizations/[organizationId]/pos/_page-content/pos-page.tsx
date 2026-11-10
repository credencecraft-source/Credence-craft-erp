import Link from "next/link";
import { Store } from "lucide-react";

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
          <p className="erp-eyebrow">Point of Sale</p>
          <h1 className="erp-page-heading mt-1">POS</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--erp-muted)]">Create counter sales quickly and keep every invoice connected to your organization records.</p>
        </div>

        <Link href={`${base}/quick-invoice`} className="block max-w-xl">
          <Card className="transition hover:border-[var(--erp-brand)] hover:shadow-md">
            <p className="erp-eyebrow">Sales workspace</p>
            <h2 className="erp-card-title mt-2">Quick Invoice</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">Start a fast invoice for walk-in and counter customers.</p>
            <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">Open Quick Invoice -&gt;</span>
          </Card>
        </Link>
        <Link
          href={`${base}/online-store`}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-xl"
        >
          <Card className="transition hover:border-[var(--erp-brand)] hover:shadow-md">
            <p className="erp-eyebrow">Customer checkout</p>
            <h2 className="erp-card-title mt-2 flex items-center gap-2">
              <Store aria-hidden="true" size={20} />
              Online Store
            </h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Browse available POS items, manage a cart, and create a posted sales invoice with a shipping address.
            </p>
            <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">
              Open Online Store in a new tab
            </span>
          </Card>
        </Link>
        <Link href={`${base}/online-store/manage`} className="block max-w-xl">
          <Card className="transition hover:border-[var(--erp-brand)] hover:shadow-md">
            <p className="erp-eyebrow">Store settings</p>
            <h2 className="erp-card-title mt-2">Manage public link</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              Publish, copy, preview, or turn off your customer storefront link.
            </p>
            <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">Manage storefront -&gt;</span>
          </Card>
        </Link>
        <Link href={`${base}/purchase-bill`} className="block max-w-xl">
          <Card className="transition hover:border-[var(--erp-brand)] hover:shadow-md">
            <p className="erp-eyebrow">Purchase workspace</p>
            <h2 className="erp-card-title mt-2">Purchase Bill</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">Enter vendor purchases with size-wise quantities, GST, HSN, and totals.</p>
            <span className="mt-6 inline-block text-sm font-semibold text-[var(--erp-brand)]">Open Purchase Bill -&gt;</span>
          </Card>
        </Link>
      </Section>
    </Page>
  );
}