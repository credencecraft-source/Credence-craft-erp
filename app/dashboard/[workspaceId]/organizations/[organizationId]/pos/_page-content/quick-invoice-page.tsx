import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

export default async function QuickInvoicePage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  const base = `/dashboard/${workspaceId}/organizations/${organizationId}/pos`;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <Link href={base} className="text-xs font-semibold text-emerald-700">&larr; POS</Link>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">Quick Invoice</h1>
            <p className="mt-2 text-sm text-slate-600">Build a counter invoice with the minimum number of steps.</p>
          </div>
          <button type="button" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Save Invoice
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <Card className="border-slate-200 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Customer
                <input className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Walk-in customer" />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Invoice date
                <input type="date" className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="mt-6 overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm font-semibold text-slate-700">No items added</p>
              <p className="mt-1 text-xs text-slate-500">Product search and invoice lines will appear here.</p>
            </div>
          </Card>

          <Card className="border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Summary</p>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><span>0.00</span></div>
              <div className="flex justify-between text-slate-600"><span>Tax</span><span>0.00</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900"><span>Total</span><span>0.00</span></div>
            </div>
          </Card>
        </div>
      </Section>
    </Page>
  );
}