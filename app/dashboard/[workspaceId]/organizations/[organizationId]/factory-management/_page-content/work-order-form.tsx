"use client";

import { FormEvent, useEffect, useState } from "react";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";

type SizeAllocation = { id: string; size: string | null; buyerSize: string | null; orderedQty: number; allocatedQty: number; remainingQty: number };
type AllocationResponse = { order: { orderNo: string; styleName: string | null; buyer: string | null; orderQty: number | null }; sizes: SizeAllocation[] };
type RelatedOrder = { id: string; orderNo: string; article: string | null; styleName: string | null; orderQty: number | null };
type ArticleOption = { id: string; label: string };
type WorkOrderMode = "single" | "all";
type WorkOrderReport = { id: string; workOrderNo: string; orderNo: string; article: string | null; styleName: string | null; totalQty: number; status: string; createdAt: string; sizeLines: Array<{ size: string; quantity: number }> };

export default function WorkOrderForm({ organizationId, showReport = true }: { workspaceId: string; organizationId: string; showReport?: boolean }) {
  const [articleNo, setArticleNo] = useState("");
  const [articleOptions, setArticleOptions] = useState<ArticleOption[]>([]);
  const [orderNo, setOrderNo] = useState("");
  const [relatedOrders, setRelatedOrders] = useState<RelatedOrder[]>([]);
  const [mode, setMode] = useState<WorkOrderMode>("single");
  const [allAllocations, setAllAllocations] = useState<AllocationResponse[]>([]);
  const [allQuantities, setAllQuantities] = useState<Record<string, string>>({});
  const [allocation, setAllocation] = useState<AllocationResponse | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [workOrderReports, setWorkOrderReports] = useState<WorkOrderReport[]>([]);

  async function refreshWorkOrderReport() {
    const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setWorkOrderReports(data.workOrders || []);
  }

  useEffect(() => {
    void refreshWorkOrderReport();
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/organizations/${encodeURIComponent(organizationId)}/master-data/article?includeInactive=false&limit=200`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load Article master values.");
        return response.json();
      })
      .then((data: Array<{ id: string; label: string }>) => {
        if (active) setArticleOptions(data.map((option) => ({ id: option.id, label: option.label })).filter((option) => option.label));
      })
      .catch(() => { if (active) setArticleOptions([]); });
    return () => { active = false; };
  }, [organizationId]);

  async function loadArticles(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setAllocation(null); setOrderNo(""); setMode("single"); setAllAllocations([]); setAllQuantities({}); setLoading(true);
    try {
      const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&article=${encodeURIComponent(articleNo)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to find orders for this article.");
      setRelatedOrders(data.orders ?? []);
      if (!data.orders?.length) setError("No orders were found for this article number.");
    } catch (lookupError) { setRelatedOrders([]); setError(lookupError instanceof Error ? lookupError.message : "Unable to find related orders."); } finally { setLoading(false); }
  }

  async function loadAllOrders() {
    setError(""); setMessage(""); setLoading(true);
    try {
      const allocations = await Promise.all(relatedOrders.map(async (order) => {
        const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&orderNo=${encodeURIComponent(order.orderNo)}`, { cache: "no-store" });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || `Unable to load ${order.orderNo}.`);
        return data as AllocationResponse;
      }));
      setAllAllocations(allocations); setMode("all"); setAllocation(null); setOrderNo(""); setAllQuantities({});
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load all related orders."); } finally { setLoading(false); }
  }

  async function loadOrder(selectedOrderNo: string) {
    setError(""); setMessage(""); setOrderNo(selectedOrderNo); if (!selectedOrderNo) { setAllocation(null); return; } setLoading(true);
    try {
      const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&orderNo=${encodeURIComponent(selectedOrderNo)}`, { cache: "no-store" });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load order.");
      setAllocation(data); setQuantities(Object.fromEntries(data.sizes.map((size: SizeAllocation) => [size.id, ""])));
    } catch (loadError) { setAllocation(null); setError(loadError instanceof Error ? loadError.message : "Unable to load order."); } finally { setLoading(false); }
  }

  async function createWorkOrder(event: FormEvent) {
    event.preventDefault(); if (!allocation) return; setError(""); setMessage(""); setLoading(true);
    try {
      const response = await fetch("/api/factory/work-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, orderNo: allocation.order.orderNo, lines: allocation.sizes.map((size) => ({ sourceFinishedGoodsId: size.id, quantity: Number(quantities[size.id] || 0) })) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to create work order.");
      setMessage(`${data.workOrder.work_order_no} created for ${data.workOrder.total_qty.toLocaleString("en-IN")} pieces.`);
      const refresh = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&orderNo=${encodeURIComponent(allocation.order.orderNo)}`, { cache: "no-store" });
      const refreshed = await refresh.json(); setAllocation(refreshed); setQuantities(Object.fromEntries(refreshed.sizes.map((size: SizeAllocation) => [size.id, ""])));
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Unable to create work order."); } finally { setLoading(false); }
  }

  async function createAllWorkOrders(event: FormEvent) {
    event.preventDefault(); setError(""); setMessage(""); setLoading(true);
    try {
      const requests = allAllocations.map((item) => ({ orderNo: item.order.orderNo, lines: item.sizes.map((size) => ({ sourceFinishedGoodsId: size.id, quantity: Number(allQuantities[`${item.order.orderNo}:${size.id}`] || 0) })).filter((line) => line.quantity > 0) })).filter((item) => item.lines.length > 0);
      if (requests.length === 0) throw new Error("Enter a quantity for at least one order and size.");
      for (const request of requests) {
        const response = await fetch("/api/factory/work-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...request }) });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Unable to create all work orders."); }
      }
      setMessage(`${requests.length} work order${requests.length === 1 ? "" : "s"} created successfully.`);
      setAllQuantities({});
      await loadAllOrders();
    } catch (createError) { setError(createError instanceof Error ? createError.message : "Unable to create all work orders."); } finally { setLoading(false); }
  }

  const allSizes = Array.from(new Map(allAllocations.flatMap((item) => item.sizes.map((size) => [size.size || size.buyerSize || "Unspecified", size] as const))).values());

  return <div className="space-y-6">
    {showReport && <Card><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Work Order</p><h2 className="mt-1 text-xl font-bold text-slate-900">Created work orders report</h2><p className="mt-1 text-sm text-slate-600">Review work orders already created for this organization.</p></div><p className="text-sm font-semibold text-slate-600">{workOrderReports.length} record{workOrderReports.length === 1 ? "" : "s"}</p></div>{workOrderReports.length === 0 ? <p className="mt-5 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No work orders created yet.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Work Order</th><th className="px-3 py-3">Order No</th><th className="px-3 py-3">Article</th><th className="px-3 py-3">Size quantities</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{workOrderReports.map((report) => <tr key={report.id}><td className="px-3 py-3 font-semibold text-slate-900">{report.workOrderNo}</td><td className="px-3 py-3 text-slate-700">{report.orderNo}</td><td className="px-3 py-3 text-slate-600">{report.article || "-"}</td><td className="px-3 py-3 text-slate-600">{report.sizeLines.map((line) => `${line.size}: ${line.quantity.toLocaleString("en-IN")}`).join(" | ")}</td><td className="px-3 py-3 font-semibold text-slate-900">{report.totalQty.toLocaleString("en-IN")}</td><td className="px-3 py-3 text-slate-600">{new Date(report.createdAt).toLocaleDateString("en-IN")}</td><td className="px-3 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{report.status}</span></td></tr>)}</tbody></table></div>}</Card>}
    <Card><form onSubmit={loadArticles} className="flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><label htmlFor="article-no" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Article No</label><select id="article-no" value={articleNo} onChange={(event) => { setArticleNo(event.target.value); setRelatedOrders([]); setAllocation(null); setOrderNo(""); setAllAllocations([]); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" required><option value="">Select an article</option>{articleOptions.map((article) => <option key={article.id} value={article.label}>{article.label}</option>)}</select></div><Button type="submit" disabled={loading || !articleNo}>{loading ? "Searching..." : "Find orders"}</Button></form>{relatedOrders.length > 0 && <div className="mt-4 space-y-4"><div className="max-w-xl"><label htmlFor="work-order-scope" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Work Order Creation</label><select id="work-order-scope" value={mode} onChange={(event) => { const nextMode = event.target.value as WorkOrderMode; if (nextMode === "all") void loadAllOrders(); else { setMode("single"); setAllAllocations([]); setAllocation(null); setOrderNo(""); } }} disabled={loading} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="single">Create single work order</option><option value="all">Create work orders for all</option></select></div>{mode === "single" && <div className="max-w-xl"><label htmlFor="related-order-no" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Related Order No</label><select id="related-order-no" value={orderNo} onChange={(event) => void loadOrder(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"><option value="">Select an order</option>{relatedOrders.map((order) => <option key={order.id} value={order.orderNo}>{order.orderNo}{order.styleName ? ` - ${order.styleName}` : ""}{order.orderQty ? ` (${order.orderQty.toLocaleString("en-IN")})` : ""}</option>)}</select></div>}</div>}</Card>
    {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
    {allocation && <form onSubmit={createWorkOrder} className="space-y-6"><Card><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Source order</p><h2 className="mt-1 text-xl font-bold text-slate-900">{allocation.order.orderNo}</h2><p className="mt-1 text-sm text-slate-600">{allocation.order.styleName || "Style not specified"} · {allocation.order.buyer || "Buyer not specified"}</p></div><p className="text-sm text-slate-600">Order qty <span className="font-bold text-slate-900">{(allocation.order.orderQty ?? 0).toLocaleString("en-IN")}</span></p></div></Card><Card><div className="mb-4"><h2 className="text-lg font-bold text-slate-900">Size-wise work order quantity</h2><p className="mt-1 text-sm text-slate-600">Enter a partial quantity now. You can create another work order for the remaining balance.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Size</th><th className="px-3 py-3">Ordered</th><th className="px-3 py-3">Already allocated</th><th className="px-3 py-3">Remaining</th><th className="w-44 px-3 py-3">This work order</th></tr></thead><tbody className="divide-y divide-slate-100">{allocation.sizes.map((size) => <tr key={size.id}><td className="px-3 py-3 font-semibold text-slate-900">{size.size || size.buyerSize || "Unspecified"}</td><td className="px-3 py-3 text-slate-600">{size.orderedQty.toLocaleString("en-IN")}</td><td className="px-3 py-3 text-slate-600">{size.allocatedQty.toLocaleString("en-IN")}</td><td className="px-3 py-3 font-semibold text-emerald-700">{size.remainingQty.toLocaleString("en-IN")}</td><td className="px-3 py-3"><Input aria-label={`Quantity for ${size.size || size.buyerSize || "size"}`} hint={`Already created: ${size.allocatedQty.toLocaleString("en-IN")} - Remaining: ${size.remainingQty.toLocaleString("en-IN")}`} type="number" min="0" max={size.remainingQty} value={quantities[size.id] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [size.id]: event.target.value }))} disabled={size.remainingQty === 0} /></td></tr>)}</tbody></table></div><div className="mt-5 flex justify-end"><Button type="submit" disabled={loading || allocation.sizes.every((size) => !Number(quantities[size.id]))}>{loading ? "Creating..." : "Create work order"}</Button></div></Card></form>}
    {mode === "all" && allAllocations.length > 0 && <form onSubmit={createAllWorkOrders}><Card><div className="mb-4"><h2 className="text-lg font-bold text-slate-900">All orders · size-wise quantity</h2><p className="mt-1 text-sm text-slate-600">Enter quantities in the order columns. Blank cells are skipped.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Size</th>{allAllocations.map((item) => <th key={item.order.orderNo} className="px-3 py-3">{item.order.orderNo}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{allSizes.map((row) => <tr key={row.id}><td className="px-3 py-3 font-semibold text-slate-900">{row.size || row.buyerSize || "Unspecified"}</td>{allAllocations.map((item) => { const size = item.sizes.find((candidate) => (candidate.size || candidate.buyerSize || "Unspecified") === (row.size || row.buyerSize || "Unspecified")); const key = `${item.order.orderNo}:${size?.id || row.id}`; return <td key={item.order.orderNo} className="px-3 py-3"><Input aria-label={`${item.order.orderNo} ${row.size || row.buyerSize || "size"}`} hint={size ? `Already created: ${size.allocatedQty.toLocaleString("en-IN")} - Remaining: ${size.remainingQty.toLocaleString("en-IN")}` : "Size not configured for this order"} type="number" min="0" max={size?.remainingQty ?? 0} value={allQuantities[key] || ""} onChange={(event) => setAllQuantities((current) => ({ ...current, [key]: event.target.value }))} disabled={!size || size.remainingQty === 0} /></td>; })}</tr>)}</tbody></table></div><div className="mt-5 flex justify-end"><Button type="submit" disabled={loading}>{loading ? "Creating..." : "Create work orders for all"}</Button></div></Card></form>}
  </div>;
}