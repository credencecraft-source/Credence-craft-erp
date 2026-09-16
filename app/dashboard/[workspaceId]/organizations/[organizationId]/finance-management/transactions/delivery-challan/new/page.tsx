import Link from "next/link";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function NewDeliveryChallanPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/finance-management/transactions/delivery-challan`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Link href={base} className="text-xs font-semibold text-sky-700">&larr; Delivery Challan</Link>
        <Card className="space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Create</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">New Delivery Challan</h1>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Type<select className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"><option>General</option><option>Order Based</option><option>Auto GRN Based</option></select></label>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Vendor Name<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800" placeholder="Enter vendor name" /></label>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-700">Line Items</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-5 text-xs font-semibold text-slate-600">
              <span>Item</span>
              <span>Qty</span>
              <span>GST</span>
              <span>Total</span>
              <span>HSN</span>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-5 text-sm text-slate-800">
              <input className="rounded-lg border border-slate-300 px-2 py-2" placeholder="Item" />
              <input className="rounded-lg border border-slate-300 px-2 py-2" placeholder="Qty" />
              <input className="rounded-lg border border-slate-300 px-2 py-2" placeholder="GST" />
              <input className="rounded-lg border border-slate-300 px-2 py-2" placeholder="Total" />
              <input className="rounded-lg border border-slate-300 px-2 py-2" placeholder="HSN" />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <div className="flex items-center justify-between"><span>Grand Total</span><strong className="text-lg text-slate-900">₹0.00</strong></div>
          </div>
        </Card>
      </Section>
    </Page>
  );
}
