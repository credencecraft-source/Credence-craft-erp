"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, QrCode, X } from "lucide-react";

import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import OrderQrStickerPreview from "@/components/erp/order-qr-sticker-preview";
import {
  DEFAULT_QR_FIELD_STYLE,
  buildOrderQrPayload,
  ORDER_QR_TEMPLATE_FIELDS,
  type OrderQrTemplateFieldKey,
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateLayout,
} from "@/lib/services/orders/order-qr-template-contract";
import type { OrderQrQuantityMode } from "@/lib/services/orders/order-qr-print-request-contract";

type OrderQrTemplate = {
  id: string;
  name: string;
  type: string;
  fieldKeys: OrderQrTemplateFieldKey[];
  qrFieldKey: OrderQrTemplateFieldKey;
  displayFields: OrderQrTemplateFieldKey[];
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  qrSize: number;
  stickerWidthMm: number;
  stickerLengthMm: number;
};

type QrState = {
  payload: string;
  size: number;
  dataUrl?: string;
  error?: string;
};

export default function OrderQrCodeCard({
  orderId,
  orderNo,
  styleName,
  colors,
  workspaceId,
  organizationId,
  orderFields,
}: {
  orderId: string;
  orderNo: string;
  styleName?: string | null;
  colors?: string | null;
  workspaceId: string;
  organizationId: string;
  orderFields: Partial<Record<OrderQrTemplateFieldKey, string | number | null>>;
}) {
  const [open, setOpen] = useState(false);
  const [quantityMode, setQuantityMode] = useState<OrderQrQuantityMode>("PCS");
  const [bulkQuantity, setBulkQuantity] = useState(String(orderFields.orderQty ?? ""));
  const [qrState, setQrState] = useState<QrState>({ payload: "", size: 0 });
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templates, setTemplates] = useState<OrderQrTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [templateRetryCount, setTemplateRetryCount] = useState(0);
  const [qrRetryCount, setQrRetryCount] = useState(0);
  const [requestState, setRequestState] = useState<{
    type: "PRINT" | "DOWNLOAD" | null;
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ type: null, status: "idle", message: "" });

  const selectedTemplate = templates.find(({ id }) => id === selectedTemplateId);
  const parsedBulkQuantity = Number(bulkQuantity);
  const isBulkQuantityValid = Number.isSafeInteger(parsedBulkQuantity) && parsedBulkQuantity > 0;
  const qrOrderFields = useMemo(
    () => ({
      ...orderFields,
      orderQty: quantityMode === "PCS"
        ? 1
        : isBulkQuantityValid ? parsedBulkQuantity : null,
    }),
    [isBulkQuantityValid, orderFields, parsedBulkQuantity, quantityMode],
  );
  const qrPayload = useMemo(
    () => selectedTemplate
      ? buildOrderQrPayload([selectedTemplate.qrFieldKey], qrOrderFields).payload
      : "",
    [qrOrderFields, selectedTemplate],
  );
  const qrFieldHasValue = Boolean(qrPayload);
  const qrSize = selectedTemplate?.qrSize ?? 0;
  const qrDataUrl = selectedTemplate
    && qrState.payload === qrPayload
    && qrState.size === qrSize
    ? qrState.dataUrl
    : undefined;
  const qrError = selectedTemplate
    && qrState.payload === qrPayload
    && qrState.size === qrSize
    ? qrState.error
    : undefined;
  const pdfPaperSizeLabel = selectedTemplate?.layout.pdfPaperSize === "A4_PORTRAIT"
    ? "A4 Portrait"
    : selectedTemplate?.layout.pdfPaperSize === "A4_LANDSCAPE"
      ? "A4 Landscape"
      : "A4 Automatic orientation";
  const templatesHref = `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates`;

  const openQrModal = () => {
    setIsLoadingTemplates(true);
    setTemplateError("");
    setRequestState({ type: null, status: "idle", message: "" });
    setOpen(true);
  };

  const submitOutputRequest = async (requestType: "PRINT" | "DOWNLOAD") => {
    if (!selectedTemplate || (quantityMode === "BULK_QTY" && !isBulkQuantityValid)) {
      setRequestState({
        type: requestType,
        status: "error",
        message: !selectedTemplate
          ? "Select a saved QR template before requesting print or download."
          : "Enter a positive whole-number bulk quantity.",
      });
      return;
    }
    setRequestState({ type: requestType, status: "submitting", message: "" });
    const query = new URLSearchParams({ organizationId, workspaceId });
    try {
      const response = await fetch(`/api/orders/qr-print-requests?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          templateId: selectedTemplate.id,
          requestType,
          quantityMode,
          ...(quantityMode === "BULK_QTY" ? { bulkQuantity: parsedBulkQuantity } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to submit the QR request.");
      }
      setRequestState({
        type: requestType,
        status: "success",
        message: `${requestType === "PRINT" ? "Print" : "Download"} request sent to Design and Development.`,
      });
    } catch (error) {
      setRequestState({
        type: requestType,
        status: "error",
        message: error instanceof Error ? error.message : "Unable to submit the QR request.",
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    const query = new URLSearchParams({ organizationId, workspaceId });

    void fetch(`/api/orders/qr-templates?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load QR templates.");
        }
        return data as { templates: OrderQrTemplate[] };
      })
      .then(({ templates: loadedTemplates }) => {
        if (!active) return;
        setTemplates(loadedTemplates.map((template) => ({
          ...template,
          qrFieldKey: template.qrFieldKey ?? template.fieldKeys[0] ?? "orderNo",
          displayFields: template.displayFields ?? template.fieldKeys,
          displayFieldStyles: template.displayFieldStyles ?? {},
          stickerWidthMm: template.stickerWidthMm ?? 50,
          stickerLengthMm: template.stickerLengthMm ?? 30,
        })));
        setSelectedTemplateId((current) =>
          loadedTemplates.some(({ id }) => id === current) ? current : "",
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setTemplateError(error instanceof Error ? error.message : "Unable to load QR templates.");
        }
      })
      .finally(() => {
        if (active) setIsLoadingTemplates(false);
      });

    return () => {
      active = false;
    };
  }, [open, organizationId, templateRetryCount, workspaceId]);

  useEffect(() => {
    if (!open || !selectedTemplate || !qrPayload) return;
    let active = true;
    void QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: qrSize,
    })
      .then((dataUrl) => {
        if (active) setQrState({ payload: qrPayload, size: qrSize, dataUrl });
      })
      .catch((error: unknown) => {
        console.error("Unable to generate the merchandising order QR code.", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        if (active) setQrState({
          payload: qrPayload,
          size: qrSize,
          error: "QR code could not be generated.",
        });
      });

    return () => {
      active = false;
    };
  }, [open, qrPayload, qrRetryCount, qrSize, selectedTemplate]);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={`Show QR code and details for order ${orderNo}`}
        title="Show order QR code"
        className="min-h-8 px-2"
        onClick={openQrModal}
      >
        <QrCode className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Order QR</span>
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabelledBy="order-qr-dialog-title"
        size="rectangle"
      >
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="order-qr-dialog-title" className="text-lg font-semibold text-slate-900">
                Order QR details
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Select an Order Tags template to encode its chosen order fields.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              aria-label="Close order QR details"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid min-w-0 gap-4 sm:grid-cols-2 sm:items-end">
            <Select
              label="Order Tags Template"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              disabled={isLoadingTemplates || templateError.length > 0 || templates.length === 0}
              options={[
                { value: "", label: "Select a saved template" },
                ...templates.map((template) => ({
                  value: template.id,
                  label: template.name,
                })),
              ]}
            />
            <Link
              href={templatesHref}
              className="text-sm font-medium text-[var(--erp-brand)] hover:underline"
            >
              Manage templates
            </Link>
          </div>

          <Tabs
            ariaLabel="QR quantity mode"
            value={quantityMode}
            onChange={setQuantityMode}
            tabs={[
              { value: "PCS", label: "PCS" },
              { value: "BULK_QTY", label: "Bulk Qty" },
            ]}
          />

          {quantityMode === "BULK_QTY" && (
            <div className="max-w-xs space-y-1">
              <Input
                label="Bulk Quantity (PCS)"
                name="bulkQuantity"
                type="number"
                min={1}
                step={1}
                value={bulkQuantity}
                onChange={(event) => setBulkQuantity(event.target.value)}
                required
                aria-describedby="order-qr-bulk-quantity-help"
              />
              <p id="order-qr-bulk-quantity-help" className="text-xs text-[var(--erp-text-muted)]">
                Enter a positive whole number. This quantity is used in the QR preview and request.
              </p>
              {bulkQuantity.length > 0 && !isBulkQuantityValid && (
                <p className="text-sm text-[var(--erp-danger)]" role="alert">
                  Enter a positive whole-number quantity.
                </p>
              )}
            </div>
          )}

          {selectedTemplate && (
            <div
              role="group"
              className="grid min-w-0 gap-3 rounded-md border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3 sm:grid-cols-4"
              aria-label="Selected QR sticker settings"
            >
              <div>
                <p className="text-xs text-[var(--erp-text-muted)]">Sticker size</p>
                <p className="text-sm font-medium text-slate-900">
                  {selectedTemplate.stickerWidthMm} × {selectedTemplate.stickerLengthMm} mm
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--erp-text-muted)]">Printer output</p>
                <p className="text-sm font-medium text-slate-900">
                  {selectedTemplate.layout.printerType === "LASER"
                    ? `Laser Printer · ${pdfPaperSizeLabel} PDF`
                    : "Barcode Printer · sticker-size"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--erp-text-muted)]">Quantity mode</p>
                <p className="text-sm font-medium text-slate-900">
                  {quantityMode === "PCS"
                    ? "1 PCS"
                    : `${isBulkQuantityValid ? parsedBulkQuantity : "—"} PCS`}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--erp-text-muted)]">QR encodes</p>
                <p className="text-sm font-medium text-slate-900">
                  {ORDER_QR_TEMPLATE_FIELDS.find(
                    ({ key }) => key === selectedTemplate.qrFieldKey,
                  )?.label ?? selectedTemplate.qrFieldKey}
                </p>
              </div>
            </div>
          )}

          {isLoadingTemplates && (
            <p className="text-sm text-[var(--erp-text-muted)]" role="status">
              Looking up templates...
            </p>
          )}
          {templateError && (
            <div className="flex flex-wrap items-center gap-3" role="alert">
              <p className="text-sm text-[var(--erp-danger)]">{templateError}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIsLoadingTemplates(true);
                  setTemplateError("");
                  setTemplateRetryCount((count) => count + 1);
                }}
              >
                Retry
              </Button>
            </div>
          )}
          {!isLoadingTemplates && !templateError && templates.length === 0 && (
            <p className="text-sm text-[var(--erp-text-muted)]">
              No QR templates have been created. Create a template before generating an order QR code.
            </p>
          )}

          {selectedTemplate && qrFieldHasValue ? (
            <OrderQrStickerPreview
              qrDataUrl={qrDataUrl}
              qrError={qrError}
              qrAlt={`QR code for order ${orderNo}`}
              fields={selectedTemplate.displayFields.map((fieldKey) => ({
                key: fieldKey,
                label: ORDER_QR_TEMPLATE_FIELDS.find(({ key }) => key === fieldKey)?.label ?? fieldKey,
                value: String(
                  qrOrderFields[fieldKey]
                    ?? (fieldKey === "orderNo"
                      ? orderNo
                      : fieldKey === "styleName"
                        ? styleName
                        : fieldKey === "colors"
                          ? colors
                          : ""),
                ),
                style: {
                  ...DEFAULT_QR_FIELD_STYLE,
                  ...selectedTemplate.displayFieldStyles[fieldKey],
                },
              }))}
              layout={selectedTemplate.layout}
              stickerWidthMm={selectedTemplate.stickerWidthMm}
              stickerLengthMm={selectedTemplate.stickerLengthMm}
              className="mx-auto max-w-lg"
              onRetry={() => setQrRetryCount((count) => count + 1)}
            />
          ) : selectedTemplate ? (
            <div className="flex min-h-40 items-center justify-center rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-6 text-center">
              <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                The selected QR field has no value on this order.
              </p>
            </div>
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-6 text-center">
              <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                {isLoadingTemplates
                  ? "Loading saved templates..."
                  : templateError
                    ? "Load templates to preview the saved QR design."
                    : templates.length === 0
                      ? "Create a template to preview its QR sticker here."
                      : "Select a saved template to preview its QR sticker."}
              </p>
            </div>
          )}
          <div className="space-y-3 border-t border-[var(--erp-border)] pt-4">
            <p className="text-sm text-[var(--erp-text-muted)]">
              Send this QR code and the selected order details to Design and Development for processing.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!selectedTemplate || !qrFieldHasValue
                  || (quantityMode === "BULK_QTY" && !isBulkQuantityValid)
                  || requestState.status === "submitting"}
                onClick={() => void submitOutputRequest("PRINT")}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Request Print
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!selectedTemplate || !qrFieldHasValue
                  || (quantityMode === "BULK_QTY" && !isBulkQuantityValid)
                  || requestState.status === "submitting"}
                onClick={() => void submitOutputRequest("DOWNLOAD")}
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Request Download
              </Button>
            </div>
            {requestState.status !== "idle" && (
              <p
                className={`text-sm ${requestState.status === "error" ? "text-[var(--erp-danger)]" : "text-[var(--erp-text-muted)]"}`}
                role={requestState.status === "error" ? "alert" : "status"}
              >
                {requestState.status === "submitting"
                  ? `Sending ${requestState.type === "PRINT" ? "print" : "download"} request...`
                  : requestState.message}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
