"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type ProductionReportRow = {
  id: string;
  grnNo: string;
  acceptedAt: string;
  orderNo: string;
  styleNo: string | null;
  styleName: string | null;
  workOrderNo: string;
  fromProcess: string;
  toProcess: string;
  transferQty: number;
  acceptedQty: number;
  acceptedBy: string | null;
  status: string;
  operations: string[];
};

type ReportPage = { records: ProductionReportRow[]; nextCursor: string | null };
type ReportField = keyof ProductionReportRow;

const reportFields: Array<{ key: ReportField; label: string }> = [
  { key: "grnNo", label: "GRN No" },
  { key: "orderNo", label: "Order No" },
  { key: "styleNo", label: "Style No" },
  { key: "styleName", label: "Style Name" },
  { key: "workOrderNo", label: "Work Order No" },
  { key: "fromProcess", label: "From Process" },
  { key: "toProcess", label: "To Process" },
  { key: "operations", label: "Operations / Made Qty" },
  { key: "transferQty", label: "Batch Qty Transferred" },
  { key: "acceptedQty", label: "Accepted Qty" },
  { key: "acceptedBy", label: "Accepted By" },
  { key: "acceptedAt", label: "Accepted Date / Time" },
  { key: "status", label: "GRN Status" },
];

function formatCell(field: string, row: ProductionReportRow) {
  if (field === "transferQty" || field === "acceptedQty") {
    return Number(row[field]).toLocaleString("en-IN");
  }
  if (field === "acceptedAt") {
    return new Date(row.acceptedAt).toLocaleString("en-IN");
  }
  if (field === "operations") {
    return row.operations.length > 0 ? row.operations.join(", ") : "-";
  }
  return String(row[field as keyof ProductionReportRow] ?? "-");
}

export default function FactoryProductionDprReportPage() {
  const params = useParams<{ organizationId: string }>();
  const organizationId = params?.organizationId ?? "";
  const [records, setRecords] = useState<ProductionReportRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadedOrganizationId, setLoadedOrganizationId] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [visibleFields, setVisibleFields] = useState<ReportField[]>(reportFields.map(({ key }) => key));
  const loading = Boolean(organizationId) && loadedOrganizationId !== organizationId;
  const visibleRecords = loading ? [] : records;

  const loadPage = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    const query = new URLSearchParams({ organizationId });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`/api/factory/production/completion-report?${query.toString()}`, {
      cache: "no-store",
      signal,
    });
    const data = await response.json() as ReportPage & { error?: string };
    if (!response.ok) throw new Error(data.error || "Unable to load the factory production report.");
    return data;
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    const controller = new AbortController();
    void loadPage(undefined, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setRecords(page.records);
        setNextCursor(page.nextCursor);
        setError("");
        setLoadedOrganizationId(organizationId);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the factory production report.");
          setLoadedOrganizationId(organizationId);
        }
      });
    return () => controller.abort();
  }, [loadPage, organizationId]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const page = await loadPage(nextCursor);
      setRecords((current) => [...current, ...page.records]);
      setNextCursor(page.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more production records.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Page as="div">
      <Section>
        <div>
          <h1 className="text-2xl font-bold text-[var(--erp-text)]">Factory DPR Report</h1>
          <p className="mt-1 text-sm text-slate-600">
            Factory-wide bundle transfers and accepted production receipts, with the recorded receiver and time.
          </p>
        </div>

        {loading && <Card role="status" className="text-sm text-slate-600">Loading production report...</Card>}
        {!loading && error && <Card role="alert" className="text-sm text-[var(--erp-danger)]">{error}</Card>}
        {!loading && visibleRecords.length === 0 && !error && (
          <Card className="text-center text-sm text-slate-600">No factory production receipts have been recorded.</Card>
        )}
        {visibleRecords.length > 0 && (
          <Card className="p-3">
            <ReportGrid
              title="Factory Production Receipts"
              records={visibleRecords}
              fields={reportFields}
              visibleFields={visibleFields}
              onVisibleFieldsChange={(fields) => setVisibleFields(fields as ReportField[])}
              storageKey={`credence-craft-factory-dpr-${organizationId}`}
              rowIdSelector={(record) => record.id}
              selectedIds={[]}
              onRowClick={() => undefined}
              renderCell={formatCell}
              emptyMessage="No factory production receipts match this search."
            />
            {nextCursor && (
              <div className="flex justify-center pt-4">
                <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </Card>
        )}
      </Section>
    </Page>
  );
}
