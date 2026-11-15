"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { ReportGrid } from "@/components/reports/report-grid-display";

type WorkOrderReport = {
  id: string;
  workOrderNo: string;
  orderNo: string;
  article: string | null;
  styleName: string | null;
  totalQty: number;
  status: string;
  createdAt: string;
  sizeLines: Array<{ size: string; quantity: number }>;
};

type WorkOrderField = "workOrderNo" | "orderNo" | "article" | "styleName" | "sizeQuantities" | "totalQty" | "createdAt" | "status";

const reportFields: Array<{ key: WorkOrderField; label: string }> = [
  { key: "workOrderNo", label: "Work Order No" },
  { key: "orderNo", label: "Order No" },
  { key: "article", label: "Article" },
  { key: "styleName", label: "Style Name" },
  { key: "sizeQuantities", label: "Size Quantities" },
  { key: "totalQty", label: "Total Qty" },
  { key: "createdAt", label: "Created Date" },
  { key: "status", label: "Status" },
];

export default function WorkOrderReportTable() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params?.organizationId ?? "demo-org";
  const workspaceId = params?.workspaceId ?? "demo";
  const [records, setRecords] = useState<WorkOrderReport[]>([]);
  const [visibleFields, setVisibleFields] = useState<WorkOrderField[]>(reportFields.map((field) => field.key));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      setError("");
      const response = await fetch(`/api/factory/work-orders?organizationId=${encodeURIComponent(organizationId)}&limit=100`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load work orders.");
      if (active) {
        setRecords(Array.isArray(data.workOrders) ? data.workOrders : []);
        setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      }
    }).catch(() => {
      if (active) {
        setRecords([]);
        setError("Unable to load work orders. Please refresh and try again.");
      }
    });
    return () => { active = false; };
  }, [organizationId]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, limit: "100", cursor: nextCursor });
      const response = await fetch(`/api/factory/work-orders?${query.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load more work orders.");
      const page = Array.isArray(data.workOrders) ? data.workOrders as WorkOrderReport[] : [];
      setRecords((current) => {
        const ids = new Set(current.map((record) => record.id));
        return [...current, ...page.filter((record) => !ids.has(record.id))];
      });
      setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load more work orders.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function deleteSelectedWorkOrders() {
    if (isDeleting || selectedIds.length === 0) return;
    setIsDeleting(true);
    setDeleteError("");
    setDeleteNotice("");
    try {
      const response = await fetch("/api/factory/work-orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, workOrderIds: selectedIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete selected work orders.");

      const deletedIds = new Set(selectedIds);
      setRecords((current) => current.filter((record) => !deletedIds.has(record.id)));
      setSelectedIds([]);
      setNextCursor(null);
      setIsDeleteDialogOpen(false);
      setDeleteNotice(`${selectedIds.length} work order${selectedIds.length === 1 ? "" : "s"} deleted.`);

      const query = new URLSearchParams({ organizationId, limit: "100" });
      const refreshResponse = await fetch(`/api/factory/work-orders?${query.toString()}`, { cache: "no-store" });
      const refreshed = await refreshResponse.json();
      if (refreshResponse.ok) {
        setRecords(Array.isArray(refreshed.workOrders) ? refreshed.workOrders : []);
        setNextCursor(typeof refreshed.nextCursor === "string" ? refreshed.nextCursor : null);
      } else {
        setError("Work orders were deleted, but the report could not refresh. Reload the page to see the latest list.");
      }
    } catch (deleteFailure) {
      setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : "Unable to delete selected work orders.");
    } finally {
      setIsDeleting(false);
    }
  }

  const reportRows = useMemo(() => records.map((record) => ({
    ...record,
    sizeQuantities: record.sizeLines.map((line) => `${line.size}: ${line.quantity.toLocaleString("en-IN")}`).join(" | "),
  })), [records]);
  const recordRowsById = useMemo(() => new Map(reportRows.map((row) => [row.id, row] as const)), [reportRows]);

  return (
    <Card className="p-3 shadow-none border-slate-200">
      {error && <p role="alert" className="mb-3 rounded-lg border border-[var(--erp-danger-border)] bg-[var(--erp-danger-bg)] px-3 py-2 text-sm text-[var(--erp-danger-text)]">{error}</p>}
      {deleteNotice && <p role="status" className="mb-3 text-sm text-[var(--erp-success-text)]">{deleteNotice}</p>}
      <ReportGrid
        title="Work Orders"
        records={reportRows}
        fields={reportFields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={(fields) => setVisibleFields(fields as WorkOrderField[])}
        storageKey={`credence-craft-work-orders-${organizationId}`}
        rowIdSelector={(row) => row.id}
        selectedIds={selectedIds}
        onRowClick={(recordId) => {
          const selectedRecord = recordRowsById.get(recordId);
          const orderNo = selectedRecord?.orderNo ?? "";
          const target = orderNo
            ? `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/work-orders/${recordId}?orderNo=${encodeURIComponent(orderNo)}`
            : `/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/work-orders/${recordId}`;
          router.push(target);
        }}
        onToggleSelectAll={(checked, recordIds) => setSelectedIds((current) => {
          if (checked) return [...new Set([...current, ...recordIds])];
          const deselectedIds = new Set(recordIds);
          return current.filter((id) => !deselectedIds.has(id));
        })}
        onToggleRowSelection={(id, checked) => setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))}
        onDeleteSelected={() => {
          if (isDeleting) return;
          setDeleteError("");
          setIsDeleteDialogOpen(true);
        }}
        deleteSelectedLabel="Delete Work Orders"
        onNewOrder={() => router.push(`/dashboard/${workspaceId}/organizations/${organizationId}/factory-management/pre-production/work-order/dashboard/create`)}
        renderCell={(fieldKey, row) => fieldKey === "createdAt" ? new Date(row.createdAt).toLocaleDateString("en-IN") : fieldKey === "totalQty" ? row.totalQty.toLocaleString("en-IN") : String(row[fieldKey as keyof typeof row] ?? "")}
        emptyMessage="No work orders have been created yet."
      />
      {nextCursor && <div className="mt-4 flex justify-center"><Button type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading..." : "Load more work orders"}</Button></div>}
      <Modal
        open={isDeleteDialogOpen}
        onClose={() => {
          if (!isDeleting) setIsDeleteDialogOpen(false);
        }}
        ariaLabelledBy="bulk-delete-work-orders-title"
        size="square"
        variant="danger"
        closeOnBackdrop={!isDeleting}
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="bulk-delete-work-orders-title" className="text-lg font-semibold text-slate-900">
              Delete selected work orders?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {selectedIds.length} selected work order{selectedIds.length === 1 ? "" : "s"} will be deleted together. Only untouched OPEN work orders without production, booking, or inventory history can be deleted.
            </p>
          </div>
          {deleteError ? (
            <div role="alert" className="rounded-md border border-[var(--erp-danger-border)] bg-[var(--erp-danger-bg)] px-3 py-2 text-sm text-[var(--erp-danger-text)]">
              {deleteError}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteSelectedWorkOrders()} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : `Delete ${selectedIds.length} Work Order${selectedIds.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
