"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type WorkInProgressRecord = {
  id: string;
  workOrderId: string;
  workOrderNo: string;
  orderNo: string;
  styleName: string | null;
  brand: string | null;
  buyer: string | null;
  orderQty: number;
  completedQty: number;
  pendingQty: number;
  receivedQty: number;
  pendingReceiptQty: number;
  createdQty: number;
  processName: string;
  processStatus: string;
  operations: Array<{ id: string; operation: string; budgetedPrice: number; actualPrice: number | null }>;
};

type ProcessGroup = {
  processName: string;
  records: WorkInProgressRecord[];
  orderQty: number;
  completedQty: number;
  pendingQty: number;
  receivedQty: number;
  pendingReceiptQty: number;
};

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");

export default function FactoryProductionWipPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const [records, setRecords] = useState<WorkInProgressRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/factory/production/wip?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load work in progress.");
        return data;
      })
      .then((data) => {
        if (active) setRecords(Array.isArray(data.workInProgress) ? data.workInProgress : []);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load work in progress.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [organizationId]);

  const processGroups = records.reduce<ProcessGroup[]>((groups, record) => {
    const existing = groups.find((group) => group.processName === record.processName);
    if (existing) {
      existing.records.push(record);
      existing.orderQty += record.orderQty;
      existing.completedQty += record.completedQty;
      existing.pendingQty += record.pendingQty;
      existing.receivedQty += record.receivedQty;
      existing.pendingReceiptQty += record.pendingReceiptQty;
    } else {
      groups.push({ processName: record.processName, records: [record], orderQty: record.orderQty, completedQty: record.completedQty, pendingQty: record.pendingQty, receivedQty: record.receivedQty, pendingReceiptQty: record.pendingReceiptQty });
    }
    return groups;
  }, []);

  return (
    <Page as="div">
      <Section className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <button type="button" onClick={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor`)} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">&larr; Shop Floor</button>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Work In Progress</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">WIP</h1>
            <p className="mt-2 text-sm text-slate-600">Process-level production status across all created work orders.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">Process Cards</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{processGroups.length}</p>
          </div>
        </div>

        {loading && <Card className="border-slate-200 p-6 text-sm text-slate-600">Loading work-order processes...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-6 text-sm text-red-700">{error}</Card>}
        {!loading && !error && processGroups.length === 0 && (
          <Card className="border-dashed border-slate-300 p-8 text-center">
            <p className="text-sm font-semibold text-slate-800">No work-order process controllers found.</p>
            <p className="mt-2 text-sm text-slate-500">Create a work order from an order with a selected process template to start WIP tracking.</p>
          </Card>
        )}

        {!loading && !error && processGroups.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {processGroups.map((group) => (
              <Link key={group.processName} href={`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor/wip/${encodeURIComponent(group.processName)}`} className="group block">
              <Card className="border-slate-200 bg-white transition hover:border-emerald-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Process</p>
                    <h2 className="mt-1 text-xl font-bold text-slate-900">{group.processName}</h2>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-700">{group.records.length} Work Orders</span>
                </div>

                <p className="mt-4 text-xs text-slate-500">All work orders currently assigned to this process.</p>

                <div className="mt-5 grid grid-cols-2 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 sm:grid-cols-4">
                  <div className="px-3 py-3 text-center"><p className="text-[10px] uppercase text-slate-500">Order Qty</p><p className="mt-1 text-base font-bold text-slate-900">{quantity(group.orderQty)}</p></div>
                  <div className="px-3 py-3 text-center"><p className="text-[10px] uppercase text-slate-500">Complete</p><p className="mt-1 text-base font-bold text-emerald-700">{quantity(group.completedQty)}</p></div>
                  <div className="px-3 py-3 text-center"><p className="text-[10px] uppercase text-slate-500">Pending</p><p className="mt-1 text-base font-bold text-amber-700">{quantity(group.pendingQty)}</p></div>
                  <div className="px-3 py-3 text-center"><p className="text-[10px] uppercase text-slate-500">Received / To Receive</p><p className="mt-1 text-base font-bold text-sky-700">{quantity(group.receivedQty)} / {quantity(group.pendingReceiptQty)}</p></div>
                </div>
                <p className="mt-4 text-right text-xs font-semibold text-emerald-700 group-hover:text-emerald-800">Open process details -&gt;</p>
              </Card>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}
