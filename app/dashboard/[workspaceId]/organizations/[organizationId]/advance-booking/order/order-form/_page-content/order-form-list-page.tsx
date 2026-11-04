"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import { ReportGrid } from "@/components/reports/report-grid-display";
import { toggleVisibleReportSelection } from "@/components/reports/report-grid-filtering";
import Tabs from "@/components/ui/Tabs";
import {
  downloadOrderFormPdf,
  isOrderFormPdfData,
} from "@/lib/services/distribution/order-form-pdf-generator";

type OrderFormQuotationStatus = "not-created" | "created";

const orderFormStatusTabs = [
  { value: "not-created", label: "Order Form (No Quotation)" },
  { value: "created", label: "Quotation Created" },
] as const;

type OrderFormRow = {
  id: string;
  orderFormNo: string;
  orderFormDate: string;
  customer: string;
  contactRole: string;
  status: string;
  quotationId: string | null;
  totalQuantity: number;
  subtotal: string;
  createdAt: string;
};

const fields = [
  { key: "orderFormNo" as const, label: "Order Form No" },
  { key: "customer" as const, label: "Customer / Contact" },
  { key: "contactRole" as const, label: "Contact Role" },
  { key: "status" as const, label: "Status" },
  { key: "totalQuantity" as const, label: "Total Qty" },
  { key: "subtotal" as const, label: "Subtotal" },
  { key: "createdAt" as const, label: "Created Date" },
];

function getOrderFormRowId(row: OrderFormRow) {
  return row.id;
}

function renderOrderFormCell(field: string, row: OrderFormRow) {
  if (field === "createdAt") return row.createdAt.slice(0, 10);
  const value = row[field as keyof OrderFormRow];
  return value === null || value === undefined ? "" : String(value);
}

export default function OrderFormListPage() {
  const params = useParams<{ workspaceId: string; organizationId: string }>();
  const router = useRouter();
  const organizationId = params.organizationId;
  const [rows, setRows] = useState<OrderFormRow[]>([]);
  const [quotationStatus, setQuotationStatus] = useState<OrderFormQuotationStatus>("not-created");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [pdfLoadingOrderFormId, setPdfLoadingOrderFormId] = useState<string | null>(null);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visibleFields, setVisibleFields] = useState<(typeof fields)[number]["key"][]>(fields.map((field) => field.key));
  const listRequestRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);
  const loadRows = useCallback(async (
    cursor?: string,
    status: OrderFormQuotationStatus = quotationStatus,
  ) => {
    if (cursor && loadingMoreRef.current) return;
    loadingMoreRef.current = Boolean(cursor);
    if (cursor) setIsLoadingMore(true);
    else {
      setIsLoading(true);
      setIsLoadingMore(false);
      setNextCursor(null);
    }
    listRequestRef.current?.abort();
    const controller = new AbortController();
    listRequestRef.current = controller;
    setError("");
    try {
      const query = new URLSearchParams({ organizationId, quotationStatus: status });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/distribution/order-forms?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (
        !response.ok ||
        !Array.isArray(data?.orderForms) ||
        !(typeof data.nextCursor === "string" || data.nextCursor === null)
      ) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to load Order Forms.");
      }
      setRows((current) => cursor ? [...current, ...data.orderForms] : data.orderForms);
      setNextCursor(data.nextCursor);
    } catch (loadError) {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load Order Forms.");
      }
    } finally {
      if (listRequestRef.current === controller) {
        listRequestRef.current = null;
        loadingMoreRef.current = false;
        if (cursor) setIsLoadingMore(false);
        else setIsLoading(false);
      }
    }
  }, [organizationId, quotationStatus]);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void loadRows();
    });
    return () => {
      active = false;
      listRequestRef.current?.abort();
      listRequestRef.current = null;
      loadingMoreRef.current = false;
    };
  }, [loadRows]);

  async function createQuotation() {
    if (isCreating || selectedIds.length === 0) return;
    setIsCreating(true);
    setError("");
    try {
      const response = await fetch("/api/distribution/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, orderFormIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.quotation?.id !== "string") {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to create the Quotation.");
      }
      router.push(`/dashboard/${params.workspaceId}/organizations/${organizationId}/advance-booking/quotation/${encodeURIComponent(data.quotation.id)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create the Quotation.");
    } finally {
      setIsCreating(false);
    }
  }

  async function downloadOrderForm(orderFormId: string) {
    if (pdfLoadingOrderFormId) return;
    setPdfLoadingOrderFormId(orderFormId);
    setError("");
    try {
      const query = new URLSearchParams({ organizationId });
      const response = await fetch(
        `/api/distribution/order-forms/${encodeURIComponent(orderFormId)}?${query}`,
        { cache: "no-store" },
      );
      const responseData: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = responseData && typeof responseData === "object" && "error" in responseData &&
          typeof responseData.error === "string"
          ? responseData.error
          : "Unable to load Order Form details for the PDF.";
        throw new Error(message);
      }
      if (!isOrderFormPdfData(responseData)) {
        throw new Error("The Order Form details returned an incomplete PDF document.");
      }
      await downloadOrderFormPdf(responseData);
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "Unable to create the Order Form PDF.");
    } finally {
      setPdfLoadingOrderFormId(null);
    }
  }

  function requestBulkDelete() {
    const selectedIdSet = new Set(selectedIds);
    const selectedRows = rows.filter((row) => selectedIdSet.has(row.id));
    if (selectedRows.length !== selectedIds.length) {
      setError("One or more selected Order Forms are no longer in this report. Refresh and select them again.");
      return;
    }
    if (selectedRows.some((row) => row.status !== "DRAFT" || row.quotationId !== null)) {
      setError("Only unconverted draft Order Forms can be deleted.");
      return;
    }
    setError("");
    setNotice("");
    setIsBulkDeleteDialogOpen(true);
  }

  async function deleteSelectedOrderForms() {
    if (isBulkDeleting || selectedIds.length === 0) return;
    setIsBulkDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/distribution/order-forms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, orderFormIds: selectedIds }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.deleted) || data.deleted.length !== selectedIds.length) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to delete the selected Order Forms.");
      }
      const deletedCount = data.deleted.length;
      setSelectedIds([]);
      setIsBulkDeleteDialogOpen(false);
      setNotice(`Deleted ${deletedCount} Order Form${deletedCount === 1 ? "" : "s"}. Their source bookings remain.`);
      const deletedIds = new Set(selectedIds);
      setRows((current) => current.filter((row) => !deletedIds.has(row.id)));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete the selected Order Forms.");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  return (
    <Card>
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Order Form</h1>
            <p className="text-sm text-slate-600">Create a Quotation from one or more Order Forms.</p>
            <div className="mt-3 w-full max-w-md">
              <Tabs
                ariaLabel="Order Form quotation status"
                tabs={orderFormStatusTabs}
                value={quotationStatus}
                onChange={(status) => {
                  setSelectedIds([]);
                  setRows([]);
                  setNextCursor(null);
                  setError("");
                  setQuotationStatus(status);
                }}
                compact
                scrollable
              />
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={() => void createQuotation()}
            disabled={quotationStatus === "created" || selectedIds.length === 0 || isCreating}
          >
            {isCreating ? "Creating Quotation..." : `Create Quotation${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-emerald-700">{notice}</p> : null}
        <ReportGrid
            title="Order Forms"
            records={rows}
            fields={fields}
            visibleFields={visibleFields}
            onVisibleFieldsChange={(nextFields) => setVisibleFields(nextFields as (typeof fields)[number]["key"][])}
            storageKey={`distribution-order-form-list-v3:${organizationId}`}
            legacyStorageKey="distribution-order-form-list"
            legacyFieldsToAdd={["contactRole"]}
            rowIdSelector={getOrderFormRowId}
            selectedIds={selectedIds}
            selectable
            onToggleSelectAll={(checked, recordIds) =>
              setSelectedIds((current) => toggleVisibleReportSelection(current, recordIds, checked))
            }
            onToggleRowSelection={(recordId, checked) => {
              setSelectedIds((current) =>
                checked ? [...new Set([...current, recordId])] : current.filter((id) => id !== recordId),
              );
            }}
            rowSelectable={(row) => row.status === "DRAFT" && row.quotationId === null}
            onSecondaryRowAction={(id) => void downloadOrderForm(id)}
            secondaryRowActionLabel="Order Form PDF"
            secondaryRowActionDisabledSelector={(row) =>
              isLoading || pdfLoadingOrderFormId !== null || !row.id
            }
            secondaryRowActionLabelSelector={(row) =>
              pdfLoadingOrderFormId === row.id ? "Preparing PDF..." : "Order Form PDF"
            }
            onBulkDeleteSelected={requestBulkDelete}
            bulkDeleteSelectedLabel="Delete Order Forms"
            renderCell={renderOrderFormCell}
            isLoading={isLoading}
            emptyMessage={isLoading
              ? "Loading Order Forms..."
              : quotationStatus === "created"
                ? "No Order Forms have been converted to a Quotation yet."
                : "No draft Order Forms are waiting for a Quotation."}
          />
        {nextCursor ? (
          <div className="flex justify-center">
            <Button type="button" variant="secondary" onClick={() => void loadRows(nextCursor)} disabled={isLoadingMore}>
              {isLoadingMore ? "Loading Order Forms..." : "Load more Order Forms"}
            </Button>
          </div>
        ) : null}
      </div>
      <Modal
        open={isBulkDeleteDialogOpen}
        onClose={() => {
          if (!isBulkDeleting) setIsBulkDeleteDialogOpen(false);
        }}
        ariaLabelledBy="bulk-delete-order-forms-title"
        size="square"
        variant="danger"
        closeOnBackdrop={!isBulkDeleting}
      >
        <div className="space-y-4 p-6">
          <div>
            <h2 id="bulk-delete-order-forms-title" className="text-lg font-semibold text-slate-900">Delete selected Order Forms?</h2>
            <p className="mt-2 text-sm text-slate-600">
              {selectedIds.length} draft Order Form{selectedIds.length === 1 ? "" : "s"} will be deleted. Their source bookings will remain.
            </p>
          </div>
          {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setIsBulkDeleteDialogOpen(false)} disabled={isBulkDeleting}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void deleteSelectedOrderForms()} disabled={isBulkDeleting}>
              {isBulkDeleting ? "Deleting..." : `Delete ${selectedIds.length} Order Form${selectedIds.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
