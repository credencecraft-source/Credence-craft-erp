"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import OrderQrStickerPreview from "@/components/erp/order-qr-sticker-preview";
import {
  buildOrderQrPayload,
  ORDER_QR_TEMPLATE_FIELDS,
  ORDER_QR_TEMPLATE_SAMPLE_VALUES,
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateLayout,
  type OrderQrTemplateFieldKey,
} from "@/lib/services/orders/order-qr-template-contract";

type TemplateDetail = {
  id: string;
  name: string;
  type: string;
  fieldKeys: string[];
  qrFieldKey: OrderQrTemplateFieldKey;
  displayFields: OrderQrTemplateFieldKey[];
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  qrSize: number;
  stickerWidthMm: number;
  stickerLengthMm: number;
  updatedAt: string;
};

export default function BarcodeQrCodeTemplateDetailPage({
  workspaceId,
  organizationId,
  templateId,
}: {
  workspaceId: string;
  organizationId: string;
  templateId: string;
}) {
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [qrRetryCount, setQrRetryCount] = useState(0);
  const [qrPreview, setQrPreview] = useState<{
    payload: string;
    dataUrl?: string;
    error?: string;
  }>({ payload: "" });
  const router = useRouter();
  const templatesHref =
    `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates`;
  const editHref = `${templatesHref}/${encodeURIComponent(templateId)}/edit`;
  const query = useMemo(
    () => new URLSearchParams({ organizationId, workspaceId }),
    [organizationId, workspaceId],
  );

  useEffect(() => {
    let active = true;
    void fetch(`/api/orders/qr-templates/${encodeURIComponent(templateId)}?${query}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load QR template.");
        }
        return data as { template: TemplateDetail };
      })
      .then(({ template: loadedTemplate }) => {
        if (!active) return;
        setTemplate(loadedTemplate);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Unable to load QR template.");
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadAttempt, query, templateId]);

  const qrFieldLabel = ORDER_QR_TEMPLATE_FIELDS.find(
    (field) => field.key === template?.qrFieldKey,
  )?.label ?? template?.qrFieldKey;
  const displayFieldLabels = template?.displayFields.map(
    (key) => ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === key)?.label ?? key,
  ) ?? [];
  const qrPayload = template
    ? buildOrderQrPayload(
      [template.qrFieldKey],
      ORDER_QR_TEMPLATE_SAMPLE_VALUES,
    ).payload
    : "";
  const qrDataUrl = qrPreview.payload === qrPayload ? qrPreview.dataUrl : undefined;
  const qrError = qrPreview.payload === qrPayload ? qrPreview.error : undefined;

  useEffect(() => {
    if (!template || !qrPayload) return;
    let active = true;
    void QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: template.qrSize,
    })
      .then((dataUrl) => {
        if (active) setQrPreview({ payload: qrPayload, dataUrl });
      })
      .catch((error: unknown) => {
        console.error("Unable to generate the saved order QR template preview.", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        if (active) {
          setQrPreview({ payload: qrPayload, error: "QR preview could not be generated." });
        }
      });

    return () => {
      active = false;
    };
  }, [qrPayload, qrRetryCount, template]);

  return (
    <section className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href={templatesHref}
            className="text-sm font-medium text-[var(--erp-brand)] hover:underline"
          >
            Templates
          </Link>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">Template Details</h1>
            <p className="text-sm text-slate-600">View this saved QR template.</p>
          </div>
        </div>
        {template && (
          <Button type="button" onClick={() => router.push(editHref)}>
            Edit Template
          </Button>
        )}
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

      {isLoading ? (
        <Card><p className="text-sm text-[var(--erp-text-muted)]" role="status">Loading template...</p></Card>
      ) : template ? (
        <>
        <Card className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">Saved QR Sticker Preview</h2>
            <p className="text-sm text-slate-600">
              This is the saved template layout with sample order values.
            </p>
          </div>
          <OrderQrStickerPreview
            qrDataUrl={qrDataUrl}
            qrError={qrError}
            qrAlt={`Saved QR code preview for ${template.name}`}
            fields={template.displayFields.map((key) => ({
              key,
              label: ORDER_QR_TEMPLATE_FIELDS.find(({ key: fieldKey }) => fieldKey === key)?.label ?? key,
              value: ORDER_QR_TEMPLATE_SAMPLE_VALUES[key],
              style: template.displayFieldStyles[key],
            }))}
            layout={template.layout}
            stickerWidthMm={template.stickerWidthMm}
            stickerLengthMm={template.stickerLengthMm}
            className="mx-auto max-w-3xl rounded-xl"
            onRetry={() => setQrRetryCount((count) => count + 1)}
          />
        </Card>
        <Card className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">{template.name}</h2>
            <Badge>{template.type === "ORDER_TAGS" ? "Order Tags" : template.type}</Badge>
          </div>
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                Template Name
              </dt>
              <dd className="mt-1 break-words text-sm text-[var(--erp-text)]">{template.name}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                QR Code Size
              </dt>
              <dd className="mt-1 text-sm text-[var(--erp-text)]">{template.qrSize} px</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                Sticker Size
              </dt>
              <dd className="mt-1 text-sm text-[var(--erp-text)]">
                {template.stickerWidthMm} × {template.stickerLengthMm} mm
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                QR Code Field
              </dt>
              <dd className="mt-1 text-sm text-[var(--erp-text)]">{qrFieldLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                QR Position
              </dt>
              <dd className="mt-1 text-sm text-[var(--erp-text)]">
                {template.layout.qr.x}%, {template.layout.qr.y}%
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                Display Fields
              </dt>
              {template.displayFields.length > 0 ? (
                <dd className="mt-2 space-y-2 text-sm text-[var(--erp-text)]">
                  {template.displayFields.map((key, index) => {
                    const style = template.displayFieldStyles[key];
                    return (
                      <div key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{displayFieldLabels[index]}</span>
                        <span className="text-[var(--erp-text-muted)]">
                          {style
                            ? `${style.fontSize}px${style.bold ? ", bold" : ""}${style.underline ? ", underline" : ""}, ${style.color}`
                            : "Default style"}
                          {` · ${template.layout.fields[key]?.x ?? 0}%, ${template.layout.fields[key]?.y ?? 0}%`}
                        </span>
                      </div>
                    );
                  })}
                </dd>
              ) : (
                <dd className="mt-1 text-sm text-[var(--erp-text-muted)]">
                  No display fields selected
                </dd>
              )}
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--erp-text-muted)]">
                Last Updated
              </dt>
              <dd className="mt-1 text-sm text-[var(--erp-text)]">
                {new Date(template.updatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </Card>
        </>
      ) : null}
    </section>
  );
}
