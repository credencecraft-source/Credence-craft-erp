"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, QrCode, X } from "lucide-react";

import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import OrderQrStickerPreview from "@/components/erp/order-qr-sticker-preview";
import {
  DEFAULT_QR_FIELD_STYLE,
  buildOrderQrPayload,
  getQrTemplateFieldLabel,
  getQrTemplateFields,
  type OrderQrTemplateType,
  type OrderQrTemplateFieldKey,
  type QrTemplateFieldKey,
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateLayout,
} from "@/lib/services/orders/order-qr-template-contract";
import {
  MAX_ORDER_QR_PRINT_REQUEST_LABELS,
  type OrderQrQuantityMode,
} from "@/lib/services/orders/order-qr-print-request-contract";

type OrderQrTemplate = {
  id: string;
  name: string;
  type: OrderQrTemplateType;
  fieldKeys: QrTemplateFieldKey[];
  qrFieldKey: QrTemplateFieldKey;
  displayFields: QrTemplateFieldKey[];
  displayFieldStyles: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  qrSize: number;
  stickerWidthMm: number;
  stickerLengthMm: number;
};

type FinishedGoodsBarcodeRow = {
  id: string;
  buyerSize: string | null;
  size: string | null;
  sku_code: string | null;
  barcode: string | null;
  totalQty: number | null;
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
  const [activeTemplateType, setActiveTemplateType] =
    useState<OrderQrTemplateType>("ORDER_TAGS");
  const [quantityMode, setQuantityMode] = useState<OrderQrQuantityMode>("PCS");
  const [bulkQuantity, setBulkQuantity] = useState(String(orderFields.orderQty ?? ""));
  const [qrState, setQrState] = useState<QrState>({ payload: "", size: 0 });
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templates, setTemplates] = useState<OrderQrTemplate[]>([]);
  const [finishedGoodsRows, setFinishedGoodsRows] = useState<FinishedGoodsBarcodeRow[]>([]);
  const [selectedFinishedGoodsIds, setSelectedFinishedGoodsIds] = useState<string[]>([]);
  const [finishedGoodsQuantities, setFinishedGoodsQuantities] =
    useState<Record<string, string>>({});
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingFinishedGoods, setIsLoadingFinishedGoods] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [finishedGoodsError, setFinishedGoodsError] = useState("");
  const [templateRetryCount, setTemplateRetryCount] = useState(0);
  const [finishedGoodsRetryCount, setFinishedGoodsRetryCount] = useState(0);
  const [qrRetryCount, setQrRetryCount] = useState(0);
  const [requestState, setRequestState] = useState<{
    type: "PRINT" | "DOWNLOAD" | null;
    status: "idle" | "submitting" | "success" | "error";
    message: string;
  }>({ type: null, status: "idle", message: "" });

  const activeTemplates = templates.filter(({ type }) => type === activeTemplateType);
  const selectedTemplate = activeTemplates.find(({ id }) => id === selectedTemplateId);
  const parsedBulkQuantity = Number(bulkQuantity);
  const isBulkQuantityValid = Number.isSafeInteger(parsedBulkQuantity) && parsedBulkQuantity > 0;
  const selectedFinishedGoodsRows = finishedGoodsRows.filter(({ id }) =>
    selectedFinishedGoodsIds.includes(id),
  );
  const selectedPreviewVariant = selectedFinishedGoodsRows[0];
  const qrOrderFields = useMemo(
    () => ({
      ...orderFields,
      orderQty: quantityMode === "PCS"
        ? 1
        : isBulkQuantityValid ? parsedBulkQuantity : null,
    }),
    [isBulkQuantityValid, orderFields, parsedBulkQuantity, quantityMode],
  );
  const finishedGoodsFieldValues: Partial<
    Record<QrTemplateFieldKey, string | number | null>
  > = {
    fgBarcode: selectedPreviewVariant?.barcode,
    fgSkuCode: selectedPreviewVariant?.sku_code,
    fgSize: selectedPreviewVariant?.size,
    fgBuyerSize: selectedPreviewVariant?.buyerSize,
    fgOrderNo: orderNo,
    fgStyleName: styleName,
    fgArticle: orderFields.article,
    fgColor: colors,
    fgQuantity: selectedPreviewVariant?.totalQty,
  };
  const templateFieldValues: Partial<
    Record<QrTemplateFieldKey, string | number | null>
  > = activeTemplateType === "FG_BARCODE"
    ? finishedGoodsFieldValues
    : qrOrderFields;
  const finishedGoodsLabelQuantities = selectedFinishedGoodsRows.map((row) => ({
    finishedGoodsId: row.id,
    quantity: Number(finishedGoodsQuantities[row.id]),
  }));
  const finishedGoodsLabelCount = finishedGoodsLabelQuantities.reduce(
    (total, row) => total + row.quantity,
    0,
  );
  const hasValidFinishedGoodsSelection = selectedFinishedGoodsRows.length > 0
    && selectedFinishedGoodsRows.every((row) =>
      Boolean(row.sku_code?.trim() && row.barcode?.trim())
      && Number.isSafeInteger(Number(finishedGoodsQuantities[row.id]))
      && Number(finishedGoodsQuantities[row.id]) > 0
    )
    && Number.isSafeInteger(finishedGoodsLabelCount)
    && finishedGoodsLabelCount <= MAX_ORDER_QR_PRINT_REQUEST_LABELS;
  const qrPayload = selectedTemplate
    ? buildOrderQrPayload([selectedTemplate.qrFieldKey], templateFieldValues).payload
    : "";
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
    setActiveTemplateType("ORDER_TAGS");
    setSelectedTemplateId("");
    setRequestState({ type: null, status: "idle", message: "" });
    setOpen(true);
  };

  const submitOutputRequest = async (requestType: "PRINT" | "DOWNLOAD") => {
    if (
      !selectedTemplate
      || (activeTemplateType === "FG_BARCODE" && !hasValidFinishedGoodsSelection)
      || (activeTemplateType !== "FG_BARCODE"
        && quantityMode === "BULK_QTY"
        && !isBulkQuantityValid)
    ) {
      setRequestState({
        type: requestType,
        status: "error",
        message: !selectedTemplate
          ? "Select a saved QR template before requesting print or download."
          : activeTemplateType === "FG_BARCODE"
            ? "Select finished-goods sizes with saved SKU and barcode values and valid label quantities."
            : "Enter a positive whole-number bulk quantity.",
      });
      return;
    }
    setRequestState({ type: requestType, status: "submitting", message: "" });
    const query = new URLSearchParams({
      organizationId,
      workspaceId,
    });
    if (activeTemplateType === "FG_BARCODE") query.set("type", "FG_BARCODE");
    try {
      const response = await fetch(`/api/orders/qr-print-requests?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          templateId: selectedTemplate.id,
          requestType,
          ...(activeTemplateType === "FG_BARCODE"
            ? { finishedGoodsRows: finishedGoodsLabelQuantities }
            : {
              quantityMode,
              ...(quantityMode === "BULK_QTY" ? { bulkQuantity: parsedBulkQuantity } : {}),
            }),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to submit the QR request.");
      }
      setRequestState({
        type: requestType,
        status: "success",
        message: `${activeTemplateType === "FG_BARCODE" ? "Finished-goods barcode" : "Order QR"} ${requestType.toLowerCase()} request sent to Design and Development.`,
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
          qrFieldKey: template.qrFieldKey
            ?? template.fieldKeys[0]
            ?? getQrTemplateFields(template.type)[0].key,
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
    if (!open || activeTemplateType !== "FG_BARCODE") return;
    let active = true;
    const query = new URLSearchParams({
      organizationId,
      workspaceId,
      section: "finishedGoods",
    });
    void fetch(`/api/orders/${encodeURIComponent(orderId)}?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load finished-goods sizes.");
        }
        return data as { order: { finishedGoods: FinishedGoodsBarcodeRow[] } };
      })
      .then(({ order: loadedOrder }) => {
        if (!active) return;
        const rows = loadedOrder.finishedGoods ?? [];
        setFinishedGoodsRows(rows);
        setSelectedFinishedGoodsIds(rows.map(({ id }) => id));
        setFinishedGoodsQuantities(Object.fromEntries(rows.map((row) => [
          row.id,
          String(Math.max(1, row.totalQty ?? 1)),
        ])));
      })
      .catch((error: unknown) => {
        if (active) {
          setFinishedGoodsError(
            error instanceof Error ? error.message : "Unable to load finished-goods sizes.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingFinishedGoods(false);
      });
    return () => {
      active = false;
    };
  }, [activeTemplateType, finishedGoodsRetryCount, open, orderId, organizationId, workspaceId]);

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
                {activeTemplateType === "FG_BARCODE" ? "Finished-goods barcode labels" : "Order QR details"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {activeTemplateType === "FG_BARCODE"
                  ? "Select finished-goods sizes to print using their saved SKU and barcode."
                  : "Select an Order Tags template to encode its chosen order fields."}
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

          <Tabs
            ariaLabel="Barcode template type"
            value={activeTemplateType}
            onChange={(value) => {
              const nextType = value as OrderQrTemplateType;
              setActiveTemplateType(nextType);
              setSelectedTemplateId("");
              setRequestState({ type: null, status: "idle", message: "" });
              if (nextType === "FG_BARCODE") {
                setIsLoadingFinishedGoods(true);
                setFinishedGoodsError("");
              }
            }}
            tabs={[
              { value: "ORDER_TAGS", label: "Order Tags" },
              { value: "FG_BARCODE", label: "FG Barcode" },
            ]}
          />

          <div className="grid min-w-0 gap-4 sm:grid-cols-2 sm:items-end">
            <Select
              label={activeTemplateType === "FG_BARCODE" ? "FG Barcode Template" : "Order Tags Template"}
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              disabled={isLoadingTemplates || templateError.length > 0 || activeTemplates.length === 0}
              options={[
                { value: "", label: "Select a saved template" },
                ...activeTemplates.map((template) => ({
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

          {activeTemplateType !== "FG_BARCODE" && (
            <Tabs
              ariaLabel="QR quantity mode"
              value={quantityMode}
              onChange={setQuantityMode}
              tabs={[
                { value: "PCS", label: "PCS" },
                { value: "BULK_QTY", label: "Bulk Qty" },
              ]}
            />
          )}

          {activeTemplateType !== "FG_BARCODE" && quantityMode === "BULK_QTY" && (
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

          {activeTemplateType === "FG_BARCODE" && (
            <section className="space-y-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">Finished-goods sizes</h3>
                <p className="text-xs text-[var(--erp-text-muted)]">
                  Each selected size produces its own QR code. Label quantity defaults to the size&apos;s order quantity.
                </p>
              </div>
              {isLoadingFinishedGoods && (
                <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                  Loading finished-goods sizes...
                </p>
              )}
              {finishedGoodsError && (
                <div className="flex flex-wrap items-center gap-3" role="alert">
                  <p className="text-sm text-[var(--erp-danger)]">{finishedGoodsError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setIsLoadingFinishedGoods(true);
                      setFinishedGoodsError("");
                      setFinishedGoodsRetryCount((count) => count + 1);
                    }}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {!isLoadingFinishedGoods && !finishedGoodsError && finishedGoodsRows.length === 0 && (
                <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                  This order has no saved finished-goods sizes yet. Add sizes in the order&apos;s Finished Goods tab and save it first.
                </p>
              )}
              {!isLoadingFinishedGoods && finishedGoodsRows.length > 0 && (
                <div className="max-h-64 space-y-3 overflow-y-auto">
                  {finishedGoodsRows.map((row) => {
                    const isSelected = selectedFinishedGoodsIds.includes(row.id);
                    const identifiersMissing = !row.sku_code?.trim() || !row.barcode?.trim();
                    return (
                      <div
                        key={row.id}
                        className="grid min-w-0 gap-3 rounded-lg border border-[var(--erp-border)] p-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
                      >
                        <div className="min-w-0 space-y-2">
                          <Checkbox
                            label={`Size ${row.size ?? row.buyerSize ?? "—"} · ${row.sku_code || "SKU missing"} · ${row.barcode || "Barcode missing"}`}
                            checked={isSelected}
                            onChange={(event) => setSelectedFinishedGoodsIds((current) =>
                              event.target.checked
                                ? [...new Set([...current, row.id])]
                                : current.filter((id) => id !== row.id))}
                          />
                          {identifiersMissing && (
                            <p className="text-xs text-[var(--erp-danger)]" role="status">
                              Add both SKU and barcode to this finished-goods size in the order before printing.
                            </p>
                          )}
                        </div>
                        <Input
                          label="Label quantity"
                          type="number"
                          min={1}
                          step={1}
                          value={finishedGoodsQuantities[row.id] ?? ""}
                          disabled={!isSelected}
                          onChange={(event) => setFinishedGoodsQuantities((current) => ({
                            ...current,
                            [row.id]: event.target.value,
                          }))}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedFinishedGoodsRows.length > 0 && (
                <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                  {selectedFinishedGoodsRows.length} size variant{selectedFinishedGoodsRows.length === 1 ? "" : "s"} · {finishedGoodsLabelCount} labels selected
                </p>
              )}
              {finishedGoodsLabelCount > MAX_ORDER_QR_PRINT_REQUEST_LABELS && (
                <p className="text-sm text-[var(--erp-danger)]" role="alert">
                  The total label quantity cannot exceed {MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()}.
                </p>
              )}
            </section>
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
                  {activeTemplateType === "FG_BARCODE"
                    ? `${finishedGoodsLabelCount} labels`
                    : quantityMode === "PCS"
                      ? "1 PCS"
                      : `${isBulkQuantityValid ? parsedBulkQuantity : "—"} PCS`}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--erp-text-muted)]">QR encodes</p>
                <p className="text-sm font-medium text-slate-900">
                  {getQrTemplateFieldLabel(selectedTemplate.qrFieldKey)}
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
          {!isLoadingTemplates && !templateError && activeTemplates.length === 0 && (
            <p className="text-sm text-[var(--erp-text-muted)]">
              No {activeTemplateType === "FG_BARCODE" ? "FG Barcode" : "Order Tags"} templates have been created. Create a matching template before generating labels.
            </p>
          )}

          {selectedTemplate && qrFieldHasValue ? (
            <OrderQrStickerPreview
              qrDataUrl={qrDataUrl}
              qrError={qrError}
              qrAlt={activeTemplateType === "FG_BARCODE"
                ? `FG barcode QR code for ${selectedPreviewVariant?.barcode ?? orderNo}`
                : `QR code for order ${orderNo}`}
              fields={selectedTemplate.displayFields.map((fieldKey) => ({
                key: fieldKey,
                label: getQrTemplateFieldLabel(fieldKey),
                value: String(templateFieldValues[fieldKey] ?? ""),
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
                    : activeTemplates.length === 0
                      ? `Create a ${activeTemplateType === "FG_BARCODE" ? "FG Barcode" : "Order Tags"} template to preview its sticker here.`
                      : "Select a saved template to preview its QR sticker."}
              </p>
            </div>
          )}
          <div className="space-y-3 border-t border-[var(--erp-border)] pt-4">
            <p className="text-sm text-[var(--erp-text-muted)]">
              {activeTemplateType === "FG_BARCODE"
                ? "Send one QR label per selected finished-goods size to Design and Development."
                : "Send this QR code and the selected order details to Design and Development for processing."}
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!selectedTemplate || !qrFieldHasValue
                  || (activeTemplateType === "FG_BARCODE"
                    ? !hasValidFinishedGoodsSelection
                    : quantityMode === "BULK_QTY" && !isBulkQuantityValid)
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
                  || (activeTemplateType === "FG_BARCODE"
                    ? !hasValidFinishedGoodsSelection
                    : quantityMode === "BULK_QTY" && !isBulkQuantityValid)
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
