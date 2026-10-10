"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

type Order = { id: string; purchaseOrderNo: string; status: string; entityId: string | null; entityName: string | null; vendor: { name: string }; lines: Array<{ id: string; rawMaterial: string | null; quantity: number | null }> };
type Grn = { receipt_no: string; status: string };
type LocationOption = { id: string; label: string };

export default function InventoryReceiptPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; purchaseOrderId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? ""}/organizations/${organizationId}/inventory-management`;
  const [order, setOrder] = useState<Order | null>(null);
  const [grn, setGrn] = useState<Grn | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [locationsLoaded, setLocationsLoaded] = useState(false);
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

  useEffect(() => {
    if (!order?.entityId) return;

    const controller = new AbortController();
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/location?entityId=${encodeURIComponent(order.entityId)}&includeInactive=false`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load Locations.");
        setLocations(Array.isArray(data) ? data.map((location: { id: string; label: string }) => ({ id: location.id, label: location.label })) : []);
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Unable to load Locations.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLocationsLoaded(true);
      });

    return () => controller.abort();
  }, [organizationId, order?.entityId]);

  const postReceipt = async () => {
    if (!order?.entityId || !locationId) {
      setError("Select an active Entity and Location on the Purchase Order before receiving.");
      return;
    }
    setSaving(true); setError("");
    try {
      const lines = order.lines.map((line) => { const received = Number(quantities[line.id] || 0); return { purchaseOrderLineId: line.id, receivedQuantity: received, acceptedQuantity: received, rejectedQuantity: 0 }; }).filter((line) => line.receivedQuantity > 0);
      if (lines.length === 0) throw new Error("Enter a receive quantity for at least one line.");
      const response = await fetch("/api/inventory/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, purchaseOrderId: order.id, locationId, lines }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to post receipt.");
      router.push(`${basePath}/stock/rm-stock`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to post receipt."); } finally { setSaving(false); }
  };

  return (
    <main className="mx-auto max-w-[1200px] space-y-5">
      <header className="border-b border-slate-200 pb-4">
        <p className="erp-eyebrow">Inventory / Inward / GRN</p>
        <h1 className="erp-page-heading mt-1">{grn?.receipt_no ?? "Draft GRN"}</h1>
        <p className="mt-1 text-xs text-slate-500">PO: {order?.purchaseOrderNo ?? "Loading..."} - Vendor: {order?.vendor.name ?? "Loading..."} - GRN status: {grn?.status ?? "DRAFT"}</p>
      </header>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="erp-surface p-4">
        <Select
          label="Location"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          disabled={!order?.entityId || !locationsLoaded || locations.length === 0}
          options={[
            { value: "", label: !order ? "Loading Purchase Order..." : !order.entityId ? "Purchase Order has no active Entity" : !locationsLoaded ? "Loading Locations..." : locations.length === 0 ? "No active Locations for this Entity" : "Select Location" },
            ...locations.map((location) => ({ value: location.id, label: location.label })),
          ]}
        />
      </section>
      <section className="erp-surface overflow-hidden">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">PO subform</p>
          <h2 className="mt-1 text-sm font-bold text-slate-950">Purchase Order line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-3">Raw Material</th><th className="px-3 py-3 text-right">Ordered</th><th className="px-3 py-3 text-right">Receive Now</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order?.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-3 font-semibold">{line.rawMaterial ?? "Unclassified material"}</td>
                  <td className="px-3 py-3 text-right">{line.quantity ?? 0}</td>
                  <td className="px-3 py-3 text-right"><Input aria-label={`Receive quantity for ${line.rawMaterial ?? line.id}`} type="number" min="0" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-right" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex justify-between">
        <Link href={`${basePath}/inward/grn`} className="rounded-md border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700">Back to GRNs</Link>
        <Button type="button" onClick={() => void postReceipt()} disabled={!order?.entityId || !locationId || saving}>{saving ? "Posting..." : "Post GRN"}</Button>
      </div>
    </main>
  );
}