"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Order = { id: string; purchaseOrderNo: string; status: string; vendor: { name: string }; lines: Array<{ id: string; rawMaterial: string | null; quantity: number | null }> };

export default function InventoryReceiptPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; purchaseOrderId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? ""}/organizations/${organizationId}/inventory-management`;
  const [order, setOrder] = useState<Order | null>(null);
  const [warehouse, setWarehouse] = useState("Main Warehouse");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/orders/purchase-orders/${encodeURIComponent(params?.purchaseOrderId ?? "")}?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Unable to load Purchase Order."); setOrder(data.purchaseOrder); })
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

  return <main className="mx-auto max-w-[1200px] space-y-5"><header className="border-b border-slate-200 pb-4"><p className="erp-eyebrow">Inventory / Inward</p><h1 className="erp-page-heading mt-1">Receive {order?.purchaseOrderNo ?? "Purchase Order"}</h1><p className="mt-1 text-xs text-slate-500">Vendor: {order?.vendor.name ?? "Loading..."} · Status: {order?.status ?? "Loading..."}</p></header>{error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}<section className="erp-surface p-4"><label className="block max-w-sm text-xs font-bold text-slate-700">Receiving warehouse<input value={warehouse} onChange={(event) => setWarehouse(event.target.value)} className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label></section><section className="erp-surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Raw Material</th><th className="px-3 py-3 text-right">Ordered</th><th className="px-3 py-3 text-right">Receive Now</th></tr></thead><tbody className="divide-y divide-slate-100">{order?.lines.map((line) => <tr key={line.id}><td className="px-3 py-3 font-semibold">{line.rawMaterial ?? "Unclassified material"}</td><td className="px-3 py-3 text-right">{line.quantity ?? 0}</td><td className="px-3 py-3 text-right"><input type="number" min="0" max={line.quantity ?? undefined} value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-right" /></td></tr>)}</tbody></table></div></section><div className="flex justify-between"><Link href={`${basePath}/inward/purchase-order`} className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">Back to inward</Link><button type="button" onClick={() => void postReceipt()} disabled={!order || saving} className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{saving ? "Posting..." : "Post receipt"}</button></div></main>;
}