"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Order = { id: string; purchaseOrderNo: string; status: string; vendor: { name: string }; lines: Array<{ id: string; rawMaterial: string | null; quantity: number | null }> };
type Grn = { receipt_no: string; status: string; warehouse: string };

export default function InventoryReceiptPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; purchaseOrderId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? ""}/organizations/${organizationId}/inventory-management`;
  const [order, setOrder] = useState<Order | null>(null);
  const [grn, setGrn] = useState<Grn | null>(null);
  const [warehouse, setWarehouse] = useState("Main Warehouse");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/orders/purchase-orders/${encodeURIComponent(params?.purchaseOrderId ?? "")}?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" }),
      fetch(`/api/inventory/receipts?organizationId=${encodeURIComponent(organizationId)}&purchaseOrderId=${encodeURIComponent(params?.purchaseOrderId ?? "")}`, { cache: "no-store" }),
    ])
      .then(async ([orderResponse, grnResponse]) => { const orderData = await orderResponse.json(); const grnData = await grnResponse.json(); if (!orderResponse.ok) throw new Error(orderData?.error || "Unable to load Purchase Order."); if (!grnResponse.ok) throw new Error(grnData?.error || "Unable to load GRN."); setOrder(orderData.purchaseOrder); setGrn(grnData.receipt); })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Order."));
  }, [organizationId, params?.purchaseOrderId]);

  const postReceipt = async () => {
    if (!order) return;
    setSaving(true); setError("");
    try {
      const lines = order.lines.map((line) => { const received = Number(quantities[line.id] || 0); return { purchaseOrderLineId: line.id, receivedQuantity: received, acceptedQuantity: received, rejectedQuantity: 0 }; }).filter((line) => line.receivedQuantity > 0);
      const response = await fetch("/api/inventory/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, purchaseOrderId: order.id, warehouse, lines }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to post receipt.");
      router.push(`${basePath}/stock/rm-stock`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to post receipt."); } finally { setSaving(false); }
  };

  return <main className="mx-auto max-w-[1200px] space-y-5"><header className="border-b border-slate-200 pb-4"><p className="erp-eyebrow">Inventory / Inward / GRN</p><h1 className="erp-page-heading mt-1">{grn?.receipt_no ?? "Draft GRN"}</h1><p className="mt-1 text-xs text-slate-500">PO: {order?.purchaseOrderNo ?? "Loading..."} · Vendor: {order?.vendor.name ?? "Loading..."} · GRN status: {grn?.status ?? "DRAFT"}</p></header>{error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}<section className="erp-surface p-4"><label className="block max-w-sm text-xs font-bold text-slate-700">Receiving warehouse<input value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label></section><section className="erp-surface overflow-hidden"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">PO subform</p><h2 className="mt-1 text-sm font-bold text-slate-950">Purchase Order line items</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Raw Material</th><th className="px-3 py-3 text-right">Ordered</th><th className="px-3 py-3 text-right">Receive Now</th></tr></thead><tbody className="divide-y divide-slate-100">{order?.lines.map((line) => <tr key={line.id}><td className="px-3 py-3 font-semibold">{line.rawMaterial ?? "Unclassified material"}</td><td className="px-3 py-3 text-right">{line.quantity ?? 0}</td><td className="px-3 py-3 text-right"><input type="number" min="0" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-right" /></td></tr>)}</tbody></table></div></section><div className="flex justify-between"><Link href={`${basePath}/inward/grn`} className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">Back to GRNs</Link><button type="button" onClick={() => void postReceipt()} disabled={!order || saving} className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{saving ? "Posting..." : "Post GRN"}</button></div></main>;
}