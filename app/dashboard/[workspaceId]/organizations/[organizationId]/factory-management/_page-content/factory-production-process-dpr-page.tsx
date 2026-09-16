"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");
const money = (value: number | string | null | undefined) => value === null || value === undefined ? "-" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type GrnLine = { id: string; operation_name: string; actual_made_qty: number; received_qty: number; billable: boolean; vendor_name?: string | null; actual_price?: number | string | null };
type Grn = { id: string; grn_no: string; grn_date: string; received_qty: number; status: string; fromProcess: { process_name: string }; toProcess: { process_name: string }; workOrder: { work_order_no: string }; lines: GrnLine[] };

export default function FactoryProductionProcessDprPage() {
  const params = useParams<{ workspaceId: string; organizationId: string; process: string }>();
  const searchParams = useSearchParams();
  const workspaceId = params?.workspaceId ?? "demo";
  const organizationId = params?.organizationId ?? "demo-org";
  const processName = decodeURIComponent(params?.process ?? "");
  const selectedDate = searchParams.get("date");
  const [grns, setGrns] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = new URLSearchParams({ organizationId, process: processName });
    void fetch(`/api/factory/production/dpr?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load GRN transactions.");
        setGrns(data.activity?.grns ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load GRN transactions."))
      .finally(() => setLoading(false));
  }, [organizationId, processName]);

  const dateGroups = useMemo(() => {
    const groups = new Map<string, Grn[]>();
    for (const grn of grns) {
      const date = grn.grn_date.slice(0, 10);
      groups.set(date, [...(groups.get(date) ?? []), grn]);
    }
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [grns]);

  const visibleGroups = selectedDate ? dateGroups.filter(([date]) => date === selectedDate) : dateGroups;

  return (
    <Page as="div">
      <Section className="space-y-6">
        <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor/dpr`} className="text-xs font-semibold text-emerald-700">&larr; Processes</Link>
        <div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-bold text-slate-900">{processName}</h1>{selectedDate && <Link href={`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/production/shop-floor/dpr/${encodeURIComponent(processName)}`} className="text-xs font-semibold text-emerald-700">All dates</Link>}</div>
        {loading && <Card className="p-6 text-sm text-slate-600">Loading GRN transactions...</Card>}
        {error && <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>}
        {!loading && !error && dateGroups.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No GRN transactions for this process.</Card>}
        {!loading && !error && dateGroups.length > 0 && !selectedDate && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dateGroups.map(([date, dateGrns]) => {
            const totalQty = dateGrns.reduce((sum, grn) => sum + grn.received_qty, 0);
            return <Link key={date} href={`?date=${date}`} className="block"><Card className="border-slate-200 p-5 transition hover:border-emerald-400 hover:shadow-md"><div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-900">{date}</h2><span className="text-[10px] font-bold uppercase text-emerald-700">Open -&gt;</span></div><p className="mt-5 text-[10px] uppercase tracking-wide text-slate-500">Total Quantity</p><p className="mt-1 text-3xl font-bold text-emerald-700">{quantity(totalQty)}</p></Card></Link>;
          })}
        </div>}
        {!loading && !error && selectedDate && visibleGroups.length > 0 && <div className="space-y-4">
          {visibleGroups.map(([date, dateGrns]) => (
            <Card key={date} className="border-slate-200 p-5">
              <h2 className="border-b border-slate-200 pb-4 text-xl font-bold text-slate-900">{date} Report</h2>
              <div className="mt-4 space-y-4">
                {dateGrns.map((grn) => (
                  <div key={grn.id} className="overflow-hidden rounded-lg border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span className="font-bold text-slate-900">{grn.grn_no}</span>
                        <span className="text-slate-500">WO {grn.workOrder.work_order_no}</span>
                        <span className="text-slate-500">To {grn.toProcess.process_name}</span>
                        <span className="text-slate-500">Received {quantity(grn.received_qty)}</span>
                      </div>
                      <span className="font-bold text-emerald-700">{grn.status}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[680px] text-left text-xs">
                        <thead className="border-b border-slate-100 text-[10px] uppercase text-slate-500">
                          <tr><th className="p-3">Operation</th><th className="p-3 text-right">Actual Made</th><th className="p-3 text-right">Received</th><th className="p-3">Billable</th><th className="p-3">Vendor</th><th className="p-3 text-right">Actual Price</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {grn.lines.map((line) => <tr key={line.id}><td className="p-3 font-semibold text-slate-900">{line.operation_name}</td><td className="p-3 text-right font-bold text-emerald-700">{quantity(line.actual_made_qty)}</td><td className="p-3 text-right">{quantity(line.received_qty)}</td><td className="p-3">{line.billable ? "Yes" : "No"}</td><td className="p-3">{line.vendor_name || "-"}</td><td className="p-3 text-right">{money(line.actual_price)}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>}
        {!loading && !error && selectedDate && visibleGroups.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No GRN report found for {selectedDate}.</Card>}
      </Section>
    </Page>
  );
}
