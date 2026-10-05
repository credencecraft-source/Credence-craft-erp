"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";
import { useParams } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";
import Tabs from "@/components/ui/Tabs";

const quantity = (value: number | string) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
type StockFilter = "all" | "available" | "no-stock";

type BomLine = {
  id: string;
  rawMaterialName: string | null;
  category: string | null;
  size: string | null;
  workOrderQty: number;
  requiredQty: number;
  totalRequiredQty: number;
  allocatedQty: number | string;
};

type WorkOrder = {
  id: string;
  workOrderNo: string;
  orderNo: string;
  styleName: string | null;
  brand: string | null;
  totalQty: number;
  status: string;
  bomLines: BomLine[];
};

type RequestLine = {
  id: string;
  workOrderBomLineId: string;
  rawMaterial: string | null;
  category: string | null;
  size: string | null;
  requestedQuantity: string;
  pickedQuantity: string;
  status: string;
};

type MaterialRequest = {
  id: string;
  requestNo: string;
  status: string;
  requestedAt: string;
  lines: RequestLine[];
};

export default function FactoryWorkOrderBomDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; workOrderId: string }>();
  const organizationId = params?.organizationId ?? "";
  const workOrderId = params?.workOrderId ?? "";
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState("");

  const loadRequests = useCallback(async () => {
    if (!organizationId || !workOrderId) return;
    try {
      const response = await fetch(
        `/api/inventory/raw-material-outward?organizationId=${encodeURIComponent(organizationId)}&workOrderId=${encodeURIComponent(workOrderId)}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to load RM requests.");
      setRequests(payload.requests ?? []);
    } catch (loadError) {
      setRequestError(loadError instanceof Error ? loadError.message : "Unable to load RM requests.");
    } finally {
      setRequestsLoading(false);
    }
  }, [organizationId, workOrderId]);

  useEffect(() => {
    if (!organizationId || !workOrderId) return;
    let active = true;
    void fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load work-order BOM.");
        const selected = (data.workOrders ?? []).find((item: WorkOrder) => item.id === workOrderId);
        if (!selected) throw new Error("Work order BOM was not found.");
        if (active) setWorkOrder(selected);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load work-order BOM.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [organizationId, workOrderId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRequests(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  const requestedByBomLine = useMemo(() => {
    const totals = new Map<string, number>();
    for (const request of requests) {
      for (const line of request.lines) {
        totals.set(line.workOrderBomLineId, (totals.get(line.workOrderBomLineId) ?? 0) + Number(line.requestedQuantity));
      }
    }
    return totals;
  }, [requests]);
  const pickedByBomLine = useMemo(() => {
    const totals = new Map<string, number>();
    for (const request of requests) {
      for (const line of request.lines) {
        totals.set(line.workOrderBomLineId, (totals.get(line.workOrderBomLineId) ?? 0) + Number(line.pickedQuantity));
      }
    }
    return totals;
  }, [requests]);
  const bomLinesWithRequestProgress = useMemo(() => workOrder?.bomLines.map((line) => ({
    ...line,
    requestedQty: requestedByBomLine.get(line.id) ?? 0,
    pickedQty: pickedByBomLine.get(line.id) ?? 0,
  })) ?? [], [pickedByBomLine, requestedByBomLine, workOrder]);
  const stockCounts = useMemo(() => ({
    all: bomLinesWithRequestProgress.length,
    available: bomLinesWithRequestProgress.filter((line) => Number(line.allocatedQty) > 0).length,
    noStock: bomLinesWithRequestProgress.filter((line) => Number(line.allocatedQty) <= 0).length,
  }), [bomLinesWithRequestProgress]);
  const visibleBomLines = useMemo(() => bomLinesWithRequestProgress.filter((line) => (
    stockFilter === "all"
      || (stockFilter === "available" ? Number(line.allocatedQty) > 0 : Number(line.allocatedQty) <= 0)
  )), [bomLinesWithRequestProgress, stockFilter]);
  const remainingAllocated = useMemo(() => workOrder?.bomLines.reduce((total, line) => (
    total + Math.max(Number(line.allocatedQty) - (requestedByBomLine.get(line.id) ?? 0), 0)
  ), 0) ?? 0, [requestedByBomLine, workOrder]);

  async function requestAllocatedMaterials() {
    if (!organizationId || !workOrderId) return;
    setRequesting(true);
    setRequestError("");
    try {
      const response = await fetch("/api/inventory/raw-material-outward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, action: "request", workOrderId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Unable to request allocated materials.");
      await loadRequests();
    } catch (requestFailure) {
      setRequestError(requestFailure instanceof Error ? requestFailure.message : "Unable to request allocated materials.");
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Page as="div">
      <Section className="space-y-6">
        {loading && <Card className="text-sm text-slate-600">Loading work-order BOM...</Card>}
        {error && <Card role="alert" className="border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] text-sm text-[var(--erp-danger)]">{error}</Card>}
        {workOrder && (
          <>
            <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--erp-border)] pb-4">
              <div className="min-w-0">
                <p className="erp-eyebrow">Factory / Pre-production / Work Order BOM</p>
                <h1 className="erp-page-heading mt-1">{workOrder.workOrderNo}</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Order {workOrder.orderNo} · Style {workOrder.styleName || "-"} · Brand {workOrder.brand || "-"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">WO quantity</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{quantity(workOrder.totalQty)}</p>
                </div>
                <Button
                  type="button"
                  onClick={() => void requestAllocatedMaterials()}
                  disabled={requesting || requestsLoading || remainingAllocated <= 0}
                  aria-label="Request allocated raw materials from inventory"
                >
                  <PackagePlus className="h-4 w-4" />
                  {requesting ? "Requesting..." : "Request to RM"}
                </Button>
              </div>
            </header>
            {requestError && <Card role="alert" className="border-[var(--erp-danger)] bg-[var(--erp-surface-soft)] text-sm text-[var(--erp-danger)]">{requestError}</Card>}
            <p className="text-sm text-slate-500">
              {remainingAllocated > 0
                ? `${quantity(remainingAllocated)} allocated quantity is not yet requested.`
                : "All currently allocated material quantities have been requested."}
            </p>
            <Card>
              <div className="mb-4 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Raw Material Requirements</h2>
                  <p className="mt-1 text-sm text-slate-500">Allocation is inventory assigned to this BOM line, not physical on-hand stock. Track allocation, request, and picking quantities below.</p>
                </div>
                <Tabs
                  ariaLabel="Work-order BOM stock availability"
                  value={stockFilter}
                  onChange={setStockFilter}
                  tabs={[
                    { label: `All (${stockCounts.all})`, value: "all" },
                    { label: `Stock Available (${stockCounts.available})`, value: "available" },
                    { label: `No Stock (${stockCounts.noStock})`, value: "no-stock" },
                  ]}
                />
              </div>
              {visibleBomLines.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--erp-border)] p-6 text-center text-sm text-slate-500">
                  {workOrder.bomLines.length === 0
                    ? "No BOM snapshot available."
                    : stockFilter === "available"
                      ? "No raw materials currently have inventory allocated."
                      : "All raw materials currently have inventory allocated."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1200px] text-left text-sm">
                    <thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-soft)] text-xs text-slate-600">
                      <tr>
                        <th className="p-3">Raw Material</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Size</th>
                        <th className="p-3 text-right">WO Qty</th>
                        <th className="p-3 text-right">Required</th>
                        <th className="p-3 text-right">With Excess</th>
                        <th className="p-3 text-right">Balance to Allocate</th>
                        <th className="p-3 text-right">Allocated Qty</th>
                        <th className="p-3 text-right">Balance to Request</th>
                        <th className="p-3 text-right">Requested Qty</th>
                        <th className="p-3 text-right">Picked Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--erp-border)]">
                      {visibleBomLines.map((line) => (
                        <tr key={line.id}>
                          <td className="p-3 font-semibold text-slate-900">{line.rawMaterialName || "-"}</td>
                          <td className="p-3 text-slate-600">{line.category || "-"}</td>
                          <td className="p-3 text-slate-600">{line.size || "-"}</td>
                          <td className="p-3 text-right">{quantity(line.workOrderQty)}</td>
                          <td className="p-3 text-right">{quantity(line.requiredQty)}</td>
                          <td className="p-3 text-right font-semibold">{quantity(line.totalRequiredQty)}</td>
                          <td className="p-3 text-right">{quantity(Math.max(line.totalRequiredQty - Number(line.allocatedQty), 0))}</td>
                          <td className="p-3 text-right font-semibold">{quantity(line.allocatedQty)}</td>
                          <td className="p-3 text-right">{quantity(Math.max(Number(line.allocatedQty) - line.requestedQty, 0))}</td>
                          <td className="p-3 text-right">{quantity(line.requestedQty)}</td>
                          <td className="p-3 text-right">{quantity(line.pickedQty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </Section>
    </Page>
  );
}
