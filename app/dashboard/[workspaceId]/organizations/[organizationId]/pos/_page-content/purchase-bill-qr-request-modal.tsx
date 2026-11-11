"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useState } from "react";

import OrderQrStickerPreview from "@/components/erp/order-qr-sticker-preview";
import Button from "@/components/ui/Button";
import Checkbox from "@/components/ui/Checkbox";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import Table from "@/components/ui/Table";
import Tabs from "@/components/ui/Tabs";
import {
  buildOrderQrPayload,
  getQrTemplateFieldLabel,
  POS_ITEM_BARCODE_TEMPLATE_FIELDS,
  type QrTemplateFieldKey,
  parseOrderQrTemplateLayout,
  parseStoredOrderQrTemplateDesign,
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateLayout,
} from "@/lib/services/orders/order-qr-template-contract";
import {
  MAX_ORDER_QR_PRINT_REQUEST_LABELS,
  MAX_ORDER_QR_PRINT_REQUEST_ORDERS,
} from "@/lib/services/orders/order-qr-print-request-contract";

type PurchaseBillLine = {
  id: string;
  itemName: string | null;
  size: string | null;
  quantity: string;
  sourceRecord: {
    recordNumber: string;
    itemType: string;
    styleName: string | null;
  } | null;
  stock: { id: string; sku_code: string | null } | null;
};

type PurchaseBill = {
  id: string;
  documentNumber: string;
  billNumber: string;
  billDate: string;
  vendor: { vendor: string };
  lines: PurchaseBillLine[];
};

type QrTemplate = {
  id: string;
  name: string;
  type: "POS_ITEM_BARCODE";
  qrFieldKey: QrTemplateFieldKey;
  displayFields: QrTemplateFieldKey[];
  displayFieldStyles: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  qrSize: number;
  stickerWidthMm: number;
  stickerLengthMm: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTemplates(value: unknown): QrTemplate[] {
  if (!Array.isArray(value)) throw new Error("QR template response was invalid.");
  const templates = value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string") return [];
    const displayFields = Array.isArray(item.displayFields)
      ? item.displayFields.filter((field): field is QrTemplateFieldKey =>
        POS_ITEM_BARCODE_TEMPLATE_FIELDS.some((option) => option.key === field))
      : [];
    const layout = parseOrderQrTemplateLayout(item.layout, displayFields);
    if (
      !layout.success
      || item.type !== "POS_ITEM_BARCODE"
      || typeof item.qrFieldKey !== "string"
      || !POS_ITEM_BARCODE_TEMPLATE_FIELDS.some((field) => field.key === item.qrFieldKey)
      || displayFields.length !== (Array.isArray(item.displayFields) ? item.displayFields.length : -1)
      || typeof item.qrSize !== "number"
      || typeof item.stickerWidthMm !== "number"
      || typeof item.stickerLengthMm !== "number"
      || !Number.isFinite(item.stickerWidthMm)
      || !Number.isFinite(item.stickerLengthMm)
      || item.stickerWidthMm <= 0
      || item.stickerLengthMm <= 0
    ) return [];
    const design = parseStoredOrderQrTemplateDesign({
      styles: item.displayFieldStyles,
      layout: item.layout,
    }, displayFields);
    return [{
      id: item.id,
      name: item.name,
      type: "POS_ITEM_BARCODE" as const,
      qrFieldKey: item.qrFieldKey as QrTemplateFieldKey,
      displayFields,
      displayFieldStyles: design.displayFieldStyles,
      layout: layout.data,
      qrSize: item.qrSize,
      stickerWidthMm: item.stickerWidthMm,
      stickerLengthMm: item.stickerLengthMm,
    }];
  });
  if (templates.length !== value.length) {
    throw new Error("One or more QR templates could not be loaded. Review the saved templates and try again.");
  }
  return templates;
}

function getLineCode(bill: PurchaseBill, line: PurchaseBillLine, index: number) {
  return line.stock?.sku_code
    || line.stock?.id
    || `${bill.documentNumber}-L${String(index + 1).padStart(3, "0")}`;
}

function getBillLineFields(
  bill: PurchaseBill,
  line: PurchaseBillLine,
  index: number,
) {
  return {
    posItemCode: getLineCode(bill, line, index),
    posItemName: line.itemName ?? line.sourceRecord?.styleName ?? line.sourceRecord?.recordNumber ?? null,
    posSize: line.size,
    posItemType: line.sourceRecord?.itemType.replaceAll("_", " ") ?? null,
    posRecordNumber: line.sourceRecord?.recordNumber ?? null,
    posVendor: bill.vendor.vendor,
    posBillNumber: bill.billNumber,
    posBillDate: new Date(bill.billDate).toISOString().slice(0, 10),
    posBillQuantity: line.quantity,
    posSkuCode: line.stock?.sku_code ?? line.stock?.id ?? null,
  } satisfies Partial<Record<QrTemplateFieldKey, string | number | null>>;
}

function PurchaseBillQrRequestModal({
  open,
  workspaceId,
  organizationId,
  bill,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  workspaceId: string;
  organizationId: string;
  bill: PurchaseBill;
  onClose: () => void;
  onSubmitted: (message: string, requestId: string) => void;
}) {
  const [templates, setTemplates] = useState<QrTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [loadedTemplateQuery, setLoadedTemplateQuery] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [templateRetry, setTemplateRetry] = useState(0);
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>(
    () => bill.lines.slice(0, MAX_ORDER_QR_PRINT_REQUEST_ORDERS).map((line) => line.id),
  );
  const [quantityMode, setQuantityMode] = useState<"PCS" | "BULK_QTY">("PCS");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [sampleQrPreview, setSampleQrPreview] = useState<{ key: string; dataUrl: string } | null>(null);
  const [sampleQrPreviewError, setSampleQrPreviewError] = useState<{ key: string; error: string } | null>(null);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const templateQuery = `${workspaceId}:${organizationId}:${templateRetry}`;
  const isLoadingTemplates = open && loadedTemplateQuery !== templateQuery;
  const selectedLines = useMemo(
    () => bill.lines.flatMap((line, index) =>
      selectedLineIds.includes(line.id) ? [{ line, index }] : []),
    [bill.lines, selectedLineIds],
  );
  const sampleLine = selectedLines[0];
  const sampleFields: Partial<Record<QrTemplateFieldKey, string | number | null>> = sampleLine
    ? getBillLineFields(bill, sampleLine.line, sampleLine.index)
    : {};
  const sampleQrPayload = selectedTemplate
    ? buildOrderQrPayload([selectedTemplate.qrFieldKey], sampleFields).payload
    : "";
  const sampleQrPreviewKey = `${selectedTemplateId}:${sampleQrPayload}`;
  const sampleQrDataUrl = sampleQrPreview?.key === sampleQrPreviewKey
    ? sampleQrPreview.dataUrl
    : "";
  const sampleQrError = sampleQrPreviewError?.key === sampleQrPreviewKey
    ? sampleQrPreviewError.error
    : "";
  const sampleQrDisplayFields = selectedTemplate?.displayFields.map((key) => {
    const label = getQrTemplateFieldLabel(key);
    const value = sampleFields[key];
    return {
      key,
    label,
      value: value === null || value === undefined ? "" : String(value),
      style: selectedTemplate.displayFieldStyles[key],
    };
  }) ?? [];
  const labelTotal = selectedLines.reduce((total, { line }) => {
    if (quantityMode === "PCS") return total + 1;
    const quantity = Number(line.quantity);
    return total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 0);
  }, 0);
  const hasInvalidBulkQuantity = quantityMode === "BULK_QTY" && selectedLines.some(({ line }) => {
    const quantity = Number(line.quantity);
    return !Number.isSafeInteger(quantity) || quantity < 1;
  });

  useEffect(() => {
    if (!open) return;
    if (loadedTemplateQuery === templateQuery) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      organizationId,
      workspaceId,
      type: "POS_ITEM_BARCODE",
    });

    void fetch(`/api/orders/qr-templates?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(isRecord(data) && typeof data.error === "string"
            ? data.error
            : "Unable to load QR templates.");
        }

        return isRecord(data) ? parseTemplates(data.templates) : parseTemplates(undefined);
      })
      .then((loadedTemplates) => {
        if (controller.signal.aborted) return;
        setTemplates(loadedTemplates);
        setTemplateError("");
        setLoadedTemplateQuery(templateQuery);
        setSelectedTemplateId((current) =>
          loadedTemplates.some((template) => template.id === current)
            ? current
            : loadedTemplates[0]?.id ?? "",
        );
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setTemplateError(error instanceof Error ? error.message : "Unable to load QR templates.");
          setLoadedTemplateQuery(templateQuery);
        }
      })

    return () => controller.abort();
  }, [loadedTemplateQuery, open, organizationId, templateQuery, templateRetry, workspaceId]);

  useEffect(() => {
    let active = true;
    if (!open || !sampleQrPayload || !selectedTemplate) return;
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(sampleQrPayload, {
        errorCorrectionLevel: "H",
        margin: 2,
        width: selectedTemplate.qrSize,
      }))
      .then((dataUrl) => {
        if (active) setSampleQrPreview({ key: sampleQrPreviewKey, dataUrl });
      })
      .catch((error: unknown) => {
        if (active) {
          setSampleQrPreviewError({
            key: sampleQrPreviewKey,
            error: error instanceof Error ? error.message : "Unable to prepare the QR preview.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [open, sampleQrPayload, sampleQrPreviewKey, selectedTemplate]);

  const submitRequest = async () => {
    setRequestError("");
    if (selectedLines.length === 0) {
      setRequestError("Select at least one purchase bill line.");
      return;
    }
    if (selectedLines.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS) {
      setRequestError(`A single QR request can contain up to ${MAX_ORDER_QR_PRINT_REQUEST_ORDERS} purchase bill lines.`);
      return;
    }
    if (!selectedTemplateId) {
      setRequestError("Create or select a QR template before requesting labels.");
      return;
    }
    if (hasInvalidBulkQuantity) {
      setRequestError("Bulk Qty requires a positive whole-number bill quantity for every selected line.");
      return;
    }
    const billLines = selectedLines.map(({ line }) => ({
      billLineId: line.id,
      quantity: quantityMode === "PCS" ? 1 : Number(line.quantity),
    }));
    if (billLines.some(({ quantity }) => !Number.isSafeInteger(quantity) || quantity < 1)) {
      setRequestError("Enter a positive whole-number label quantity for every selected line.");
      return;
    }
    if (billLines.reduce((total, item) => total + item.quantity, 0) > MAX_ORDER_QR_PRINT_REQUEST_LABELS) {
      setRequestError(`A single QR request cannot exceed ${MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()} labels.`);
      return;
    }
    setIsSubmitting(true);
    try {
      const query = new URLSearchParams({
        organizationId,
        workspaceId,
        sourceType: "POS_PURCHASE_BILL",
      });
      const response = await fetch(`/api/orders/qr-print-requests?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseBillId: bill.id,
          billLines,
          templateId: selectedTemplateId,
          requestType: "PRINT",
          quantityMode,
        }),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string"
          ? data.error
          : "Unable to send the QR request.");
      }
      if (!isRecord(data) || !isRecord(data.request)
        || typeof data.request.id !== "string" || !data.request.id) {
        throw new Error(
          "The QR request was sent, but its detail link could not be loaded. Find it in Print/Download requests.",
        );
      }
      onSubmitted(
        `One QR request for ${selectedLines.length} purchase bill line${selectedLines.length === 1 ? "" : "s"} was sent to Design & Development. They can choose to print or download it.`,
        data.request.id,
      );
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Unable to send the QR request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const templatesHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates`;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      ariaLabelledBy="purchase-bill-qr-title"
      size="rectangle"
      closeOnBackdrop={!isSubmitting}
    >
      <div className="flex h-[calc(100dvh-4rem)] max-h-[calc(100dvh-4rem)] min-h-0 flex-col p-6">
        <div className="mb-5 flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="purchase-bill-qr-title" className="text-lg font-semibold text-[var(--erp-text)]">
                  Request POS item barcodes
            </h2>
            <p className="mt-1 text-sm text-[var(--erp-text-muted)]">
              One request will be sent to Design & Development for the selected items from {bill.documentNumber}. They will choose print or download.
            </p>
          </div>
          <span className="rounded-full border border-[var(--erp-border)] px-3 py-1 text-xs font-medium text-[var(--erp-text-muted)]">
            {selectedLines.length} of {bill.lines.length} bill lines selected
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {templateError && (
            <div className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]" role="alert">
              <p>{templateError}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setTemplateError("");
                  setTemplateRetry((retry) => retry + 1);
                }}
              >
                Retry templates
              </Button>
            </div>
          )}

          <Select
            label="Saved QR template"
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            disabled={isLoadingTemplates || templates.length === 0}
          >
            <option value="">
              {isLoadingTemplates ? "Loading templates..." : "Select a template"}
            </option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name}</option>
            ))}
          </Select>

          {!isLoadingTemplates && !templateError && templates.length === 0 && (
            <p className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-text-muted)]">
              No POS Item Barcode template is configured. Create one before requesting labels.{" "}
              <Link
                href={templatesHref}
                className="font-semibold text-[var(--erp-brand)] underline-offset-2 hover:underline"
              >
                Create a template
              </Link>
              .
            </p>
          )}

          <Tabs
            ariaLabel="QR label quantity mode"
            compact
            value={quantityMode}
            onChange={setQuantityMode}
            tabs={[
              { value: "PCS", label: "PCS" },
              { value: "BULK_QTY", label: "Bulk Qty" },
            ]}
          />

          {quantityMode === "PCS" ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--erp-text-muted)]">
                PCS creates one label per selected bill line. Total labels: {labelTotal}
              </p>
              <Table className="max-h-56 overflow-y-auto">
                <thead className="sticky top-0 bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-text-muted)]">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2">Select</th>
                    <th scope="col" className="px-3 py-2">Item</th>
                    <th scope="col" className="px-3 py-2">Size</th>
                    <th scope="col" className="px-3 py-2 text-right">Bill Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {bill.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <Checkbox
                          aria-label={`Select ${line.itemName || line.sourceRecord?.styleName || "purchase bill line"}`}
                          checked={selectedLineIds.includes(line.id)}
                          onChange={(event) => setSelectedLineIds((current) => event.target.checked
                            ? [...current, line.id]
                            : current.filter((id) => id !== line.id))}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--erp-text)]">{line.itemName || line.sourceRecord?.styleName || "—"}</td>
                      <td className="px-3 py-2 text-[var(--erp-text-muted)]">{line.size || "—"}</td>
                      <td className="px-3 py-2 text-right text-[var(--erp-text)]">{line.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--erp-text-muted)]">
                Bulk Qty uses the full bill quantity for each selected line.
              </p>
              <p className="text-right text-xs font-medium text-[var(--erp-text-muted)]">
                Total labels: {labelTotal.toLocaleString()} / {MAX_ORDER_QR_PRINT_REQUEST_LABELS.toLocaleString()}
              </p>
              <Table className="max-h-56 overflow-y-auto">
                <thead className="sticky top-0 bg-[var(--erp-surface-soft)] text-xs uppercase text-[var(--erp-text-muted)]">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2">Select</th>
                    <th scope="col" className="px-3 py-2">Item</th>
                    <th scope="col" className="px-3 py-2">Size</th>
                    <th scope="col" className="w-36 px-3 py-2 text-right">Labels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--erp-border)]">
                  {bill.lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-3 py-2">
                        <Checkbox
                          aria-label={`Select ${line.itemName || line.sourceRecord?.styleName || "purchase bill line"}`}
                          checked={selectedLineIds.includes(line.id)}
                          onChange={(event) => setSelectedLineIds((current) => event.target.checked
                            ? [...current, line.id]
                            : current.filter((id) => id !== line.id))}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--erp-text)]">{line.itemName || line.sourceRecord?.styleName || "—"}</td>
                      <td className="px-3 py-2 text-[var(--erp-text-muted)]">{line.size || "—"}</td>
                      <td className="px-3 py-2 text-right font-medium text-[var(--erp-text)]">
                        {selectedLineIds.includes(line.id) ? line.quantity : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}

          {selectedTemplate && sampleLine && (
            <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(16rem,1fr)]">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--erp-text)]">Sample sticker preview</h3>
                <OrderQrStickerPreview
                  qrDataUrl={sampleQrDataUrl || undefined}
                  qrError={sampleQrError || undefined}
                  fields={sampleQrDisplayFields}
                  layout={selectedTemplate.layout}
                  stickerWidthMm={selectedTemplate.stickerWidthMm}
                  stickerLengthMm={selectedTemplate.stickerLengthMm}
                  className="max-w-xl"
                />
              </div>
              <dl className="grid content-start gap-2 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">Template</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">{selectedTemplate.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">Sticker size</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">
                    {selectedTemplate.stickerWidthMm} × {selectedTemplate.stickerLengthMm} mm
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">Printer</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">
                    {selectedTemplate.layout.printerType === "LASER" ? "Laser / A4 PDF" : "Barcode sticker printer"}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--erp-text-muted)]">QR field</dt>
                  <dd className="text-right font-medium text-[var(--erp-text)]">
                    {getQrTemplateFieldLabel(selectedTemplate.qrFieldKey)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {requestError && (
            <p role="alert" className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              {requestError}
            </p>
          )}
          {selectedLines.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS && (
            <p role="alert" className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-danger)]">
              Select no more than {MAX_ORDER_QR_PRINT_REQUEST_ORDERS} purchase bill lines for one QR request.
            </p>
          )}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--erp-border)] bg-white pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submitRequest()}
            disabled={
              isSubmitting
              || isLoadingTemplates
              || Boolean(templateError)
              || !selectedTemplateId
              || selectedLines.length === 0
              || selectedLines.length > MAX_ORDER_QR_PRINT_REQUEST_ORDERS
            }
          >
            {isSubmitting ? "Sending request..." : "Send one QR request"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default memo(PurchaseBillQrRequestModal);
