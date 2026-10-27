"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { ReportGrid } from "@/components/reports/report-grid-display";
import type {
  OrderQrPrintRequestStatus,
  OrderQrPrintRequestType,
} from "@/lib/services/orders/order-qr-print-request-contract";
import {
  DEFAULT_QR_FIELD_STYLE,
  getA4StickerGrid,
  ORDER_QR_TEMPLATE_FIELDS,
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
  requestedAt: string;
};

const fields: Array<{ key: keyof ReportRow; label: string }> = [
  { key: "orderNo", label: "Order Number" },
  { key: "requestType", label: "Request" },
  { key: "templateName", label: "Template" },
  { key: "status", label: "Status" },
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
}: {
  workspaceId: string;
  organizationId: string;
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
        requestType: request.requestType === "PRINT" ? "Print" : "Download",
        templateName: request.templateName ?? "Order Number only",
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
      const qrDataUrl = await QRCode.toDataURL(record.qrPayload, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: Number.parseInt(record.qrSize, 10),
      });
      const widthPx = Math.max(1, Math.round(record.stickerWidthMm * 96 / 25.4));
      const heightPx = Math.max(1, Math.round(record.stickerLengthMm * 96 / 25.4));
      const resolution = Math.min(2, 4096 / widthPx, 4096 / heightPx);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(widthPx * resolution));
      canvas.height = Math.max(1, Math.round(heightPx * resolution));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is unavailable.");
      context.scale(resolution, resolution);
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, widthPx, heightPx);

      const qrImage = new window.Image();
      await new Promise<void>((resolve, reject) => {
        qrImage.onload = () => resolve();
        qrImage.onerror = () => reject(new Error("QR image could not be loaded."));
        qrImage.src = qrDataUrl;
      });

      const qrExtent = Math.max(1, Math.min(widthPx, heightPx) * 0.52);
      const qrX = widthPx * record.layout.qr.x / 100;
      const qrY = heightPx * record.layout.qr.y / 100;
      context.drawImage(qrImage, qrX, qrY, qrExtent, qrExtent);

      const selectedDisplayFields = record.displayFields;
      selectedDisplayFields.forEach((fieldKey, index) => {
        const label = ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === fieldKey)?.label ?? fieldKey;
        const value = record.displayValues[fieldKey] ?? "";
        const style = {
          ...DEFAULT_QR_FIELD_STYLE,
          ...record.displayFieldStyles[fieldKey],
        };
        const fontSize = Math.max(6, Math.min(style.fontSize, heightPx * 0.3));
        const position = record.layout.fields[fieldKey]
          ?? { x: 44, y: 16 + index * 16 };
        const textX = widthPx * position.x / 100;
        const textY = heightPx * position.y / 100;
        const textWidth = Math.max(1, widthPx - textX);
        context.fillStyle = style.color;
        context.font = `${style.bold ? "700" : "400"} ${fontSize}px Arial, sans-serif`;
        const baseline = Math.min(heightPx - 1, textY + fontSize);
        const displayText = value ? `${label}: ${value}` : label;
        context.fillText(displayText, textX, baseline, textWidth);
        if (style.underline) {
          const textWidthPx = Math.min(textWidth, context.measureText(displayText).width);
          context.strokeStyle = style.color;
          context.lineWidth = Math.max(1, fontSize / 16);
          context.beginPath();
          context.moveTo(textX, baseline + Math.max(1, fontSize / 12));
          context.lineTo(textX + textWidthPx, baseline + Math.max(1, fontSize / 12));
          context.stroke();
        }
      });
      const dataUrl = canvas.toDataURL("image/png");
      if (record.printerType === "LASER") {
        const grid = getA4StickerGrid(
          record.stickerWidthMm,
          record.stickerLengthMm,
          record.pdfPaperSize,
        );
        if (!grid) {
          throw new Error(
            "The sticker does not fit on the selected A4 page. Change the paper orientation or sticker size.",
          );
        }
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({
          orientation: grid.portrait ? "portrait" : "landscape",
          unit: "mm",
          format: "a4",
        });
        for (let row = 0; row < grid.rows; row += 1) {
          for (let column = 0; column < grid.columns; column += 1) {
            pdf.addImage(
              dataUrl,
              "PNG",
              grid.marginMm + column * (record.stickerWidthMm + grid.gapMm),
              grid.marginMm + row * (record.stickerLengthMm + grid.gapMm),
              record.stickerWidthMm,
              record.stickerLengthMm,
            );
          }
        }
        if (printWindow) {
          const pdfUrl = URL.createObjectURL(pdf.output("blob"));
          printWindow.location.assign(pdfUrl);
        } else {
          pdf.save(`order-${record.orderNo}-a4-stickers.pdf`);
        }
        return;
      }
      if (printWindow) {
        const image = printWindow.document.createElement("img");
        image.src = dataUrl;
        image.alt = `QR code for order ${record.orderNo}`;
        image.style.width = `${record.stickerWidthMm}mm`;
        image.style.height = `${record.stickerLengthMm}mm`;
        image.onload = () => {
          const style = printWindow?.document.createElement("style");
          if (style) {
            style.textContent =
              `@page{size:${record.stickerWidthMm}mm ${record.stickerLengthMm}mm;margin:0}` +
              "html,body{width:100%;height:100%;margin:0;padding:0;overflow:hidden}" +
              "img{display:block;object-fit:fill}";
            printWindow?.document.head.append(style);
          }
          printWindow?.focus();
          printWindow?.print();
        };
        printWindow.document.body.replaceChildren(image);
      } else {
        const download = document.createElement("a");
        download.href = dataUrl;
        download.download = `order-${record.orderNo}-sticker.png`;
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

  const visibleRows = rows;
  const orderBaseHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order`;

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
        selectedIds={[]}
        statusOptions={statuses}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
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
    </section>
  );
}
