"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

import OrderQrStickerPreview from "@/components/erp/order-qr-sticker-preview";
import {
  createOrderQrPrintPdf,
  createOrderQrStickerSamples,
} from "@/components/erp/order-qr-print-output";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Table from "@/components/ui/Table";
import { getA4StickerGrid, ORDER_QR_TEMPLATE_FIELDS } from "@/lib/services/orders/order-qr-template-contract";
import { getOrderQrPrintPreviewMode } from "@/lib/services/orders/order-qr-print-request-contract";
import type { OrderQrPrintRequestRecord } from "@/lib/services/orders/order-qr-print-request-service";

export default function BarcodeQrPrintRequestDetailPage({
  workspaceId,
  organizationId,
  request: initialRequest,
}: {
  workspaceId: string;
  organizationId: string;
  request: OrderQrPrintRequestRecord;
}) {
  const request = initialRequest;
  const [stickerDataUrls, setStickerDataUrls] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [outputError, setOutputError] = useState("");
  const [isPreparingOutput, setIsPreparingOutput] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const [outputType, setOutputType] = useState<"print" | "download" | null>(null);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void createOrderQrStickerSamples(request)
      .then((dataUrls) => {
        if (active) setStickerDataUrls(dataUrls);
      })
      .catch((error: unknown) => {
        if (active) {
          setPreviewError(
            error instanceof Error ? error.message : "Unable to prepare the sticker preview.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [request]);

  const previewMode = getOrderQrPrintPreviewMode(
    request.layout.printerType,
    Boolean(request.pageSetup),
  );
  const usesPageSetupSheet = previewMode === "page-setup-sheet";
  const grid = useMemo(
    () => usesPageSetupSheet
      ? getA4StickerGrid(
        request.stickerWidthMm,
        request.stickerLengthMm,
        request.layout.pdfPaperSize,
        request.pageSetup,
      )
      : null,
    [request, usesPageSetupSheet],
  );
  const pageCount = Math.max(
    1,
    Math.ceil(request.printQuantity / (grid?.count ?? 1)),
  );
  const pageIndexes = grid
    ? Array.from(
      { length: Math.max(0, Math.min(grid.count, request.printQuantity - previewPage * grid.count)) },
      (_, index) => previewPage * grid.count + index,
    )
    : [previewPage];
  const getStickerForLabel = (labelIndex: number) => {
    if (!request.bulkItems.length) return stickerDataUrls[0] ?? "";
    let orderLabelStart = 0;
    for (let index = 0; index < request.bulkItems.length; index += 1) {
      const item = request.bulkItems[index];
      if (labelIndex < orderLabelStart + item.quantity) return stickerDataUrls[index] ?? "";
      orderLabelStart += item.quantity;
    }
    return stickerDataUrls[0] ?? "";
  };
  const barcodeOrderIndex = request.bulkItems.length
    ? request.bulkItems.findIndex((_, index) => {
      let totalQuantity = 0;
      for (let previous = 0; previous <= index; previous += 1) {
        totalQuantity += request.bulkItems[previous].quantity;
      }
      return previewPage < totalQuantity;
    })
    : 0;
  const activeBulkItem = request.bulkItems[barcodeOrderIndex];
  const previewDisplayValues = activeBulkItem?.displayValues ?? request.displayValues;
  const previewFields = request.displayFields.map((fieldKey) => ({
    key: fieldKey,
    label: ORDER_QR_TEMPLATE_FIELDS.find(({ key }) => key === fieldKey)?.label ?? fieldKey,
    value: previewDisplayValues[fieldKey] ?? "",
    style: request.displayFieldStyles[fieldKey],
  }));
  const requestListHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/print-download`;
  const orderHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/order-management/merchandising/order/${encodeURIComponent(request.orderId)}`;

  const createOutput = async (type: "print" | "download") => {
    const printWindow = type === "print" ? window.open("", "_blank") : null;
    if (type === "print" && !printWindow) {
      setOutputError("Allow pop-ups to open the print output.");
      return;
    }

    setOutputError("");
    setIsPreparingOutput(true);
    setOutputType(type);
    try {
      const currentStickers = stickerDataUrls.length
        ? stickerDataUrls
        : await createOrderQrStickerSamples(request);
      const pdf = await createOrderQrPrintPdf(request, currentStickers);
      const pdfUrl = URL.createObjectURL(pdf);
      if (printWindow) {
        printWindow.opener = null;
        printWindow.location.assign(pdfUrl);
      } else {
        const download = document.createElement("a");
        download.href = pdfUrl;
        download.download = usesPageSetupSheet
          ? `order-${request.orderNo}-${request.pageSetup?.paperSize.toLowerCase() ?? "a4"}-stickers.pdf`
          : `order-${request.orderNo}-sticker-labels.pdf`;
        download.click();
        window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
      }
    } catch (error) {
      printWindow?.close();
      console.error("Unable to create order QR print output.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      setOutputError(error instanceof Error
        ? error.message
        : "Unable to prepare the print output.");
    } finally {
      setIsPreparingOutput(false);
      setOutputType(null);
    }
  };

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={requestListHref}
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--erp-brand)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Print/Download requests
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">
            QR Print Request · {request.orderNo}
          </h1>
          <p className="text-sm text-[var(--erp-text-muted)]">
            Saved request design and print-ready preview.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => router.push(orderHref)}
          >
            Open Order
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!stickerDataUrls.length || isPreparingOutput || Boolean(previewError)
              || (request.layout.printerType === "LASER" && !request.pageSetup)}
            onClick={() => void createOutput("print")}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            {outputType === "print" ? "Preparing..." : "Print"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!stickerDataUrls.length || isPreparingOutput || Boolean(previewError)
              || (request.layout.printerType === "LASER" && !request.pageSetup)}
            onClick={() => void createOutput("download")}
          >
            {outputType === "download" ? "Preparing..." : "Download PDF"}
          </Button>
        </div>
      </header>

      {outputError && <p className="text-sm text-[var(--erp-danger)]" role="alert">{outputError}</p>}
      {request.layout.printerType === "LASER" && !request.pageSetup && (
        <p className="text-sm text-[var(--erp-text-muted)]" role="status">
          This request has no assigned Page Setup. Update its QR template and create a new request.
        </p>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Card className="min-w-0 space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Print Preview</h2>
              <p className="mt-1 text-sm text-[var(--erp-text-muted)]">
                {previewMode === "page-setup-required"
                  ? "Page Setup unavailable for this legacy request"
                  : usesPageSetupSheet
                    ? `${request.pageSetup?.paperSize} ${grid?.portrait ? "Portrait" : "Landscape"} sheet`
                    : "Barcode printer sticker"}
                {previewMode !== "page-setup-required" && (
                  <>
                    {" "}· sticker {request.stickerWidthMm} × {request.stickerLengthMm} mm
                    {" "}· {request.printQuantity} label{request.printQuantity === 1 ? "" : "s"}
                  </>
                )}
              </p>
            </div>
            <Badge>{request.status.replaceAll("_", " ")}</Badge>
          </div>

          {!stickerDataUrls.length && !previewError && (
            <p className="text-sm text-[var(--erp-text-muted)]" role="status">
              Preparing saved QR artwork...
            </p>
          )}
          {previewError && <p className="text-sm text-[var(--erp-danger)]" role="alert">{previewError}</p>}
          {previewMode === "page-setup-required" && (
            <p className="text-sm text-[var(--erp-text-muted)]" role="status">
              No sheet preview is available because this request predates template-assigned Page Setup.
            </p>
          )}
          {stickerDataUrls.length > 0 && usesPageSetupSheet && grid && (
            <>
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">
                    Sheet {previewPage + 1} of {pageCount}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={previewPage === 0}
                      onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={previewPage + 1 >= pageCount}
                      onClick={() => setPreviewPage((page) => Math.min(pageCount - 1, page + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
              <div
                className="relative mx-auto overflow-hidden border border-[var(--erp-border)] bg-white shadow-sm"
                aria-label={`${request.pageSetup?.paperSize} ${grid.portrait ? "portrait" : "landscape"} print sheet`}
                role="img"
                style={{
                  width: grid.portrait ? "min(100%, 28rem)" : "min(100%, 48rem)",
                  aspectRatio: `${grid.pageWidthMm} / ${grid.pageHeightMm}`,
                }}
              >
                {pageIndexes.map((labelIndex) => {
                  const indexOnPage = labelIndex % grid.count;
                  const row = Math.floor(indexOnPage / grid.columns);
                  const column = indexOnPage % grid.columns;
                  return (
                    <div
                      key={labelIndex}
                      className="absolute overflow-hidden border border-dashed border-[var(--erp-brand)]"
                      style={{
                        left: `${(grid.marginLeftMm + column * (
                          request.stickerWidthMm + grid.horizontalGapMm
                        )) / grid.pageWidthMm * 100}%`,
                        top: `${(grid.marginTopMm + row * (
                          request.stickerLengthMm + grid.verticalGapMm
                        )) / grid.pageHeightMm * 100}%`,
                        width: `${request.stickerWidthMm / grid.pageWidthMm * 100}%`,
                        aspectRatio: `${request.stickerWidthMm} / ${request.stickerLengthMm}`,
                      }}
                    >
                      <Image
                        src={getStickerForLabel(labelIndex)}
                        alt=""
                        fill
                        unoptimized
                        className="object-fill"
                      />
                    </div>
                  );
                })}
              </div>
              <p className="text-center text-xs text-[var(--erp-text-muted)]">
                {pageIndexes.length} labels positioned on this {request.pageSetup?.paperSize} sheet.
              </p>
            </>
          )}
          {stickerDataUrls.length > 0 && usesPageSetupSheet && !grid && (
            <p className="text-sm text-[var(--erp-danger)]" role="alert">
              The configured sticker dimensions do not fit the selected paper setup.
            </p>
          )}
          {stickerDataUrls.length > 0 && previewMode === "single-sticker" && (
            <div className="mx-auto w-full max-w-2xl space-y-2">
              {pageCount > 1 && (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-900">
                    Label {previewPage + 1} of {request.printQuantity}
                    {request.bulkItems[barcodeOrderIndex]
                      ? ` · ${request.bulkItems[barcodeOrderIndex].orderNo}`
                      : ""}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={previewPage === 0}
                      onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={previewPage + 1 >= request.printQuantity}
                      onClick={() => setPreviewPage((page) =>
                        Math.min(request.printQuantity - 1, page + 1),
                      )}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
              <OrderQrStickerPreview
                qrDataUrl={getStickerForLabel(previewPage)}
                fields={previewFields}
                layout={request.layout}
                stickerWidthMm={request.stickerWidthMm}
                stickerLengthMm={request.stickerLengthMm}
                qrAlt={`QR code for order ${activeBulkItem?.orderNo ?? request.orderNo}`}
              />
              <p className="text-center text-xs text-[var(--erp-text-muted)]">
                Actual label size: {request.stickerWidthMm} × {request.stickerLengthMm} mm ·
                {" "}{request.printQuantity} label{request.printQuantity === 1 ? "" : "s"} in output
              </p>
            </div>
          )}
        </Card>

        <Card className="h-fit space-y-4 p-6">
          <h2 className="text-base font-semibold text-slate-900">Request Details</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <dt className="text-[var(--erp-text-muted)]">Template</dt>
            <dd className="font-medium text-slate-900">{request.templateName ?? "Unavailable"}</dd>
            <dt className="text-[var(--erp-text-muted)]">Request</dt>
            <dd className="font-medium text-slate-900">
              {request.bulkItems.length ? "Bulk QR request · output choice by Design & Development" : request.requestType}
            </dd>
            <dt className="text-[var(--erp-text-muted)]">Printer</dt>
            <dd className="font-medium text-slate-900">
              {request.pageSetup
                ? "Page Setup sheet"
                : request.layout.printerType === "LASER" ? "Laser Printer" : "Barcode Printer"}
            </dd>
            <dt className="text-[var(--erp-text-muted)]">Paper</dt>
            <dd className="font-medium text-slate-900">
              {previewMode === "page-setup-required"
                ? "Unavailable"
                : usesPageSetupSheet
                  ? `${request.pageSetup?.paperSize} ${grid?.portrait ? "Portrait" : "Landscape"}`
                  : "Sticker size"}
            </dd>
            {request.pageSetup && (
              <>
                <dt className="text-[var(--erp-text-muted)]">Page Setup</dt>
                <dd className="font-medium text-slate-900">{request.pageSetup.name}</dd>
              </>
            )}
            <dt className="text-[var(--erp-text-muted)]">Sticker</dt>
            <dd className="font-medium text-slate-900">
              {request.stickerWidthMm} × {request.stickerLengthMm} mm
            </dd>
            <dt className="text-[var(--erp-text-muted)]">Print quantity</dt>
            <dd className="font-medium text-slate-900">{request.printQuantity}</dd>
            <dt className="text-[var(--erp-text-muted)]">QR field</dt>
            <dd className="font-medium text-slate-900">
              {ORDER_QR_TEMPLATE_FIELDS.find(({ key }) => key === request.qrFieldKey)?.label
                ?? request.qrFieldKey}
            </dd>
            <dt className="text-[var(--erp-text-muted)]">Requested</dt>
            <dd className="font-medium text-slate-900">
              {new Date(request.requestedAt).toLocaleString()}
            </dd>
          </dl>
          {request.pageSetup ? (
            <div className="space-y-2 border-t border-[var(--erp-border)] pt-4">
              <p className="text-sm font-medium text-slate-900">
                Page Setup: {request.pageSetup.name}
              </p>
              <p className="text-xs text-[var(--erp-text-muted)]">
                {request.pageSetup.marginTopMm} / {request.pageSetup.marginBottomMm} mm top/bottom
                {" · "}{request.pageSetup.marginLeftMm} / {request.pageSetup.marginRightMm} mm left/right
                {" · "}{request.pageSetup.horizontalGapMm} × {request.pageSetup.verticalGapMm} mm gaps
              </p>
              <p className="text-xs text-[var(--erp-text-muted)]">
                Assigned by QR template. Change the setup in the template before creating another request.
              </p>
            </div>
          ) : request.layout.printerType === "LASER" ? (
            <p
              className="border-t border-[var(--erp-warning-border)] bg-[var(--erp-warning-bg)] px-3 py-2 text-sm text-[var(--erp-warning-text)]"
              role="status"
            >
              This legacy request has no assigned Page Setup and cannot be printed as a sheet.
              Update the QR template and create a new request.
            </p>
          ) : null}
          {request.bulkItems.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Orders in this request ({request.bulkItems.length})
              </h3>
              <Table className="max-h-72 overflow-y-auto">
                <thead className="sticky top-0 bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-text-muted)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">Order No</th>
                    <th scope="col" className="px-3 py-2">Style</th>
                    <th scope="col" className="px-3 py-2 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {request.bulkItems.map((item) => (
                    <tr key={item.orderId}>
                      <td className="px-3 py-2 font-medium text-slate-900">{item.orderNo}</td>
                      <td className="px-3 py-2 text-[var(--erp-text-muted)]">{item.styleName || "—"}</td>
                      <td className="px-3 py-2 text-right text-slate-900">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
