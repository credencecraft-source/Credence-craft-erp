"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type WorkOrderGrnRecord = {
  id: string;
  grnNo: string;
  receivedDate: string;
  status: string;
  notes: string;
  createdAt: string;
  workOrder: {
    id: string;
    workOrderNo: string;
    orderNo: string;
    totalQty: number;
    status: string;
    article: string | null;
    styleName: string | null;
    brand: string | null;
  };
  lines: Array<{
    receivedQuantity: number;
  }>;
};

type ReportRecord = WorkOrderGrnRecord & {
  workOrderNo: string;
  orderNo: string;
  style: string;
  totalReceived: number;
};

type ReportField = "grnNo" | "workOrderNo" | "orderNo" | "style" | "receivedDate" | "totalReceived" | "status";

const reportFields: Array<{ key: ReportField; label: string }> = [
  { key: "grnNo", label: "GRN No" },
  { key: "workOrderNo", label: "Work Order No" },
  { key: "orderNo", label: "Order No" },
  { key: "style", label: "Style" },
  { key: "receivedDate", label: "Received Date" },
  { key: "totalReceived", label: "Received Qty" },
  { key: "status", label: "Status" },
];

export default function WorkOrderGrnReportPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "";
  const basePath = `/dashboard/${params.workspaceId}/organizations/${organizationId}/inventory-management/inward/wo-grn`;
  const [records, setRecords] = useState<ReportRecord[]>([]);
  const [visibleFields, setVisibleFields] = useState<ReportField[]>(reportFields.map(({ key }) => key));
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadGrns = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/inventory/work-order-grns?${query}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.grns)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load Work Order GRNs.");
      }
      const page = data.grns.map((grn: WorkOrderGrnRecord) => ({
        ...grn,
        workOrderNo: grn.workOrder.workOrderNo,
        orderNo: grn.workOrder.orderNo,
        style: grn.workOrder.styleName || grn.workOrder.article || "",
        totalReceived: grn.lines.reduce((total, line) => total + line.receivedQuantity, 0),
      }));
      setRecords((current) => cursor ? [...current, ...page] : page);
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Work Order GRNs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [organizationId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadGrns();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadGrns]);

  return (
    <Page as="div">
      <Section>
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="erp-eyebrow">Inventory / Inward</p>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">Work Order GRN Report</h1>
            <p className="mt-1 text-sm text-slate-600">Review receipts submitted against work orders and open pending verification.</p>
          </div>
          <Button onClick={() => router.push(`${basePath}/create`)}>Create Work Order GRN</Button>
        </header>

        {error ? (
          <Card role="alert" className="space-y-3">
            <p className="text-sm text-slate-700">{error}</p>
            <Button variant="secondary" size="sm" onClick={() => void loadGrns()} disabled={loading}>Retry</Button>
          </Card>
        ) : null}
        {loading ? <p role="status" className="text-sm text-slate-600">Loading Work Order GRNs...</p> : null}
        <Card className="p-2 shadow-none">
          <ReportGrid
            title="Work Order GRN List"
            records={records}
            fields={reportFields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(fields) => setVisibleFields(fields as ReportField[])}
            storageKey={`work-order-grn-report-columns:${organizationId}`}
            rowIdSelector={(record) => record.id}
            selectedIds={[]}
            selectable={false}
            onRowClick={() => undefined}
            onRowAction={(recordId) => router.push(`${basePath}/verification?grnId=${encodeURIComponent(recordId)}`)}
            rowActionLabel="Verify"
            rowActionLabelSelector={(record) => record.status === "PENDING_VERIFICATION" ? "Verify" : "View"}
            rowActionDisabledSelector={(record) => record.status !== "PENDING_VERIFICATION"}
            renderCell={(fieldKey, record) => {
              if (fieldKey === "receivedDate") return record.receivedDate;
              const value = record[fieldKey as keyof ReportRecord];
              return value === null || value === undefined ? "" : String(value);
            }}
            emptyMessage="No Work Order GRNs have been submitted yet."
          />
          {nextCursor ? (
            <div className="flex justify-center p-3">
              <Button type="button" variant="secondary" size="sm" disabled={loadingMore} onClick={() => void loadGrns(nextCursor)}>
                {loadingMore ? "Loading GRNs..." : "Load more GRNs"}
              </Button>
            </div>
          ) : null}
        </Card>
      </Section>
    </Page>
  );
}
