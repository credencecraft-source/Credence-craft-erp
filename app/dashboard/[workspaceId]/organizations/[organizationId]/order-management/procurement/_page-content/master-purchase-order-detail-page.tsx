"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { MasterPurchaseOrder } from "./style-wise-purchase-order-page";

export default function MasterPurchaseOrderDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; masterPurchaseOrderId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const masterPurchaseOrderId = params?.masterPurchaseOrderId ?? "";
  const createPoPath = `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/procurement/create-po/style-wise/create-po`;
  const [master, setMaster] = useState<MasterPurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadMaster = useCallback(async () => {
    const response = await fetch(`/api/orders/procurement?organizationId=${encodeURIComponent(organizationId)}&view=create`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load Master Group.");
    const result = (data.masterPurchaseOrders ?? []).find((item: MasterPurchaseOrder) => item.id === masterPurchaseOrderId) ?? null;
    if (!result) throw new Error("Master Group not found.");
    setMaster(result);
  }, [masterPurchaseOrderId, organizationId]);

  useEffect(() => {
    loadMaster().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Master Group.")).finally(() => setLoading(false));
  }, [loadMaster]);

  return <div className="mx-auto max-w-[1500px] space-y-4"><header className="flex items-center gap-3 border-b border-slate-200 pb-4"><button type="button" onClick={() => router.push(createPoPath)} aria-label="Back to Master Groups" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div><p className="erp-eyebrow">Style Wise PO / Create PO</p><h1 className="erp-page-heading mt-1">Master Group report</h1><p className="mt-1 text-sm text-slate-500">Review the grouped raw-material lines before creating the purchase order.</p></div></header>{loading ? <div className="erp-surface flex min-h-52 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading Master Group</div> : error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : master ? <MasterReport master={master} /> : null}</div>;
}

function MasterReport({ master }: { master: MasterPurchaseOrder }) {
  const groupingHeaders = [...master.lines.reduce((groups, line) => {
    const key = line.sourceGroupedPoNo ?? line.id;
    const current = groups.get(key) ?? { groupedPoNo: line.sourceGroupedPoNo ?? "-", rawMaterial: line.rawMaterial ?? master.rawMaterial ?? "-", quantity: 0, price: line.vendorPrice ?? 0, total: 0 };
    current.quantity += Number(line.groupedQty ?? 0);
    current.total += Number(line.totalSpend ?? (Number(line.groupedQty ?? 0) * Number(line.vendorPrice ?? 0)));
    if (current.price === 0 && line.vendorPrice !== null) current.price = line.vendorPrice;
    groups.set(key, current);
    return groups;
  }, new Map<string, { groupedPoNo: string; rawMaterial: string; quantity: number; price: number; total: number }>()).values()];

  return <div className="space-y-4"><div className="erp-surface p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Master Group" value={master.masterPoNo} /><Summary label="Vendor" value={master.vendor.name} /><Summary label="Raw material" value={master.rawMaterial ?? "-"} /><Summary label="Price" value={master.price || "-"} /><Summary label="Total Qty" value={formatNumber(master.totalGroupedQty)} /><Summary label="Buying UOM" value={master.buyingUom || "-"} /><Summary label="GST" value={master.gst || "-"} /><Summary label="HSN Code" value={master.hsnCode || "-"} /><Summary label="Total" value={formatNumber(master.total)} /></div></div><div className="erp-surface overflow-hidden"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h2 className="text-sm font-bold text-slate-950">Master Group subform</h2><p className="mt-1 text-xs text-slate-500">{groupingHeaders.length} grouped form headers</p></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-slate-200 bg-white text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Grouped PO</th><th className="px-3 py-3">Raw material</th><th className="px-3 py-3 text-right">Total Qty</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{groupingHeaders.map((header) => <tr key={header.groupedPoNo}><td className="px-3 py-3 font-semibold">{header.groupedPoNo}</td><td className="px-3 py-3 font-semibold">{header.rawMaterial}</td><td className="px-3 py-3 text-right">{formatNumber(header.quantity)}</td><td className="px-3 py-3 text-right">{formatNumber(header.price)}</td><td className="px-3 py-3 text-right font-bold">{formatNumber(header.total)}</td></tr>)}</tbody></table></div></div></div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-sm font-bold text-slate-950">{value}</p></div>;
}

function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}