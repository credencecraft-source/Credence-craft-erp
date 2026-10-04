"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
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
  const [relatedOrdersNextCursor, setRelatedOrdersNextCursor] = useState<string | null>(null);
  const [mode, setMode] = useState<WorkOrderMode>("single");
  const [allAllocations, setAllAllocations] = useState<AllocationResponse[]>([]);
  const [allQuantities, setAllQuantities] = useState<Record<string, string>>({});
  const [selectedOrderNos, setSelectedOrderNos] = useState<string[]>([]);
  const [allocationNextCursor, setAllocationNextCursor] = useState<string | null>(null);
  const [allocation, setAllocation] = useState<AllocationResponse | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [workOrderReports, setWorkOrderReports] = useState<WorkOrderReport[]>([]);
  const [reportNextCursor, setReportNextCursor] = useState<string | null>(null);
  const [loadingMoreReports, setLoadingMoreReports] = useState(false);
  const orderLookupSequence = useRef(0);

  async function refreshWorkOrderReport() {
    const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&limit=100`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Work orders were saved, but the report could not be refreshed.");
    setWorkOrderReports(data.workOrders || []);
    setReportNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
  }

  async function loadMoreReports() {
    if (!reportNextCursor || loadingMoreReports) return;
    setLoadingMoreReports(true);
    try {
      const query = new URLSearchParams({ organizationId, limit: "100", cursor: reportNextCursor });
      const response = await fetch(`/api/factory/work-orders?${query.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load more work orders.");
      setWorkOrderReports((current) => [...current, ...(Array.isArray(data.workOrders) ? data.workOrders : [])]);
      setReportNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more work orders.");
    } finally {
      setLoadingMoreReports(false);
    }
  }

  useEffect(() => {
    void refreshWorkOrderReport().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load work orders.");
    });
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
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load Article master values.");
      });
    return () => { active = false; };
  }, [organizationId]);

  async function loadArticles(event: FormEvent) {
    event.preventDefault();
    const requestSequence = ++orderLookupSequence.current;
    setError("");
    setMessage("");
    setAllocation(null);
    setOrderNo("");
    setMode("single");
    setAllAllocations([]);
    setAllQuantities({});
    setLoading(true);
    try {
      const query = new URLSearchParams({ organizationId, article: articleNo, limit: "50" });
      const response = await fetch(`/api/factory/work-orders?${query.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to find orders for this article.");
      if (requestSequence === orderLookupSequence.current) {
        setRelatedOrders(data.orders ?? []);
        setRelatedOrdersNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
        if (!data.orders?.length) setError("No orders were found for this article number.");
      }
    } catch (lookupError) {
      if (requestSequence === orderLookupSequence.current) {
        setRelatedOrders([]);
        setRelatedOrdersNextCursor(null);
        setError(lookupError instanceof Error ? lookupError.message : "Unable to find related orders.");
      }
    } finally {
      if (requestSequence === orderLookupSequence.current) setLoading(false);
    }
  }

  async function loadMoreRelatedOrders() {
    if (!relatedOrdersNextCursor || loading) return;
    const requestSequence = orderLookupSequence.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, article: articleNo, limit: "50", cursor: relatedOrdersNextCursor });
      const response = await fetch(`/api/factory/work-orders?${query.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load more matching orders.");
      if (requestSequence === orderLookupSequence.current) {
        setRelatedOrders((current) => [...current, ...(Array.isArray(data.orders) ? data.orders : [])]);
        setRelatedOrdersNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      }
    } catch (loadError) {
      if (requestSequence === orderLookupSequence.current) setError(loadError instanceof Error ? loadError.message : "Unable to load more matching orders.");
    } finally {
      if (requestSequence === orderLookupSequence.current) setLoading(false);
    }
  }

  async function loadAllOrders(preserveMessage = false) {
    const requestSequence = ++orderLookupSequence.current;
    if (!preserveMessage) {
      setError("");
      setMessage("");
    }
    setLoading(true);
    try {
      const query = new URLSearchParams({ organizationId, articleAllocations: articleNo, limit: "50" });
      const response = await fetch(`/api/factory/work-orders?${query.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load allocations for this article.");
      if (requestSequence === orderLookupSequence.current) {
        setAllAllocations(data.allocations as AllocationResponse[]);
        setAllocationNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
        setSelectedOrderNos((data.allocations as AllocationResponse[]).map((item) => item.order.orderNo));
        setMode("all");
        setAllocation(null);
        setOrderNo("");
        setAllQuantities({});
      }
    } catch (loadError) {
      if (requestSequence === orderLookupSequence.current) setError(loadError instanceof Error ? loadError.message : "Unable to load all related orders.");
    } finally {
      if (requestSequence === orderLookupSequence.current) setLoading(false);
    }
  }

  async function loadMoreAllocations() {
    if (!allocationNextCursor || loading) return;
    const requestSequence = orderLookupSequence.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, articleAllocations: articleNo, limit: "50", cursor: allocationNextCursor });
      const response = await fetch(`/api/factory/work-orders?${query.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load more order allocations.");
      const page = Array.isArray(data.allocations) ? data.allocations as AllocationResponse[] : [];
      if (requestSequence === orderLookupSequence.current) {
        setAllAllocations((current) => [...current, ...page]);
        setAllocationNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      }
    } catch (loadError) {
      if (requestSequence === orderLookupSequence.current) setError(loadError instanceof Error ? loadError.message : "Unable to load more order allocations.");
    } finally {
      if (requestSequence === orderLookupSequence.current) setLoading(false);
    }
  }

  async function loadOrder(selectedOrderNo: string) {
    const requestSequence = ++orderLookupSequence.current;
    setError("");
    setMessage("");
    setOrderNo(selectedOrderNo);
    setAllocation(null);
    if (!selectedOrderNo) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&orderNo=${encodeURIComponent(selectedOrderNo)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load order.");
      if (requestSequence === orderLookupSequence.current) {
        setAllocation(data);
        setQuantities(Object.fromEntries(data.sizes.map((size: SizeAllocation) => [size.id, ""])));
      }
    } catch (loadError) {
      if (requestSequence === orderLookupSequence.current) setError(loadError instanceof Error ? loadError.message : "Unable to load order.");
    } finally {
      if (requestSequence === orderLookupSequence.current) setLoading(false);
    }
  }

  async function createWorkOrder(event: FormEvent) {
    event.preventDefault();
    if (!allocation) return;
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const response = await fetch("/api/factory/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          orderNo: allocation.order.orderNo,
          lines: allocation.sizes.map((size) => ({ sourceFinishedGoodsId: size.id, quantity: Number(quantities[size.id] || 0) })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to create work order.");
      setMessage(`${data.workOrder.work_order_no} created for ${data.workOrder.total_qty.toLocaleString("en-IN")} pieces.`);
      setQuantities(Object.fromEntries(allocation.sizes.map((size) => [size.id, ""])));
      const refresh = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&orderNo=${encodeURIComponent(allocation.order.orderNo)}`, { cache: "no-store" });
      const refreshed = await refresh.json();
      if (!refresh.ok) throw new Error(refreshed.error || "Work order was created, but its allocation view could not be refreshed.");
      setAllocation(refreshed);
      await refreshWorkOrderReport();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create work order.");
    } finally {
      setLoading(false);
    }
  }

  async function createAllWorkOrders(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      if (selectedOrderNos.length === 0) throw new Error("Select at least one order.");
      if (selectedOrderNos.length > 50) throw new Error("Select no more than 50 orders in one atomic batch.");
      const selectedOrders = new Set(selectedOrderNos);
      const requests = allAllocations
        .filter((item) => selectedOrders.has(item.order.orderNo))
        .map((item) => ({
          orderNo: item.order.orderNo,
          lines: item.sizes
            .map((size) => ({ sourceFinishedGoodsId: size.id, quantity: Number(allQuantities[`${item.order.orderNo}:${size.id}`] || 0) }))
            .filter((line) => line.quantity > 0),
        }))
        .filter((item) => item.lines.length > 0);
      if (requests.length === 0) throw new Error("Enter a quantity for at least one order and size.");
      const response = await fetch("/api/factory/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, requests }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No work orders were created. Review the quantities and try again.");
      setMessage(`${requests.length} work order${requests.length === 1 ? "" : "s"} created successfully.`);
      setAllQuantities({});
      await refreshWorkOrderReport();
      await loadAllOrders(true);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create all work orders.");
    } finally {
      setLoading(false);
    }
  }

  const selectedAllocations = allAllocations.filter((item) => selectedOrderNos.includes(item.order.orderNo));
  const allEntries = selectedAllocations.flatMap((item) => item.sizes.map((size) => ({
    key: `${item.order.orderNo}:${size.id}`,
    orderNo: item.order.orderNo,
    styleName: item.order.styleName,
    size,
  })));

  return (
    <div className="space-y-6">
      {showReport && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Work Order</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Created work orders report</h2>
              <p className="mt-1 text-sm text-slate-600">Review work orders already created for this organization.</p>
            </div>
            <p className="text-sm font-semibold text-slate-600">{workOrderReports.length}{reportNextCursor ? "+" : ""} records loaded</p>
          </div>
          {workOrderReports.length === 0 ? (
            <p className="mt-5 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">No work orders created yet.</p>
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-3">Work Order</th><th className="px-3 py-3">Order No</th><th className="px-3 py-3">Article</th><th className="px-3 py-3">Size quantities</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Created</th><th className="px-3 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workOrderReports.map((report) => (
                    <tr key={report.id}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{report.workOrderNo}</td>
                      <td className="px-3 py-3 text-slate-700">{report.orderNo}</td>
                      <td className="px-3 py-3 text-slate-600">{report.article || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{report.sizeLines.map((line) => `${line.size}: ${line.quantity.toLocaleString("en-IN")}`).join(" | ")}</td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{report.totalQty.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3 text-slate-600">{new Date(report.createdAt).toLocaleDateString("en-IN")}</td>
                      <td className="px-3 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{report.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {reportNextCursor && <div className="mt-4 flex justify-center"><Button type="button" onClick={() => void loadMoreReports()} disabled={loadingMoreReports}>{loadingMoreReports ? "Loading..." : "Load more work orders"}</Button></div>}
        </Card>
      )}

      <Card>
        <form onSubmit={loadArticles} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="article-no" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Article No</label>
            <select
              id="article-no"
              value={articleNo}
              onChange={(event) => {
                orderLookupSequence.current += 1;
                setLoading(false);
                setArticleNo(event.target.value);
                setRelatedOrders([]);
                setRelatedOrdersNextCursor(null);
                setAllocation(null);
                setOrderNo("");
                setAllAllocations([]);
                setAllQuantities({});
                setSelectedOrderNos([]);
                setAllocationNextCursor(null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              required
            >
              <option value="">Select an article</option>
              {articleOptions.map((article) => <option key={article.id} value={article.label}>{article.label}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={loading || !articleNo}>{loading ? "Searching..." : "Find orders"}</Button>
        </form>
        {relatedOrders.length > 0 && (
          <div className="mt-4 space-y-4">
            <div className="max-w-xl">
              <label htmlFor="work-order-scope" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Work Order Creation</label>
              <select
                id="work-order-scope"
                value={mode}
                onChange={(event) => {
                  const nextMode = event.target.value as WorkOrderMode;
                  if (nextMode === "all") void loadAllOrders();
                  else {
                    orderLookupSequence.current += 1;
                    setMode("single");
                    setAllAllocations([]);
                    setAllocation(null);
                    setOrderNo("");
                  }
                }}
                disabled={loading}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="single">Create single work order</option>
                <option value="all">Create work orders for all</option>
              </select>
            </div>
            {mode === "single" && (
              <div className="max-w-xl">
                <label htmlFor="related-order-no" className="block text-xs font-semibold uppercase tracking-wide text-slate-600">Related Order No</label>
                <select
                  id="related-order-no"
                  value={orderNo}
                  onChange={(event) => void loadOrder(event.target.value)}
                  disabled={loading}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Select an order</option>
                  {relatedOrders.map((order) => <option key={order.id} value={order.orderNo}>{order.orderNo}{order.styleName ? ` - ${order.styleName}` : ""}{order.orderQty ? ` (${order.orderQty.toLocaleString("en-IN")})` : ""}</option>)}
                </select>
                {relatedOrdersNextCursor && <Button type="button" className="mt-2" onClick={() => void loadMoreRelatedOrders()} disabled={loading}>{loading ? "Loading..." : "Load more matching orders"}</Button>}
              </div>
            )}
          </div>
        )}
      </Card>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}

      {allocation && (
        <form onSubmit={createWorkOrder} className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Source order</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{allocation.order.orderNo}</h2>
                <p className="mt-1 text-sm text-slate-600">{allocation.order.styleName || "Style not specified"} · {allocation.order.buyer || "Buyer not specified"}</p>
              </div>
              <p className="text-sm text-slate-600">Order qty <span className="font-bold text-slate-900">{(allocation.order.orderQty ?? 0).toLocaleString("en-IN")}</span></p>
            </div>
          </Card>
          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Size-wise work order quantity</h2>
              <p className="mt-1 text-sm text-slate-600">Enter a partial quantity now. You can create another work order for the remaining balance.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-3">Size</th><th className="px-3 py-3">Ordered</th><th className="px-3 py-3">Already allocated</th><th className="px-3 py-3">Remaining</th><th className="w-44 px-3 py-3">This work order</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocation.sizes.map((size) => (
                    <tr key={size.id}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{size.size || size.buyerSize || "Unspecified"}{size.size && size.buyerSize && size.size !== size.buyerSize ? ` (${size.buyerSize})` : ""}</td>
                      <td className="px-3 py-3 text-slate-600">{size.orderedQty.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3 text-slate-600">{size.allocatedQty.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3 font-semibold text-emerald-700">{size.remainingQty.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3"><Input aria-label={`Quantity for ${size.size || size.buyerSize || "size"}`} type="number" min="0" max={size.remainingQty} value={quantities[size.id] || ""} onChange={(event) => setQuantities((current) => ({ ...current, [size.id]: event.target.value }))} disabled={loading || size.remainingQty === 0} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end"><Button type="submit" disabled={loading || allocation.sizes.every((size) => !Number(quantities[size.id]))}>{loading ? "Creating..." : "Create work order"}</Button></div>
          </Card>
        </form>
      )}

      {mode === "all" && allAllocations.length > 0 && (
        <form onSubmit={createAllWorkOrders}>
          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Work orders by order and size</h2>
              <p className="mt-1 text-sm text-slate-600">Choose up to 50 orders per atomic batch. Blank quantities are skipped; selected orders save together or none are saved.</p>
              <p className="mt-2 text-sm font-medium text-slate-700">{selectedOrderNos.length} orders selected · {allAllocations.length} loaded</p>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <Button type="button" disabled={loading || allAllocations.length === 0} onClick={() => setSelectedOrderNos(allAllocations.slice(0, 50).map((item) => item.order.orderNo))}>Select up to 50 orders</Button>
              <Button type="button" disabled={loading || selectedOrderNos.length === 0} onClick={() => { setSelectedOrderNos([]); setAllQuantities({}); }}>Clear selection</Button>
              {allocationNextCursor && <Button type="button" disabled={loading} onClick={() => void loadMoreAllocations()}>{loading ? "Loading..." : "Load more orders"}</Button>}
            </div>
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {allAllocations.map((item) => {
                const selected = selectedOrderNos.includes(item.order.orderNo);
                const atLimit = !selected && selectedOrderNos.length >= 50;
                return <div key={item.order.orderNo} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <Checkbox
                    aria-label={`Select order ${item.order.orderNo}`}
                    checked={selected}
                    disabled={loading || atLimit}
                    onChange={(event) => setSelectedOrderNos((current) => event.target.checked
                      ? current.length < 50 ? [...current, item.order.orderNo] : current
                      : current.filter((order) => order !== item.order.orderNo))}
                  />
                  <span className="font-semibold">{item.order.orderNo}</span>
                  {item.order.styleName && <span className="truncate text-slate-500">{item.order.styleName}</span>}
                </div>;
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-3 py-3">Order No</th><th className="px-3 py-3">Style</th><th className="px-3 py-3">Size</th><th className="px-3 py-3">Remaining</th><th className="w-44 px-3 py-3">This work order</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allEntries.map((entry) => (
                    <tr key={entry.key}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{entry.orderNo}</td>
                      <td className="px-3 py-3 text-slate-600">{entry.styleName || "-"}</td>
                      <td className="px-3 py-3">{entry.size.size || entry.size.buyerSize || "Unspecified"}{entry.size.size && entry.size.buyerSize && entry.size.size !== entry.size.buyerSize ? ` (${entry.size.buyerSize})` : ""}</td>
                      <td className="px-3 py-3 font-semibold text-emerald-700">{entry.size.remainingQty.toLocaleString("en-IN")}</td>
                      <td className="px-3 py-3">
                        <Input
                          aria-label={`${entry.orderNo} ${entry.size.size || entry.size.buyerSize || "size"}`}
                          type="number"
                          min="0"
                          max={entry.size.remainingQty}
                          value={allQuantities[entry.key] || ""}
                          onChange={(event) => setAllQuantities((current) => ({ ...current, [entry.key]: event.target.value }))}
                          disabled={loading || entry.size.remainingQty === 0}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-5 flex justify-end">
              <Button type="submit" disabled={loading || selectedOrderNos.length === 0 || !allEntries.some((entry) => Number(allQuantities[entry.key]) > 0)}>
                {loading ? "Creating..." : `Create ${Object.values(allQuantities).filter((quantity) => Number(quantity) > 0).length} work orders`}
              </Button>
            </div>
          </Card>
        </form>
      )}
    </div>
  );
}
