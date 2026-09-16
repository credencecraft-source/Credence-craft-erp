"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");

type BomLine = {
  id: string;
  rawMaterialName: string | null;
  category: string | null;
  size: string | null;
  workOrderQty: number;
  requiredQty: number;
  totalRequiredQty: number;
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

function BomReportTable({ lines }: { lines: BomLine[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
          <tr>
            <th className="p-3 font-semibold">Raw Material</th>
            <th className="p-3 font-semibold">Category</th>
            <th className="p-3 font-semibold">Size</th>
            <th className="p-3 text-right font-semibold">WO Qty</th>
            <th className="p-3 text-right font-semibold">Required</th>
            <th className="p-3 text-right font-semibold">With Excess</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {lines.map((line) => (
            <tr key={line.id}>
              <td className="p-3 font-semibold text-slate-900">{line.rawMaterialName || "-"}</td>
              <td className="p-3 text-slate-600">{line.category || "-"}</td>
              <td className="p-3 text-slate-600">{line.size || "-"}</td>
              <td className="p-3 text-right text-slate-700">{quantity(line.workOrderQty)}</td>
              <td className="p-3 text-right text-slate-700">{quantity(line.requiredQty)}</td>
              <td className="p-3 text-right font-bold text-sky-700">{quantity(line.totalRequiredQty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FactoryWorkOrderBomPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const organizationId = params?.organizationId ?? "demo-org";
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load work-order BOM.");
        setWorkOrders(data.workOrders ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load work-order BOM."))
      .finally(() => setLoading(false));
  }, [organizationId]);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Pre Production</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">WO BOM</h1>
          <p className="mt-2 text-sm text-slate-600">Work-order-specific material requirements.</p>
        </div>
        {loading && <Card className="p-6 text-sm text-slate-600">Loading WO BOM...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
        {!loading && !error && workOrders.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No work orders found.</Card>}
        {!loading && !error && workOrders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {workOrders.map((workOrder) => (
              <Link key={workOrder.id} href={`/dashboard/${params?.workspaceId ?? "demo"}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/wobom/${encodeURIComponent(workOrder.id)}`} className="block">
              <Card className="border-slate-200 p-4 transition hover:border-sky-400 hover:shadow-md">
                <div className="border-b border-slate-200 pb-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900">{workOrder.workOrderNo}</h2>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>Order: {workOrder.orderNo}</span>
                      <span>Style: {workOrder.styleName || "-"}</span>
                      <span>Brand: {workOrder.brand || "-"}</span>
                      <span>WO Qty: <strong className="text-sky-700">{quantity(workOrder.totalQty)}</strong></span>
                    </div>
                  </div>
                </div>
                <details className="mt-4" onClick={(event) => event.preventDefault()}>
                  <summary className="cursor-pointer text-xs font-semibold text-sky-700">View raw materials</summary>
                  <div className="mt-3">{workOrder.bomLines.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">No BOM snapshot available.</p> : <BomReportTable lines={workOrder.bomLines} />}</div>
                </details>
              </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}
