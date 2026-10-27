"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, Printer, QrCode, X } from "lucide-react";

import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import {
  ORDER_QR_TEMPLATE_FIELDS,
  buildOrderQrPayload,
  type OrderQrTemplateFieldKey,
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateLayout,
} from "@/lib/services/orders/order-qr-template-contract";

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
  const qrContent = useMemo(
    () => buildOrderQrPayload(
      selectedTemplate ? [selectedTemplate.qrFieldKey] : [],
      orderFields,
      orderNo,
    ),
    [orderFields, orderNo, selectedTemplate],
  );
  const displayContent = useMemo(
    () => buildOrderQrPayload(
      selectedTemplate?.displayFields ?? [],
      orderFields,
      orderNo,
    ).entries,
    [orderFields, orderNo, selectedTemplate],
  );
  const selectedFields = displayContent;
  const qrPayload = qrContent.payload;
  const qrSize = selectedTemplate?.qrSize ?? 256;
  const qrDataUrl = qrState.payload === qrPayload && qrState.size === qrSize
    ? qrState.dataUrl
    : undefined;
  const qrError = qrState.payload === qrPayload && qrState.size === qrSize
    ? qrState.error
    : undefined;
  const templatesHref = `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates`;

  const openQrModal = () => {
    setIsLoadingTemplates(true);
    setTemplateError("");
    setRequestState({ type: null, status: "idle", message: "" });
    setOpen(true);
  };

  const submitOutputRequest = async (requestType: "PRINT" | "DOWNLOAD") => {
    setRequestState({ type: requestType, status: "submitting", message: "" });
    const query = new URLSearchParams({ organizationId, workspaceId });
    try {
      const response = await fetch(`/api/orders/qr-print-requests?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          templateId: selectedTemplateId || null,
          requestType,
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
    if (!open) return;
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
  }, [open, qrPayload, qrRetryCount, qrSize]);

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
              disabled={isLoadingTemplates || templates.length === 0}
              options={[
                { value: "", label: "Order Number only" },
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
              No templates yet. The QR code will contain the order number.
            </p>
          )}

          <div className="grid min-w-0 gap-6 sm:grid-cols-[minmax(16rem,1fr)_minmax(0,1fr)] sm:items-center">
            <div className="flex min-h-72 min-w-0 items-center justify-center rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-4">
              {qrDataUrl ? (
                <Image
                  src={qrDataUrl}
                  alt={`QR code for order ${orderNo}`}
                  width={qrSize}
                  height={qrSize}
                  unoptimized
                  className="h-auto w-full max-w-64"
                />
              ) : qrError ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-[var(--erp-danger)]" role="alert">{qrError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setQrRetryCount((count) => count + 1)}
                  >
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                  Preparing QR code...
                </p>
              )}
            </div>
            <dl className="grid min-w-0 gap-4">
              {selectedFields.length > 0 ? selectedFields.map(({ label, value }) => {
                const fieldKey = selectedTemplate?.displayFields.find((key) =>
                  ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === key)?.label === label,
                );
                const style = fieldKey ? selectedTemplate?.displayFieldStyles[fieldKey] : undefined;
                return (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                    {label}
                  </dt>
                  <dd
                    className="mt-1 break-words"
                    style={{
                      color: style?.color,
                      fontSize: style?.fontSize,
                      fontWeight: style?.bold ? 700 : 500,
                      textDecoration: style?.underline ? "underline" : "none",
                    }}
                  >
                    {value}
                  </dd>
                </div>
                );
              }) : (
                <>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                      Order No
                    </dt>
                    <dd className="mt-1 break-words text-base font-bold text-[var(--erp-text)]">{orderNo}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                      Style
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium text-[var(--erp-text)]">
                      {styleName?.trim() || "—"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                      Color
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium text-[var(--erp-text)]">
                      {colors?.trim() || "—"}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </div>
          <div className="space-y-3 border-t border-[var(--erp-border)] pt-4">
            <p className="text-sm text-[var(--erp-text-muted)]">
              Send this QR code and the selected order details to Design and Development for processing.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={requestState.status === "submitting"}
                onClick={() => void submitOutputRequest("PRINT")}
              >
                <Printer className="h-4 w-4" aria-hidden="true" />
                Request Print
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={requestState.status === "submitting"}
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
