import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

export default async function NewDeliveryChallanPage({ params }: { params: Promise<{ workspaceId: string; organizationId: string }> }) {
  const { workspaceId, organizationId } = await params;
  return (
    <Page as="div">
      <Section className="space-y-6">
        <Card className="space-y-5">
          <div>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">New Delivery Challan</h1>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Select label="Type" options={[{ value: "General", label: "General" }, { value: "Order Based", label: "Order Based" }, { value: "Auto GRN Based", label: "Auto GRN Based" }]} />
            <Input label="Vendor Name" placeholder="Enter vendor name" />
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
              <Input placeholder="Item" />
              <Input placeholder="Qty" />
              <Input placeholder="GST" />
              <Input placeholder="Total" />
              <Input placeholder="HSN" />
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
