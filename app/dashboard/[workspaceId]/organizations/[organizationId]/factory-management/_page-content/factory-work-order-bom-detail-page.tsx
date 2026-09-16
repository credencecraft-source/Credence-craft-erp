"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");
type BomLine = { id: string; rawMaterialName: string | null; category: string | null; size: string | null; workOrderQty: number; requiredQty: number; totalRequiredQty: number };
type WorkOrder = { id: string; workOrderNo: string; orderNo: string; styleName: string | null; brand: string | null; totalQty: number; status: string; bomLines: BomLine[] };

export default function FactoryWorkOrderBomDetailPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; workOrderId: string }>();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const workOrderId = params?.workOrderId ?? "";
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load work-order BOM.");
        const selected = (data.workOrders ?? []).find((item: WorkOrder) => item.id === workOrderId);
        if (!selected) throw new Error("Work order BOM was not found.");
        setWorkOrder(selected);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load work-order BOM."))
      .finally(() => setLoading(false));
  }, [organizationId, workOrderId]);

  return <Page as="div"><Section className="space-y-6"><Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/wobom`} className="text-xs font-semibold text-sky-700">&larr; WO BOM</Link>{loading && <Card className="p-6 text-sm text-slate-600">Loading work-order BOM...</Card>}{error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}{workOrder && <><div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Work Order BOM</p><h1 className="mt-2 text-2xl font-bold text-slate-900">{workOrder.workOrderNo}</h1><p className="mt-1 text-sm text-slate-500">Order {workOrder.orderNo} · Style {workOrder.styleName || "-"} · Brand {workOrder.brand || "-"}</p></div><div className="text-right"><p className="text-[10px] uppercase text-slate-500">WO Quantity</p><p className="mt-1 text-2xl font-bold text-sky-700">{quantity(workOrder.totalQty)}</p></div></div><Card className="border-slate-200 p-5"><h2 className="mb-4 text-lg font-bold text-slate-900">Raw Material Requirements</h2>{workOrder.bomLines.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No BOM snapshot available.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr><th className="p-3">Raw Material</th><th className="p-3">Category</th><th className="p-3">Size</th><th className="p-3 text-right">WO Qty</th><th className="p-3 text-right">Required</th><th className="p-3 text-right">With Excess</th></tr></thead><tbody className="divide-y divide-slate-100">{workOrder.bomLines.map((line) => <tr key={line.id}><td className="p-3 font-semibold text-slate-900">{line.rawMaterialName || "-"}</td><td className="p-3 text-slate-600">{line.category || "-"}</td><td className="p-3 text-slate-600">{line.size || "-"}</td><td className="p-3 text-right">{quantity(line.workOrderQty)}</td><td className="p-3 text-right">{quantity(line.requiredQty)}</td><td className="p-3 text-right font-bold text-sky-700">{quantity(line.totalRequiredQty)}</td></tr>)}</tbody></table></div>}</Card></>}</Section></Page>;
}
