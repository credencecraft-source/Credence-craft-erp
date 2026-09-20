"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Card from "@/components/ui/Card";
import UiPage from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

type PurchaseOrder = { id: string; purchaseOrderNo: string; status: string; vendor: { name: string }; lines: Array<{ id: string; rawMaterial: string | null; category: string | null; quantity: number | null }> };
type LineQuantity = { accepted: string; rejected: string };

export default function CreateGrnPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const reportPath = `/dashboard/${workspaceId}/organizations/${organizationId}/inventory-management/inward/grn/report`;
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [quantities, setQuantities] = useState<Record<string, LineQuantity>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/orders/purchase-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load Purchase Orders."); setPurchaseOrders((data.purchaseOrders ?? []).filter((order: PurchaseOrder) => ["APPROVED", "SHARED"].includes(order.status))); })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const selectedOrder = purchaseOrders.find((order) => order.id === purchaseOrderId);
  const setLineValue = (lineId: string, field: keyof LineQuantity, value: string) => setQuantities((current) => ({ ...current, [lineId]: { accepted: current[lineId]?.accepted ?? "", rejected: current[lineId]?.rejected ?? "", [field]: value } }));

  async function submit() {
    setError(""); setMessage("");
    if (!selectedOrder || !warehouse.trim()) { setError("Select a Purchase Order and warehouse."); return; }
    const lines = selectedOrder.lines.map((line) => { const accepted = Number(quantities[line.id]?.accepted || 0); const rejected = Number(quantities[line.id]?.rejected || 0); return { purchaseOrderLineId: line.id, receivedQuantity: accepted + rejected, acceptedQuantity: accepted, rejectedQuantity: rejected }; }).filter((line) => line.receivedQuantity > 0);
    if (!lines.length) { setError("Enter an accepted or rejected quantity for at least one line."); return; }
    setSaving(true);
    try { const response = await fetch("/api/inventory/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, purchaseOrderId, warehouse, lines }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to create GRN."); setMessage(`${data.receipt.receipt_no} created successfully.`); setQuantities({}); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Unable to create GRN."); } finally { setSaving(false); }
  }

  return <UiPage as="div"><Section className="space-y-6"><Link href={reportPath} className="text-xs font-semibold text-emerald-700">&larr; RM GRN Report</Link><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Purchase Order Receiving</p><h1 className="mt-2 text-2xl font-bold text-slate-900">Create GRN</h1></div>{error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}{message && <Card className="border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</Card>}<Card className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Select label="Purchase Order" value={purchaseOrderId} onChange={(event) => setPurchaseOrderId(event.target.value)} disabled={loading} options={[{ value: "", label: loading ? "Loading..." : "Select approved Purchase Order" }, ...purchaseOrders.map((order) => ({ value: order.id, label: `${order.purchaseOrderNo} · ${order.vendor.name}` }))]} /><Input label="Warehouse" value={warehouse} onChange={(event) => setWarehouse(event.target.value)} placeholder="Enter warehouse" /></div>{selectedOrder && <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th className="p-3">Raw Material</th><th className="p-3">Category</th><th className="p-3 text-right">Ordered</th><th className="p-3 text-right">Accepted</th><th className="p-3 text-right">Rejected</th></tr></thead><tbody className="divide-y divide-slate-100">{selectedOrder.lines.map((line) => <tr key={line.id}><td className="p-3 font-semibold">{line.rawMaterial || "-"}</td><td className="p-3">{line.category || "-"}</td><td className="p-3 text-right">{Number(line.quantity || 0).toLocaleString("en-IN")}</td><td className="p-3"><Input aria-label={`Accepted quantity for ${line.rawMaterial || line.id}`} type="number" min="0" value={quantities[line.id]?.accepted || ""} onChange={(event) => setLineValue(line.id, "accepted", event.target.value)} className="w-28 rounded px-2 py-1.5 text-right" /></td><td className="p-3"><Input aria-label={`Rejected quantity for ${line.rawMaterial || line.id}`} type="number" min="0" value={quantities[line.id]?.rejected || ""} onChange={(event) => setLineValue(line.id, "rejected", event.target.value)} className="w-28 rounded px-2 py-1.5 text-right" /></td></tr>)}</tbody></table></div>}<div className="flex justify-end"><Button type="button" onClick={() => void submit()} disabled={saving || !selectedOrder}>{saving ? "Creating..." : "Create GRN"}</Button></div></Card></Section></UiPage>;
}
