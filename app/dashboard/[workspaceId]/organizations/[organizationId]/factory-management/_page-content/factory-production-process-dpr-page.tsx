"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

const quantity = (value: number) => Number(value || 0).toLocaleString("en-IN");
const money = (value: number | string | null | undefined) => value === null || value === undefined ? "-" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type GrnLine = { id: string; operation_name: string; actual_made_qty: number; received_qty: number; billable: boolean; vendor_name?: string | null; actual_price?: number | string | null };
type Grn = { id: string; grn_no: string; grn_date: string; received_qty: number; status: string; fromProcess: { process_name: string }; toProcess: { process_name: string }; workOrder: { work_order_no: string }; lines: GrnLine[] };
type DprReportRow = GrnLine & { grn_no: string; grn_date: string; work_order_no: string; to_process: string; status: string };

const reportFields: Array<{ key: keyof DprReportRow; label: string }> = [
  { key: "grn_no", label: "GRN No" },
  { key: "grn_date", label: "Date" },
  { key: "work_order_no", label: "Work Order" },
  { key: "to_process", label: "To Process" },
  { key: "operation_name", label: "Operation" },
  { key: "actual_made_qty", label: "Actual Made" },
  { key: "received_qty", label: "Received" },
  { key: "billable", label: "Billable" },
  { key: "vendor_name", label: "Vendor" },
  { key: "actual_price", label: "Actual Price" },
  { key: "status", label: "Status" },
];

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
  const [visibleFields, setVisibleFields] = useState<Array<keyof DprReportRow>>(reportFields.map((field) => field.key));

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
  const reportRows = useMemo<DprReportRow[]>(
    () => visibleGroups.flatMap(([, dateGrns]) => dateGrns.flatMap((grn) => grn.lines.map((line) => ({
      ...line,
      grn_no: grn.grn_no,
      grn_date: grn.grn_date,
      work_order_no: grn.workOrder.work_order_no,
      to_process: grn.toProcess.process_name,
      status: grn.status,
    })))),
    [visibleGroups],
  );

  return (
    <Page as="div">
      <Section className="space-y-6">
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
        {!loading && !error && selectedDate && visibleGroups.length > 0 && <Card className="border-slate-200 p-3">
          <ReportGrid
            title={`${selectedDate} Production Report`}
            records={reportRows}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(fields) => setVisibleFields(fields as Array<keyof DprReportRow>)}
            storageKey={`credence-craft-dpr-${organizationId}-${processName}`}
            rowIdSelector={(row) => row.id}
            selectedIds={[]}
            onRowClick={() => undefined}
            renderCell={(fieldKey, row) => {
              if (["actual_made_qty", "received_qty"].includes(fieldKey)) return quantity(Number(row[fieldKey as "actual_made_qty" | "received_qty"]));
              if (fieldKey === "actual_price") return money(row.actual_price);
              if (fieldKey === "grn_date") return new Date(row.grn_date).toLocaleDateString("en-IN");
              if (fieldKey === "billable") return row.billable ? "Yes" : "No";
              return String(row[fieldKey as keyof DprReportRow] ?? "-");
            }}
            emptyMessage={`No GRN report found for ${selectedDate}.`}
          />
        </Card>}
        {!loading && !error && selectedDate && visibleGroups.length === 0 && <Card className="p-8 text-center text-sm text-slate-500">No GRN report found for {selectedDate}.</Card>}
      </Section>
    </Page>
  );
}
