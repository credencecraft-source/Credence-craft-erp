"use client";

import { ArrowLeft, Eye, Loader2, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PurchaseOrder = {
  id: string;
  purchaseOrderNo: string;
  vendor: { name: string; email?: string | null };
  status: string;
  poDate: string;
  deliveryDate: string | null;
  total: number;
};

const number = (value: number | null | undefined) => Number(value ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("en-IN") : "To be confirmed";

export default function PurchaseOrderReportPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [sharingOrder, setSharingOrder] = useState<PurchaseOrder | null>(null);
  const [shareEmail, setShareEmail] = useState("");
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/order-management/procurement`;
  const purchaseOrderPath = `${basePath}/purchase-order`;

  const loadOrders = async () => {
    const response = await fetch(`/api/orders/purchase-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Unable to load Purchase Orders.");
    setOrders((data.purchaseOrders ?? []).map((order: PurchaseOrder) => ({ ...order, status: order.status === "OPEN" ? "DRAFT" : order.status })));
  };

  useEffect(() => {
    loadOrders().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Purchase Orders.")).finally(() => setLoading(false));
  }, [organizationId]);

  const deleteOrder = async (order: PurchaseOrder) => {
    if (!window.confirm(`Delete Purchase Order ${order.purchaseOrderNo}? This action cannot be undone.`)) return;
    setDeletingId(order.id);
    setError("");
    try {
      const response = await fetch(`/api/orders/purchase-orders/${encodeURIComponent(order.id)}?organizationId=${encodeURIComponent(organizationId)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to delete Purchase Order.");
      setOrders((current) => current.filter((item) => item.id !== order.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete Purchase Order.");
    } finally {
      setDeletingId(null);
    }
  };

  const submitForApproval = async (order: PurchaseOrder) => {
    setProcessingId(order.id);
    setError("");
    try {
      const response = await fetch(`/api/orders/purchase-orders/${encodeURIComponent(order.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "submit-approval" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to submit Purchase Order for approval.");
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: "PENDING_APPROVAL" } : item));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit Purchase Order for approval.");
    } finally {
      setProcessingId(null);
    }
  };

  const shareOrder = async () => {
    if (!sharingOrder) return;
    setProcessingId(sharingOrder.id);
    setError("");
    try {
      const response = await fetch(`/api/orders/purchase-orders/${encodeURIComponent(sharingOrder.id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, action: "share-email", email: shareEmail }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to email Purchase Order.");
      setSharingOrder(null);
      setShareEmail("");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "Unable to email Purchase Order.");
    } finally {
      setProcessingId(null);
    }
  };

  return <div className="mx-auto max-w-[1500px] space-y-4">
    <header className="flex items-center gap-3 border-b border-slate-200 pb-4"><button type="button" onClick={() => router.push(basePath)} aria-label="Back to procurement" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div><p className="erp-eyebrow">Procurement</p><h1 className="erp-page-heading mt-1">Purchase Orders</h1><p className="mt-1 text-xs text-slate-500">Header-level Purchase Order register</p></div></header>
    {loading ? <div className="erp-surface flex min-h-48 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-emerald-600" /> Loading Purchase Orders</div> : error ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : orders.length === 0 ? <div className="erp-surface flex min-h-48 items-center justify-center text-xs text-slate-500">No Purchase Orders have been generated.</div> : <div className="erp-surface overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-[9px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">PO number</th><th className="px-3 py-3">Vendor</th><th className="px-3 py-3">PO date</th><th className="px-3 py-3">Delivery date</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Grand total</th><th className="px-3 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map((order) => <tr key={order.id} className="cursor-pointer bg-white hover:bg-emerald-50" onClick={() => router.push(`${purchaseOrderPath}/${encodeURIComponent(order.id)}`)}><td className="px-3 py-3 font-bold text-slate-900">{order.purchaseOrderNo}</td><td className="px-3 py-3 font-semibold">{order.vendor.name}</td><td className="px-3 py-3">{date(order.poDate)}</td><td className="px-3 py-3">{date(order.deliveryDate)}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${order.status === "APPROVED" ? "bg-emerald-100 text-emerald-800" : order.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{order.status}</span></td><td className="px-3 py-3 text-right font-bold">{number(order.total)}</td><td className="px-3 py-3" onClick={(event) => event.stopPropagation()}><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => router.push(`${purchaseOrderPath}/${encodeURIComponent(order.id)}`)} className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:text-emerald-900"><Eye className="h-3.5 w-3.5" /> View</button>{(order.status === "DRAFT" || order.status === "REJECTED") && <button type="button" disabled={processingId === order.id} onClick={() => void submitForApproval(order)} className="rounded-md bg-blue-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-blue-800 disabled:opacity-50">Submit for approval</button>}{order.status === "APPROVED" && <button type="button" disabled={processingId === order.id} onClick={() => { setShareEmail(""); setSharingOrder(order); }} className="rounded-md bg-emerald-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Share</button>}<button type="button" disabled={deletingId === order.id} onClick={() => void deleteOrder(order)} aria-label={`Delete ${order.purchaseOrderNo}`} title="Delete Purchase Order" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">{deletingId === order.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button></div></td></tr>)}</tbody></table></div></div>}
    {sharingOrder && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="share-po-title"><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700">Approved Purchase Order</p><h2 id="share-po-title" className="mt-1 text-lg font-bold text-slate-950">Share {sharingOrder.purchaseOrderNo}</h2><p className="mt-1 text-xs text-slate-500">Send the approved PO to the vendor email address.</p></div><button type="button" onClick={() => setSharingOrder(null)} aria-label="Close share dialog" className="text-slate-400 hover:text-slate-700">×</button></div><label className="mt-5 block text-xs font-bold text-slate-700">Vendor email<input type="email" value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} placeholder="vendor@example.com" className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500" /></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setSharingOrder(null)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button><button type="button" disabled={!shareEmail.trim() || processingId === sharingOrder.id} onClick={() => void shareOrder()} className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{processingId === sharingOrder.id ? "Sending..." : "Send email"}</button></div></div></div>}
  </div>;
}
