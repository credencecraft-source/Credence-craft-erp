"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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
  stockReceipts: Array<{
    stockType: "GENERAL" | "ALLOCATED";
    receiptId: string;
    currentQuantityOut: number;
    expectedQuantityOut: number;
    currentStock: number;
    expectedCurrentStock: number;
    changed: boolean;
  }>;
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
    verifiedActualQuantity: number | null;
  }>;
};

type ReportRecord = WorkOrderGrnRecord & {
  workOrderNo: string;
  orderNo: string;
  style: string;
  totalReceived: number;
};

type DeleteIssueReference = {
  id: string;
  type: "POS_INVOICE" | "FG_OUTWARD_REQUEST" | "FG_STOCK_RECEIPT";
  documentNo: string;
  stockType?: "GENERAL" | "ALLOCATED";
  issueNo?: string;
};

type DeleteFailure = {
  message: string;
  issues: DeleteIssueReference[];
};

function isDeleteIssueReference(issue: unknown): issue is DeleteIssueReference {
  if (!issue || typeof issue !== "object") return false;
  if (
    !("id" in issue)
    || typeof issue.id !== "string"
    || !("documentNo" in issue)
    || typeof issue.documentNo !== "string"
    || !("type" in issue)
    || (issue.type !== "POS_INVOICE"
      && issue.type !== "FG_OUTWARD_REQUEST"
      && issue.type !== "FG_STOCK_RECEIPT")
  ) {
    return false;
  }
  return (!("issueNo" in issue) || issue.issueNo === undefined || typeof issue.issueNo === "string")
    && (!("stockType" in issue)
    || issue.stockType === undefined
    || issue.stockType === "GENERAL"
    || issue.stockType === "ALLOCATED");
}

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

function getIssueHref(issue: DeleteIssueReference, organizationBasePath: string) {
  if (issue.type === "POS_INVOICE") {
    return `${organizationBasePath}/pos/invoice/${encodeURIComponent(issue.documentNo)}`;
  }
  if (issue.type === "FG_OUTWARD_REQUEST") {
    const requestQuery = new URLSearchParams({ requestId: issue.id });
    return `${organizationBasePath}/inventory-management/outward/fg-stock-dc?${requestQuery.toString()}`;
  }
  const recordType = issue.stockType === "ALLOCATED" ? "allocated" : "general";
  return `${organizationBasePath}/inventory-management/stock/fg-stock/record/${recordType}/${encodeURIComponent(issue.id)}`;
}

function DeleteFailureNotice({
  failure,
  organizationBasePath,
}: {
  failure: DeleteFailure;
  organizationBasePath: string;
}) {
  return (
    <div>
      <p>{failure.message}</p>
      {failure.issues.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-1">
          {failure.issues.map((issue) => (
            <li key={`${issue.type}:${issue.id}`}>
              <Link
                href={getIssueHref(issue, organizationBasePath)}
                className="font-semibold text-[var(--erp-brand)] underline underline-offset-2"
              >
                {issue.type === "POS_INVOICE"
                  ? `POS Invoice ${issue.documentNo}`
                  : issue.type === "FG_OUTWARD_REQUEST"
                    ? `FG Outward Request ${issue.documentNo}`
                    : `FG Stock Receipt ${issue.documentNo}`}
                {issue.issueNo ? ` (Material Issue ID: ${issue.issueNo})` : ""}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

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
  const [deleteNotice, setDeleteNotice] = useState("");
  const [deleteError, setDeleteError] = useState<DeleteFailure | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reconciliation, setReconciliation] = useState<ReconciliationResult | null>(null);
  const [reconciliationError, setReconciliationError] = useState("");
  const [isReconciling, setIsReconciling] = useState(false);
  const reconciliationStatusRef = useRef<HTMLDivElement>(null);
  const deleteIssueBasePath = `/dashboard/${params.workspaceId}/organizations/${organizationId}`;

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

  const runReconciliation = useCallback(async () => {
    setIsReconciling(true);
    setReconciliation(null);
    setReconciliationError("");
    try {
      const response = await fetch("/api/inventory/work-order-grns/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, grnIds: selectedIds, action: "apply" }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.records)) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to reconcile selected Work Order GRNs.");
      }
      const reconciliationResult = data as ReconciliationResult;
      setReconciliation(reconciliationResult);
      const reconciliationHasBlockers = reconciliationResult.records.some((record) =>
        record.lines.some((line) => line.blockers.length > 0 || line.skipped !== null),
      );
      if (!reconciliationHasBlockers) {
        setSelectedIds([]);
        setDeleteError(null);
      }
      await loadGrns();
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

  function requestBulkDelete() {
    if (selectedIds.length > 100) {
      setDeleteError({ message: "Select no more than 100 Work Order GRNs at a time.", issues: [] });
      return;
    }
    const selectedRows = records.filter((record) => selectedIds.includes(record.id));
    if (selectedRows.length !== selectedIds.length) {
      setDeleteError({
        message: "One or more selected Work Order GRNs are no longer in this report. Refresh and select them again.",
        issues: [],
      });
      return;
    }
    setDeleteError(null);
    setDeleteNotice("");
    setIsDeleteDialogOpen(true);
  }

  async function deleteSelectedGrns() {
    if (isDeleting || selectedIds.length === 0) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch("/api/inventory/work-order-grns", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, grnIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.deleted) || data.deleted.length !== selectedIds.length) {
        const failure: DeleteFailure = {
          message: typeof data?.error === "string" ? data.error : "Unable to delete the selected Work Order GRNs.",
          issues: Array.isArray(data?.issues)
            ? data.issues.filter(isDeleteIssueReference)
            : [],
        };
        throw failure;
      }
      const deletedIds = new Set<string>(
        data.deleted.flatMap((record: unknown) =>
          record && typeof record === "object" && "id" in record && typeof record.id === "string"
            ? [record.id]
            : [],
        ),
      );
      if (deletedIds.size !== selectedIds.length) {
        throw new Error("The server returned an incomplete Work Order GRN deletion result. Reload the report to verify.");
      }
      setRecords((current) => current.filter((record) => !deletedIds.has(record.id)));
      setSelectedIds((current) => current.filter((id) => !deletedIds.has(id)));
      setDeleteNotice(`Deleted ${deletedIds.size} zero-issued Work Order GRN${deletedIds.size === 1 ? "" : "s"}.`);
      setIsDeleteDialogOpen(false);
    } catch (deleteFailure) {
      if (
        deleteFailure
        && typeof deleteFailure === "object"
        && "message" in deleteFailure
        && typeof deleteFailure.message === "string"
      ) {
        setDeleteError({
          message: deleteFailure.message,
          issues: "issues" in deleteFailure && Array.isArray(deleteFailure.issues)
            ? deleteFailure.issues.filter(isDeleteIssueReference)
            : [],
        });
      } else {
        setDeleteError({ message: "Unable to delete the selected Work Order GRNs.", issues: [] });
      }
    } finally {
      setIsDeleting(false);
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadGrns();
    }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadGrns]);

  useEffect(() => {
    if (reconciliation) {
      reconciliationStatusRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [reconciliation]);

  const reconciliationLines = reconciliation?.records.flatMap((record) => record.lines) ?? [];
  const correctedLineCount = reconciliationLines.filter((line) => line.changed).length;
  const correctedReceiptCount = reconciliationLines.reduce(
    (total, line) => total + line.stockReceipts.filter((receipt) => receipt.changed).length,
    0,
  );
  const matchedLineCount = reconciliationLines.filter((line) =>
    !line.changed && !line.skipped && line.blockers.length === 0,
  ).length;
  const pendingLineCount = reconciliationLines.filter((line) => line.skipped).length;
  const blockedLineCount = reconciliationLines.filter((line) => line.blockers.length > 0).length;

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
        {deleteError && !isDeleteDialogOpen ? (
          <Card role="alert" className="text-sm text-[var(--erp-danger-text)]">
            <DeleteFailureNotice failure={deleteError} organizationBasePath={deleteIssueBasePath} />
          </Card>
        ) : null}
        {deleteNotice ? <p role="status" className="text-sm text-[var(--erp-success-text)]">{deleteNotice}</p> : null}
        {loading ? <p role="status" className="text-sm text-slate-600">Loading Work Order GRNs...</p> : null}
        {reconciliationError ? (
          <Card role="alert" className="border-[var(--erp-danger)] text-sm">
            <p>{reconciliationError}</p>
          </Card>
        ) : null}
        {isReconciling ? (
          <p role="status" className="text-sm text-[var(--erp-muted)]">
            Recalculating selected GRNs...
          </p>
        ) : null}
        {reconciliation ? (
          <div ref={reconciliationStatusRef}>
            <Card aria-live="polite" className="space-y-4 p-6">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-[var(--erp-text)]">Recalculation status</h2>
                  <p role="status" className="text-sm text-[var(--erp-success-text)]">
                    {correctedLineCount} GRN line(s) reconciled; {correctedReceiptCount} stock receipt(s) corrected;{" "}
                    {matchedLineCount} already matched;{" "}
                    {pendingLineCount} pending verification; {blockedLineCount} blocked.
                  </p>
                  <p className="text-sm text-[var(--erp-muted)]">
                    Stock balances were recalculated from FG issue/reversal records and active allocations; changes are audited.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setReconciliation(null)}
                >
                  Dismiss status
                </Button>
              </header>
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
                        {line.stockReceipts.map((receipt) => (
                          <p key={`${receipt.stockType}:${receipt.receiptId}`} className="text-[var(--erp-muted)]">
                            {receipt.stockType} receipt · Qty out {receipt.currentQuantityOut.toLocaleString()} →{" "}
                            {receipt.expectedQuantityOut.toLocaleString()} · Current stock{" "}
                            {receipt.currentStock.toLocaleString()} → {receipt.expectedCurrentStock.toLocaleString()}
                          </p>
                        ))}
                        {line.blockers.map((blocker) => (
                          <p key={blocker} role="alert" className="rounded-md border border-[var(--erp-danger-border)] bg-[var(--erp-danger-bg)] px-3 py-2 text-[var(--erp-danger-text)]">
                            Not recalculated: {blocker}
                          </p>
                        ))}
                        {line.issuedItems.map((item) => (
                          <p key={`${item.requestId}:${item.bookingNo}`} className="rounded-md border border-[var(--erp-warning-border)] bg-[var(--erp-warning-bg)] px-3 py-2 text-[var(--erp-warning-text)]">
                            Size {line.size} for {item.bookingNo}:{" "}
                            {item.quantityIssued > 0 ? `${item.quantityIssued.toLocaleString()} PCS issued` : null}
                            {item.quantityIssued > 0 && item.reservedQuantity > 0 ? " · " : ""}
                            {item.reservedQuantity > 0 ? `${item.reservedQuantity.toLocaleString()} PCS still reserved` : null}
                            {item.quantityIssued === 0 && item.reservedQuantity === 0 ? item.requestStatus : ""}
                            {item.requestNo ? ` — ${item.requestNo} (${item.requestId || "request ID unavailable"})` : ""}.
                            {" "}This usage is from {record.grnNo}; recalculation did not change this stock request.
                          </p>
                        ))}
                        {!line.skipped && line.blockers.length === 0 ? (
                          <p className="text-[var(--erp-success-text)]">
                            {line.changed
                              ? "GRN counters and stock receipt balances recalculated successfully."
                              : "GRN counters and stock receipt balances already match their source records."}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </Card>
                ))}
              </div>
            </Card>
          </div>
        ) : null}
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
                onClick={() => void runReconciliation()}
              >
                {isReconciling ? "Recalculating..." : `Recalculate selected (${selectedIds.length})`}
              </Button>
            )}
            onBulkDeleteSelected={requestBulkDelete}
            bulkDeleteSelectedLabel="Delete selected GRNs"
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
        <Modal
          open={isDeleteDialogOpen}
          onClose={() => {
            if (!isDeleting) setIsDeleteDialogOpen(false);
          }}
          ariaLabelledBy="bulk-delete-work-order-grns-title"
          size="square"
          variant="danger"
          closeOnBackdrop={!isDeleting}
        >
          <div className="space-y-4 p-6">
            <div>
              <h2 id="bulk-delete-work-order-grns-title" className="text-lg font-semibold text-slate-900">
                Delete selected Work Order GRNs?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {selectedIds.length} selected GRN{selectedIds.length === 1 ? "" : "s"} and linked stock allocations will be deleted. Deletion is blocked only when a material issue is linked.
              </p>
            </div>
            {deleteError ? (
              <div role="alert" className="rounded-md border border-[var(--erp-danger-border)] bg-[var(--erp-danger-bg)] px-3 py-2 text-sm text-[var(--erp-danger-text)]">
                <DeleteFailureNotice failure={deleteError} organizationBasePath={deleteIssueBasePath} />
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={() => void deleteSelectedGrns()} disabled={isDeleting}>
                {isDeleting ? "Deleting..." : `Delete ${selectedIds.length} GRN${selectedIds.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </Modal>
      </Section>
    </Page>
  );
}
