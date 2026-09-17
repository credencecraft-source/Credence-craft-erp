"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type InventoryStage = "purchase-order" | "packing-list-grn" | "wo-grn" | "returnable-dc-grn" | "raw-material-dc" | "rm-stock" | "fg-stock";

type PurchaseOrder = {
  id: string;
  purchaseOrderNo: string;
  vendor: { name: string };
  status: string;
  deliveryDate: string | null;
  total: number;
  lines: Array<{ rawMaterial: string | null; quantity: number | null; total: number | null }>;
};

type StockRow = { id: string; raw_material?: string; style_name?: string; size?: string | null; warehouse: string; quantity_on_hand: number | string; quantity_reserved: number | string; quantity_issued: number | string };

const stageDetails: Record<InventoryStage, { eyebrow: string; title: string; description: string; next?: { label: string; path: string } }> = {
  "purchase-order": {
    eyebrow: "Inventory / Inward",
    title: "RM GRN",
    description: "Receive approved Purchase Orders into inventory with traceable line quantities and pending receipt balances.",
    next: { label: "Open Raw Material DC", path: "../outward/raw-material-dc" },
  },
  "packing-list-grn": {
    eyebrow: "Inventory / Inward",
    title: "Packing List GRN",
    description: "Register incoming packing-list materials with document-level traceability and organization-scoped receiving controls.",
  },
  "wo-grn": {
    eyebrow: "Inventory / Inward",
    title: "WO GRN",
    description: "Register work-order receipts against the organization inventory ledger with a dedicated document flow.",
  },
  "returnable-dc-grn": {
    eyebrow: "Inventory / Inward",
    title: "Returnable DC GRN",
    description: "Register returnable delivery challan receipts separately from raw-material receiving for auditable inward control.",
  },
  "raw-material-dc": {
    eyebrow: "Inventory / Outward",
    title: "Raw Material Delivery Challans",
    description: "Record raw material issues and transfers with source document, destination, quantity, and acknowledgement status.",
    next: { label: "View RM Stock", path: "../../stock/rm-stock" },
  },
  "rm-stock": {
    eyebrow: "Inventory / Stock",
    title: "RM Stock",
    description: "Monitor raw material on-hand, reserved, issued, and available quantities by item and warehouse.",
    next: { label: "View FG Stock", path: "../fg-stock" },
  },
  "fg-stock": {
    eyebrow: "Inventory / Stock",
    title: "FG Stock",
    description: "Monitor finished-goods receipts, allocations, dispatches, and available stock by style, size, and order.",
  },
};

export default function InventoryStagePage({ stage }: { stage: InventoryStage }) {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? ""}/organizations/${organizationId}/inventory-management`;
  const details = stageDetails[stage];
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(stage === "purchase-order" || (stage.endsWith("stock") && stage !== "fg-stock"));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!organizationId) return;
    if (stage.endsWith("stock") && stage !== "fg-stock") {
      fetch(`/api/inventory/stock?organizationId=${encodeURIComponent(organizationId)}&type=RM`, { cache: "no-store" })
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Unable to load stock."); setStock(data.stock ?? []); })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load stock."))
        .finally(() => setLoading(false));
      return;
    }
    if (stage !== "purchase-order") return;
    fetch(`/api/orders/purchase-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Unable to load Purchase Orders.");
        setPurchaseOrders(data.purchaseOrders ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders."))
      .finally(() => setLoading(false));
  }, [organizationId, stage]);

  const metrics = useMemo(() => ({
    documents: purchaseOrders.length,
    approved: purchaseOrders.filter((order) => order.status === "APPROVED").length,
    lines: purchaseOrders.reduce((total, order) => total + order.lines.length, 0),
  }), [purchaseOrders]);

  return (
    <main className="mx-auto max-w-[1500px] space-y-5">
      {stage === "fg-stock" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Carton Box", href: `${basePath}/stock/fg-stock/carton-box` },
            { label: "SKU", href: `${basePath}/stock/fg-stock/sku` },
            { label: "Tags", href: `${basePath}/stock/fg-stock/tags` },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="erp-surface block p-6 transition hover:border-emerald-400 hover:shadow-md">
              <h2 className="text-lg font-bold text-slate-950">{card.label}</h2>
            </Link>
          ))}
        </div>
      ) : null}

      {stage !== "fg-stock" ? (
        <>
      <header className="border-b border-slate-200 pb-4">
        <p className="erp-eyebrow">{details.eyebrow}</p>
        <h1 className="erp-page-heading mt-1">{details.title}</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">{details.description}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Documents", stage === "purchase-order" ? metrics.documents : "0"],
          ["Approved / Available", stage === "purchase-order" ? metrics.approved : "0"],
          ["Traceable Lines", stage === "purchase-order" ? metrics.lines : "0"],
        ].map(([label, value]) => (
          <section key={label} className="erp-surface p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
          </section>
        ))}
      </div>

      {details.next ? (
        <Link href={`${basePath}/${details.next.path}`} className="inline-flex rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">
          {details.next.label} →
        </Link>
      ) : null}

      {stage === "purchase-order" ? (
        loading ? <div className="erp-surface p-8 text-center text-xs text-slate-500">Loading GRNs...</div> :
          error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> :
            <div className="erp-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    <tr><th className="px-3 py-3">PO No.</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3">Lines</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseOrders.map((order) => (
                      <tr key={order.id} className="bg-white hover:bg-emerald-50">
                        <td className="px-3 py-3 font-bold text-slate-900">{order.purchaseOrderNo}</td>
                        <td className="px-3 py-3">{order.vendor.name}</td>
                        <td className="px-3 py-3">{order.lines.length}</td>
                        <td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold">{order.status}</span></td>
                        <td className="px-3 py-3 text-right"><Link className="font-bold text-emerald-700 hover:underline" href={`${basePath}/inward/grn/${order.id}`}>Open receipt</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {purchaseOrders.length === 0 ? <p className="p-8 text-center text-xs text-slate-500">No GRNs are available for inward processing.</p> : null}
            </div>
      ) : stage.endsWith("stock") ? (
        loading ? <div className="erp-surface p-8 text-center text-xs text-slate-500">Loading stock...</div> : error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> :
          <div className="erp-surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Raw Material</th><th className="px-3 py-3">Size</th><th className="px-3 py-3">Warehouse</th><th className="px-3 py-3 text-right">On Hand</th><th className="px-3 py-3 text-right">Reserved</th><th className="px-3 py-3 text-right">Available</th></tr></thead><tbody className="divide-y divide-slate-100">{stock.map((row) => { const onHand = Number(row.quantity_on_hand); const reserved = Number(row.quantity_reserved); return <tr key={row.id} className="bg-white"><td className="px-3 py-3 font-semibold text-slate-900">{row.raw_material ?? row.style_name}</td><td className="px-3 py-3">{row.size ?? "-"}</td><td className="px-3 py-3">{row.warehouse}</td><td className="px-3 py-3 text-right">{onHand.toLocaleString("en-IN")}</td><td className="px-3 py-3 text-right">{reserved.toLocaleString("en-IN")}</td><td className="px-3 py-3 text-right font-bold text-emerald-700">{(onHand - reserved).toLocaleString("en-IN")}</td></tr>; })}</tbody></table></div>{stock.length === 0 ? <p className="p-8 text-center text-xs text-slate-500">No stock has been posted for this ledger yet.</p> : null}</div>
      ) : (
        <section className="erp-surface p-8">
          <p className="text-sm font-semibold text-slate-900">{details.title} workspace ready</p>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-500">This document flow is organization-scoped and ready for its source-document fields, line items, approvals, and posting controls.</p>
        </section>
      )}
        </>
      ) : null}
    </main>
  );
}