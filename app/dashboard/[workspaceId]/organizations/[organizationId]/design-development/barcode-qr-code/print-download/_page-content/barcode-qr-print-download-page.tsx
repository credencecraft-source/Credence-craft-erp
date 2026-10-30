"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { ReportGrid } from "@/components/reports/report-grid-display";
import Modal from "@/components/ui/Modal";
import {
  createOrderQrPrintPdf,
  createOrderQrStickerDataUrls,
} from "@/components/erp/order-qr-print-output";
import type {
  OrderQrPrintRequestStatus,
  OrderQrPrintRequestType,
} from "@/lib/services/orders/order-qr-print-request-contract";
import {
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateLayout,
  type OrderQrTemplateFieldKey,
} from "@/lib/services/orders/order-qr-template-contract";

type RequestRecord = {
  id: string;
  orderId: string;
  orderNo: string;
  requestType: OrderQrPrintRequestType;
  status: OrderQrPrintRequestStatus;
  templateName: string | null;
  qrFieldKey: OrderQrTemplateFieldKey;
  displayFields: OrderQrTemplateFieldKey[];
  displayValues: Partial<Record<OrderQrTemplateFieldKey, string>>;
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  printerType: OrderQrTemplateLayout["printerType"];
  pdfPaperSize: OrderQrTemplateLayout["pdfPaperSize"];
  qrSize: number;
  stickerWidthMm: number;
  stickerLengthMm: number;
  qrPayload: string;
  printQuantity: number;
  bulkItems: Array<{
    orderId: string;
    orderNo: string;
    styleName: string;
    quantity: number;
    qrPayload: string;
    displayValues: Partial<Record<OrderQrTemplateFieldKey, string>>;
  }>;
  requestedAt: string;
};

type ReportRow = {
  id: string;
  orderId: string;
  orderNo: string;
  requestType: string;
  templateName: string;
  status: string;
  qrSize: string;
  stickerWidthMm: number;
  stickerLengthMm: number;
  qrFieldKey: OrderQrTemplateFieldKey;
  displayFields: OrderQrTemplateFieldKey[];
  displayValues: Partial<Record<OrderQrTemplateFieldKey, string>>;
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  printerType: OrderQrTemplateLayout["printerType"];
  pdfPaperSize: OrderQrTemplateLayout["pdfPaperSize"];
  qrPayload: string;
  printQuantity: number;
  bulkItems: RequestRecord["bulkItems"];
  requestedAt: string;
};

const fields: Array<{ key: keyof ReportRow; label: string }> = [
  { key: "orderNo", label: "Order Number" },
  { key: "requestType", label: "Request" },
  { key: "templateName", label: "Template" },
  { key: "status", label: "Status" },
  { key: "printQuantity", label: "Print Quantity" },
  { key: "printerType", label: "Printer" },
  { key: "pdfPaperSize", label: "PDF Paper" },
  { key: "qrSize", label: "QR Size" },
  { key: "stickerWidthMm", label: "Sticker Width (mm)" },
  { key: "stickerLengthMm", label: "Sticker Length (mm)" },
  { key: "requestedAt", label: "Requested At" },
];
const statuses = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"] as const;

export default function BarcodeQrPrintDownloadPage({
  workspaceId,
  organizationId,
  canManage,
}: {
  workspaceId: string;
  organizationId: string;
  canManage: boolean;
}) {
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [visibleFields, setVisibleFields] = useState<Array<keyof ReportRow>>(
    fields.map(({ key }) => key),
  );
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [updatingId, setUpdatingId] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const router = useRouter();

  const query = useMemo(
    () => new URLSearchParams({ organizationId, workspaceId }),
    [organizationId, workspaceId],
  );

  useEffect(() => {
    let active = true;
    void fetch(`/api/orders/qr-print-requests?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load QR print/download requests.");
        }
        return data as { requests: RequestRecord[] };
      })
      .then(({ requests: loadedRequests }) => {
        if (!active) return;
        setRequests(loadedRequests);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(
          error instanceof Error ? error.message : "Unable to load QR print/download requests.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt, query]);

  const rows = useMemo<ReportRow[]>(
    () => requests
      .filter((request) => selectedStatus === "ALL" || request.status === selectedStatus)
      .map((request) => ({
        id: request.id,
        orderId: request.orderId,
        orderNo: request.orderNo,
        requestType: request.bulkItems.length > 0
          ? "Bulk QR Request"
          : request.requestType === "PRINT" ? "Print" : "Download",
        templateName: request.templateName ?? "Saved template unavailable",
        status: request.status,
        qrSize: `${request.qrSize} px`,
        stickerWidthMm: request.stickerWidthMm,
        stickerLengthMm: request.stickerLengthMm,
        qrFieldKey: request.qrFieldKey,
        displayFields: request.displayFields,
        displayValues: request.displayValues,
        displayFieldStyles: request.displayFieldStyles,
        layout: request.layout,
        printerType: request.layout.printerType,
        pdfPaperSize: request.layout.pdfPaperSize,
        qrPayload: request.qrPayload,
        printQuantity: request.printQuantity,
        bulkItems: request.bulkItems,
        requestedAt: new Date(request.requestedAt).toLocaleString(),
      })),
    [requests, selectedStatus],
  );

  const advanceStatus = async (record: ReportRow) => {
    const targetStatus = record.status === "PENDING" ? "IN_PROGRESS" : "COMPLETED";
    setUpdatingId(record.id);
    setActionError("");
    try {
      const response = await fetch(
        `/api/orders/qr-print-requests/${encodeURIComponent(record.id)}?${query}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: targetStatus }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to update the request status.");
      }
      setRequests((current) => current.map((request) =>
        request.id === record.id
          ? { ...request, status: targetStatus }
          : request,
      ));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to update the request status.",
      );
    } finally {
      setUpdatingId("");
    }
  };

  const processOutputRequest = async (record: ReportRow) => {
    let printWindow: Window | null = null;
    if (record.requestType === "Print") {
      printWindow = window.open("", "_blank");
      if (!printWindow) {
        setActionError("Allow pop-ups to open the QR print view.");
        return;
      }
      printWindow.opener = null;
      printWindow.document.title = `QR - ${record.orderNo}`;
      printWindow.document.body.textContent = "Preparing QR code...";
    }

    setActionError("");
    try {
      const stickerDataUrls = await createOrderQrStickerDataUrls(record);
      const pdfBlob = await createOrderQrPrintPdf(record, stickerDataUrls);
      if (printWindow) {
        printWindow.location.assign(URL.createObjectURL(pdfBlob));
      } else {
        const download = document.createElement("a");
        download.href = URL.createObjectURL(pdfBlob);
        download.download = record.printerType === "LASER"
          ? `order-${record.orderNo}-a4-stickers.pdf`
          : `order-${record.orderNo}-sticker-labels.pdf`;
        download.click();
      }
    } catch (error) {
      printWindow?.close();
      console.error("Unable to process QR print/download request.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      setActionError("Unable to prepare the QR output. Try again or contact support.");
    }
  };

  const requestDelete = (ids: string[]) => {
    setDeleteIds(ids);
    setActionError("");
  };

  const deleteSelectedRequests = async () => {
    setIsDeleting(true);
    setActionError("");
    try {
      const response = await fetch(`/api/orders/qr-print-requests?${query}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteIds }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to delete QR print/download requests.");
      }
      const deletedIds = new Set(deleteIds);
      setRequests((current) => current.filter((request) => !deletedIds.has(request.id)));
      setSelectedIds((current) => current.filter((id) => !deletedIds.has(id)));
      setNotice(`${data.deletedCount} pending request${data.deletedCount === 1 ? "" : "s"} deleted.`);
      setDeleteIds([]);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Unable to delete QR print/download requests.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const visibleRows = rows;
  const orderBaseHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`;
  const requestBaseHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/print-download`;
  return (
    <section className="min-w-0 space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Print/Download</h1>
        <p className="text-sm text-slate-600">
          Review QR print and download requests submitted from merchandising orders.
        </p>
      </header>

      {loadError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
          <span>{loadError}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {actionError && (
        <p className="text-sm text-[var(--erp-danger)]" role="alert">{actionError}</p>
      )}
      {notice && <p className="text-sm text-[var(--erp-success)]" role="status">{notice}</p>}

      <ReportGrid
        title="QR Print/Download Request Report"
        records={visibleRows}
        fields={fields}
        visibleFields={visibleFields}
        onVisibleFieldsChange={(nextFields) =>
          setVisibleFields(nextFields as Array<keyof ReportRow>)
        }
        storageKey={`barcode-qr-print-download-requests:${organizationId}`}
        rowIdSelector={(record) => record.id}
        selectedIds={selectedIds}
        selectable={canManage}
        rowSelectable={(record) => record.status === "PENDING"}
        onToggleSelectAll={(checked, recordIds) =>
          setSelectedIds((current) => checked
            ? [...new Set([...current, ...recordIds])]
            : current.filter((id) => !recordIds.includes(id)))
        }
        onToggleRowSelection={(recordId, checked) =>
          setSelectedIds((current) => checked
            ? [...new Set([...current, recordId])]
            : current.filter((id) => id !== recordId))
        }
        onBulkDeleteSelected={canManage ? () => requestDelete(selectedIds) : undefined}
        bulkDeleteSelectedLabel="Delete pending"
        statusOptions={statuses}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        onRecordClick={(record) => router.push(
          `${requestBaseHref}/${encodeURIComponent(record.id)}`,
        )}
        toolbarActions={(
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isLoading}
            onClick={() => {
              setIsLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Refresh
          </Button>
        )}
        rowActions={(record) => (
          <div className="flex flex-wrap items-center gap-2">
            {record.bulkItems.length > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => router.push(`${requestBaseHref}/${encodeURIComponent(record.id)}`)}
              >
                Review bulk request
              </Button>
            ) : (
              <>
                <Link
                  href={`${orderBaseHref}/${encodeURIComponent(record.orderId)}`}
                  className="text-sm font-medium text-[var(--erp-brand)] hover:underline"
                >
                  Open Order
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void processOutputRequest(record)}
                >
                  {record.printerType === "LASER"
                    ? record.requestType === "Print" ? "Open A4 PDF" : "Download A4 PDF"
                    : record.requestType === "Print" ? "Print Sticker" : "Download Sticker"}
                </Button>
              </>
            )}
            {record.status !== "COMPLETED" && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={updatingId === record.id}
                onClick={() => void advanceStatus(record)}
              >
                {updatingId === record.id
                  ? "Saving..."
                  : record.status === "PENDING" ? "Start" : "Complete"}
              </Button>
            )}
            {canManage && record.status === "PENDING" && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => requestDelete([record.id])}
              >
                Delete
              </Button>
            )}
          </div>
        )}
        renderCell={(fieldKey, record) => {
          if (fieldKey === "status") {
            return <Badge>{record.status.replaceAll("_", " ")}</Badge>;
          }
          if (fieldKey === "printerType") {
            return record.printerType === "LASER" ? "Laser Printer" : "Barcode Printer";
          }
          if (fieldKey === "pdfPaperSize") {
            return record.pdfPaperSize === "A4_PORTRAIT"
              ? "A4 Portrait"
              : record.pdfPaperSize === "A4_LANDSCAPE"
                ? "A4 Landscape"
                : "A4 Automatic";
          }
          return String(record[fieldKey as keyof ReportRow] ?? "");
        }}
        emptyMessage={selectedStatus === "ALL"
          ? "No print/download requests have been submitted."
          : `No ${selectedStatus.replaceAll("_", " ").toLowerCase()} requests found.`}
        isLoading={isLoading}
      />
      {deleteIds.length > 0 && (
        <Modal
          open
          onClose={() => {
            if (!isDeleting) setDeleteIds([]);
          }}
          ariaLabelledBy="delete-qr-requests-title"
          size="square"
          variant="danger"
          closeOnBackdrop={!isDeleting}
        >
          <div className="space-y-4 p-6">
            <div>
              <h2 id="delete-qr-requests-title" className="text-lg font-semibold text-slate-900">
                Delete selected pending requests?
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {deleteIds.length} pending QR print/download request{deleteIds.length === 1 ? "" : "s"} will be removed. In-progress and completed requests are retained.
              </p>
            </div>
            {actionError && <p className="text-sm text-[var(--erp-danger)]" role="alert">{actionError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setDeleteIds([])}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void deleteSelectedRequests()}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : `Delete ${deleteIds.length} request${deleteIds.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
