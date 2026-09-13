"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PurchaseOrder = {
  purchaseOrderNo: string;
  status: string;
  poDate: string;
  deliveryDate: string | null;
  createdAt: string;
  vendor: { name: string };
  total: number;
  lines: Array<{
    masterGroupId: string | null;
    rawMaterial: string | null;
    category: string | null;
    subCategory: string | null;
    quantity: number | null;
    price: number | null;
    gst: number | null;
    hsnCode: string | null;
    total: number | null;
  }>;
};

const number = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-IN") : "To be confirmed";

function HeaderField({ label, value }: { label: string; value: string }) {
  return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span><span className="block rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">{value}</span></label>;
}

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; purchaseOrderId: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState("");
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/order-management/procurement/purchase-order`;

  useEffect(() => {
    fetch(`/api/orders/purchase-orders/${encodeURIComponent(params?.purchaseOrderId ?? "")}?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load Purchase Order.");
        setOrder(data.purchaseOrder);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Order."));
  }, [organizationId, params?.purchaseOrderId]);

  if (error) return <div className="mx-auto max-w-6xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (!order) return <div className="flex min-h-48 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading Purchase Order</div>;

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex items-center gap-3 border-b border-slate-200 pb-4"><button type="button" onClick={() => router.push(basePath)} aria-label="Back to Purchase Orders" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div><p className="erp-eyebrow">Procurement / Purchase Order module</p><h1 className="erp-page-heading mt-1">{order.purchaseOrderNo}</h1><p className="mt-1 text-xs text-slate-500">Purchase Order header and Master Group subform</p></div></header>
    <section className="erp-surface space-y-4 p-5"><div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Main form</p><h2 className="text-sm font-bold text-slate-950">Purchase Order header</h2></div><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">{order.status}</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><HeaderField label="PO number" value={order.purchaseOrderNo} /><HeaderField label="Vendor name" value={order.vendor.name} /><HeaderField label="PO date" value={date(order.poDate)} /><HeaderField label="Delivery date" value={date(order.deliveryDate)} /><HeaderField label="Created date" value={date(order.createdAt)} /><HeaderField label="Grand total" value={number(order.total)} /></div></section>
    <section className="erp-surface overflow-hidden"><div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Subform</p><h2 className="mt-1 text-sm font-bold text-slate-950">Master Group purchase items</h2><p className="mt-1 text-xs text-slate-500">One line is shown for each selected Master Group.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Master Group ID</th><th className="px-4 py-3">Raw material name</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">GST</th><th className="px-4 py-3">HSN code</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{order.lines.map((line, index) => <tr key={`${line.masterGroupId}-${index}`} className="bg-white"><td className="px-4 py-3 font-semibold text-slate-800">{line.masterGroupId ?? "-"}</td><td className="px-4 py-3 font-semibold text-slate-900">{line.rawMaterial ?? "-"}</td><td className="px-4 py-3 text-slate-700">{line.category ?? "-"} / {line.subCategory ?? "-"}</td><td className="px-4 py-3 text-right">{number(line.quantity)}</td><td className="px-4 py-3 text-right">{number(line.price)}</td><td className="px-4 py-3 text-right">{number(line.gst)}</td><td className="px-4 py-3">{line.hsnCode ?? "-"}</td><td className="px-4 py-3 text-right font-bold">{number(line.total)}</td></tr>)}</tbody><tfoot><tr className="border-t-2 border-slate-900"><td colSpan={7} className="px-4 py-4 text-right font-bold">Grand total</td><td className="px-4 py-4 text-right text-base font-bold">{number(order.total)}</td></tr></tfoot></table></div></section>
  </div>;
}
