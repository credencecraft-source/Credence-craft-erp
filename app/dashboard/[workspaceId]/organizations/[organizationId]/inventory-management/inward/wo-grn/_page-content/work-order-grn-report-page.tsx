"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ReportGrid } from "@/components/reports/report-grid-display";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Page from "@/components/ui/Page";
import Section from "@/components/ui/Section";

type ReconciliationLine = {
  lineId: string;
  size: string;
  approvedQuantity: number | null;
  allocatedQuantity: number;
  currentGeneralQuantity: number | null;
  expectedAllocatedQuantity: number | null;
  expectedGeneralQuantity: number | null;
  currentAllocatedQuantity: number | null;
  changed: boolean;
  skipped: string | null;
  blockers: string[];
  issuedItems: Array<{
    bookingNo: string;
    quantityIssued: number;
    reservedQuantity: number;
    requestNo: string;
    requestId: string;
    requestStatus: string;
  }>;
};

type ReconciliationResult = {
  applied: boolean;
  records: Array<{
    grnId: string;
    grnNo: string;
    status: string;
    lines: ReconciliationLine[];
  }>;
};

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
    advanceBookedQuantity: number | null;
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
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [reconciliationError, setReconciliationError] = useState("");
  const [isReconciling, setIsReconciling] = useState(false);

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

  const runReconciliation = useCallback(async (action: "preview" | "apply") => {
    setIsReconciling(true);
    setReconciliationError("");
    try {
      const response = await fetch("/api/inventory/work-order-grns/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, grnIds: selectedIds, action }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.records)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to reconcile selected Work Order GRNs.");
      }
      setReconciliation(data as ReconciliationResult);
      if (action === "apply") {
        setSelectedIds([]);
        await loadGrns();
      }
    } catch (reconciliationFailure) {
      setReconciliationError(
        reconciliationFailure instanceof Error
          ? reconciliationFailure.message
          : "Unable to reconcile selected Work Order GRNs.",
      );
    } finally {
      setIsReconciling(false);
    }
  }, [loadGrns, organizationId, selectedIds]);

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
            selectedIds={selectedIds}
            selectable
            onToggleSelectAll={(checked, recordIds) => {
              setSelectedIds((current) => checked
                ? [...new Set([...current, ...recordIds])]
                : current.filter((id) => !recordIds.includes(id)));
            }}
            onToggleRowSelection={(recordId, checked) => {
              setSelectedIds((current) => checked
                ? [...new Set([...current, recordId])]
                : current.filter((id) => id !== recordId));
            }}
            toolbarActions={(
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={selectedIds.length === 0 || isReconciling}
                onClick={() => {
                  setReconciliation(null);
                  setReconciliationError("");
                  setShowReconciliation(true);
                  void runReconciliation("preview");
                }}
              >
                Recalculate selected ({selectedIds.length})
              </Button>
            )}
            onRowClick={(recordId) => router.push(`${basePath}/report/${encodeURIComponent(recordId)}`)}
            onRowAction={() => router.push(`${basePath}/verification`)}
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
      <Modal
        open={showReconciliation}
        onClose={() => {
          if (!isReconciling) setShowReconciliation(false);
        }}
        ariaLabelledBy="work-order-grn-reconciliation-title"
        ariaDescribedBy="work-order-grn-reconciliation-description"
        closeOnBackdrop={!isReconciling}
        size="square"
      >
        <div className="space-y-4 p-6">
          <header className="space-y-1">
            <h2 id="work-order-grn-reconciliation-title" className="text-xl font-semibold text-[var(--erp-text)]">
              Recalculate selected GRNs?
            </h2>
            <p id="work-order-grn-reconciliation-description" className="text-sm text-[var(--erp-muted)]">
              Rebuilds GRN allocation counters from approved quantities and existing booking-allocation records. It never deletes stock receipts, allocations, issued items, or audit history.
            </p>
          </header>
          {reconciliationError ? (
            <Card role="alert" className="border-[var(--erp-danger)] text-sm">{reconciliationError}</Card>
          ) : null}
          {isReconciling ? <p role="status" className="text-sm text-[var(--erp-muted)]">Checking selected GRNs...</p> : null}
          {reconciliation ? (
            <div className="space-y-3">
              {reconciliation.records.map((record) => (
                <Card key={record.grnId} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-[var(--erp-text)]">{record.grnNo}</h3>
                    <span className="text-xs text-[var(--erp-muted)]">{record.status.replaceAll("_", " ")}</span>
                  </div>
                  {record.lines.map((line) => (
                    <div key={line.lineId} className="space-y-2 border-t border-[var(--erp-border)] pt-3 text-sm">
                      <p className="font-medium text-[var(--erp-text)]">
                        Size {line.size} · Approved {line.approvedQuantity?.toLocaleString() ?? "pending"}
                      </p>
                      {line.skipped ? <p className="text-[var(--erp-muted)]">{line.skipped}</p> : null}
                      {line.expectedAllocatedQuantity !== null && line.expectedGeneralQuantity !== null ? (
                        <p className="text-[var(--erp-muted)]">
                          Allocated: {line.currentAllocatedQuantity?.toLocaleString() ?? "—"} → {line.expectedAllocatedQuantity.toLocaleString()} ·
                          {" "}General: {line.currentGeneralQuantity?.toLocaleString() ?? "—"} → {line.expectedGeneralQuantity.toLocaleString()}
                        </p>
                      ) : null}
                      {line.blockers.map((blocker) => (
                        <p key={blocker} role="alert" className="rounded-md border border-[var(--erp-danger-border)] bg-[var(--erp-danger-bg)] px-3 py-2 text-[var(--erp-danger-text)]">
                          Not recalculated: {blocker}
                        </p>
                      ))}
                      {line.issuedItems.map((item) => (
                        <p key={`${item.requestId}:${item.bookingNo}`} role="alert" className="rounded-md border border-[var(--erp-warning-border)] bg-[var(--erp-warning-bg)] px-3 py-2 text-[var(--erp-warning-text)]">
                          Size {line.size} for {item.bookingNo}:{" "}
                          {item.quantityIssued > 0
                            ? `${item.quantityIssued.toLocaleString()} PCS issued`
                            : null}
                          {item.quantityIssued > 0 && item.reservedQuantity > 0 ? " · " : ""}
                          {item.reservedQuantity > 0
                            ? `${item.reservedQuantity.toLocaleString()} PCS still reserved`
                            : null}
                          {item.quantityIssued === 0 && item.reservedQuantity === 0 ? item.requestStatus : ""}
                          {item.requestNo ? ` — ${item.requestNo} (${item.requestId || "request ID unavailable"})` : ""}.
                          {" "}This usage is from {record.grnNo}; recalculation does not change or block this stock request. Resolve it only if you later reverse {item.bookingNo} fulfillment.
                        </p>
                      ))}
                      {!line.skipped && line.blockers.length === 0 ? (
                        <p role="status" className="text-[var(--erp-success-text)]">
                          {line.changed ? "Counter correction is safe." : "Counters already match the allocation records."}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </Card>
              ))}
              {reconciliation.applied ? (
                <p role="status" className="text-sm text-[var(--erp-success-text)]">
                  Safe counter corrections were applied. Stock movements and allocation records were preserved.
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--erp-border)] pt-4">
            {!reconciliation?.applied ? (
              <Button type="button" variant="secondary" onClick={() => setShowReconciliation(false)} disabled={isReconciling}>
                Cancel
              </Button>
            ) : null}
            {reconciliation && !reconciliation.applied ? (
              <Button
                type="button"
                variant="primary"
                disabled={isReconciling || !reconciliation.records.some((record) =>
                  record.lines.some((line) => line.changed && line.blockers.length === 0),
                )}
                onClick={() => void runReconciliation("apply")}
              >
                {isReconciling ? "Recalculating..." : "Confirm recalculation"}
              </Button>
            ) : null}
            {reconciliation?.applied ? (
              <Button type="button" variant="primary" onClick={() => setShowReconciliation(false)}>
                Done
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </Page>
  );
}
