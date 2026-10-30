"use client";

import Link from "next/link";
import {
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Checkbox from "@/components/ui/Checkbox";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import OrderQrStickerPreview from "@/components/erp/order-qr-sticker-preview";
import OrderQrPrintSheetPreview from "@/components/erp/order-qr-print-sheet-preview";
import { createOrderQrStickerDataUrl } from "@/components/erp/order-qr-print-output";
import {
  DEFAULT_QR_FIELD_STYLE,
  createDefaultOrderQrTemplateLayout,
  ORDER_QR_TEMPLATE_FIELDS,
  ORDER_QR_TEMPLATE_SAMPLE_VALUES,
  ORDER_QR_TEMPLATE_SIZES,
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateLayout,
  type OrderQrTemplateFieldKey,
} from "@/lib/services/orders/order-qr-template-contract";
import type { PageSetupPrintSnapshot } from "@/lib/services/design-development/page-setup-template-contract";

export default function BarcodeQrCodeTemplateCreatePage({
  workspaceId,
  organizationId,
  templateId,
}: {
  workspaceId: string;
  organizationId: string;
  templateId?: string;
}) {
  const router = useRouter();
  const templatesHref = `/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/templates`;
  const detailHref = templateId ? `${templatesHref}/${encodeURIComponent(templateId)}` : templatesHref;
  const [name, setName] = useState("");
  const [qrFieldKey, setQrFieldKey] = useState<OrderQrTemplateFieldKey>("orderNo");
  const [displayFields, setDisplayFields] = useState<OrderQrTemplateFieldKey[]>([
    "orderNo",
    "styleName",
    "buyer",
  ]);
  const [selectedStyleField, setSelectedStyleField] =
    useState<OrderQrTemplateFieldKey>("orderNo");
  const [displayFieldStyles, setDisplayFieldStyles] = useState<
    Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>
  >({});
  const savedPageSetupRef = useRef<PageSetupPrintSnapshot | null>(null);
  const [layout, setLayout] = useState<OrderQrTemplateLayout>(() => ({
    ...createDefaultOrderQrTemplateLayout(["orderNo", "styleName", "buyer"]),
    printerType: "LASER",
  }));
  const previewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    key: "qr" | OrderQrTemplateFieldKey;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    maxX: number;
    maxY: number;
  } | null>(null);
  const [qrSize, setQrSize] = useState<(typeof ORDER_QR_TEMPLATE_SIZES)[number]>(256);
  const [stickerWidthMm, setStickerWidthMm] = useState(50);
  const [stickerLengthMm, setStickerLengthMm] = useState(30);
  const [pageSetupTemplateId, setPageSetupTemplateId] = useState("");
  const [pageSetupOptions, setPageSetupOptions] = useState<PageSetupPrintSnapshot[]>([]);
  const [isLoadingPageSetups, setIsLoadingPageSetups] = useState(true);
  const [pageSetupLoadError, setPageSetupLoadError] = useState("");
  const [pageSetupLoadAttempt, setPageSetupLoadAttempt] = useState(0);
  const [qrPreview, setQrPreview] = useState<{
    payload: string;
    size: number;
    dataUrl?: string;
    error?: string;
  }>({ payload: "", size: 0 });
  const [printStickerPreview, setPrintStickerPreview] = useState<{
    key?: string;
    dataUrl?: string;
    error?: string;
  }>({});
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(Boolean(templateId));
  const [templateLoadError, setTemplateLoadError] = useState("");
  const [templateLoadAttempt, setTemplateLoadAttempt] = useState(0);
  const selectedPageSetup = pageSetupOptions.find(({ id }) => id === pageSetupTemplateId) ?? null;

  useEffect(() => {
    let active = true;
    const query = new URLSearchParams({ organizationId, workspaceId });
    void fetch(`/api/design-development/page-setup-templates?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load Page Setup templates.");
        }
        return data as { templates: PageSetupPrintSnapshot[] };
      })
      .then(({ templates }) => {
        if (active) {
          const saved = savedPageSetupRef.current;
          setPageSetupOptions(
            saved && !templates.some(({ id }) => id === saved.id)
              ? [...templates, saved]
              : templates,
          );
          setPageSetupLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setPageSetupLoadError(
            error instanceof Error ? error.message : "Unable to load Page Setup templates.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoadingPageSetups(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, pageSetupLoadAttempt, workspaceId]);

  const previewEntries = useMemo(
    () => displayFields.map((key) => ({
        label: ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === key)!.label,
        value: ORDER_QR_TEMPLATE_SAMPLE_VALUES[key],
      })),
    [displayFields],
  );
  const printPreviewDisplayValues = useMemo(
    () => Object.fromEntries(previewEntries.map(({ value }, index) => [
      displayFields[index],
      value,
    ])),
    [displayFields, previewEntries],
  );
  const activeStyleFieldKey = displayFields.includes(selectedStyleField)
    ? selectedStyleField
    : displayFields[0] ?? "";
  const activeStyle = activeStyleFieldKey
    ? {
      ...DEFAULT_QR_FIELD_STYLE,
      ...displayFieldStyles[activeStyleFieldKey],
    }
    : DEFAULT_QR_FIELD_STYLE;
  const qrPayload = useMemo(
    () => JSON.stringify({
      [ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === qrFieldKey)!.label]:
        ORDER_QR_TEMPLATE_SAMPLE_VALUES[qrFieldKey],
    }),
    [qrFieldKey],
  );
  const qrDataUrl = qrPreview.payload === qrPayload && qrPreview.size === qrSize
    ? qrPreview.dataUrl
    : undefined;
  const qrError = qrPreview.payload === qrPayload && qrPreview.size === qrSize
    ? qrPreview.error
    : undefined;
  const printPreviewRecord = useMemo(() => ({
    orderNo: ORDER_QR_TEMPLATE_SAMPLE_VALUES.orderNo,
    qrSize,
    qrPayload,
    stickerWidthMm,
    stickerLengthMm,
    pageSetup: selectedPageSetup,
    layout,
    displayFields,
    displayValues: printPreviewDisplayValues,
    displayFieldStyles,
    printQuantity: 1,
  }), [
    displayFields,
    displayFieldStyles,
    layout,
    printPreviewDisplayValues,
    qrPayload,
    qrSize,
    selectedPageSetup,
    stickerLengthMm,
    stickerWidthMm,
  ]);
  const printPreviewKey = JSON.stringify(printPreviewRecord);
  const currentPrintStickerPreview = printStickerPreview.key === printPreviewKey
    ? printStickerPreview
    : {};

  useEffect(() => {
    if (!templateId) return;
    let active = true;
    const query = new URLSearchParams({ organizationId, workspaceId });
    void fetch(`/api/orders/qr-templates/${encodeURIComponent(templateId)}?${query}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Unable to load QR template.");
        }
        return data as {
          template: {
            name: string;
            qrFieldKey: string;
            fieldKeys: string[];
            displayFields: string[];
            displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
            layout: OrderQrTemplateLayout;
            qrSize: number;
            stickerWidthMm: number;
            stickerLengthMm: number;
            pageSetup: PageSetupPrintSnapshot | null;
          };
        };
      })
      .then(({ template }) => {
        if (!active) return;
        setName(template.name);
        const validFields = template.fieldKeys.filter(
          (key): key is OrderQrTemplateFieldKey =>
            ORDER_QR_TEMPLATE_FIELDS.some((field) => field.key === key),
        );
        setQrFieldKey(ORDER_QR_TEMPLATE_FIELDS.some((field) => field.key === template.qrFieldKey)
          ? template.qrFieldKey as OrderQrTemplateFieldKey
          : validFields[0] ?? "orderNo");
        setDisplayFields(template.displayFields.filter(
          (key): key is OrderQrTemplateFieldKey =>
            ORDER_QR_TEMPLATE_FIELDS.some((field) => field.key === key),
        ));
        setDisplayFieldStyles(template.displayFieldStyles);
        setLayout({ ...template.layout, printerType: "LASER" });
        setPageSetupTemplateId(template.pageSetup?.id ?? "");
        savedPageSetupRef.current = template.pageSetup;
        const pageSetup = template.pageSetup;
        if (pageSetup) {
          setPageSetupOptions((current) => current.some(({ id }) => id === pageSetup.id)
            ? current
            : [...current, pageSetup]);
        }
        if (ORDER_QR_TEMPLATE_SIZES.includes(
          template.qrSize as (typeof ORDER_QR_TEMPLATE_SIZES)[number],
        )) {
          setQrSize(template.qrSize as (typeof ORDER_QR_TEMPLATE_SIZES)[number]);
        }
        setStickerWidthMm(template.stickerWidthMm);
        setStickerLengthMm(template.stickerLengthMm);
        setTemplateLoadError("");
      })
      .catch((error: unknown) => {
        if (active) {
          setTemplateLoadError(error instanceof Error ? error.message : "Unable to load QR template.");
        }
      })
      .finally(() => {
        if (active) setIsLoadingTemplate(false);
      });

    return () => {
      active = false;
    };
  }, [organizationId, templateId, templateLoadAttempt, workspaceId]);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(qrPayload, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: qrSize,
    })
      .then((dataUrl) => {
        if (active) setQrPreview({ payload: qrPayload, size: qrSize, dataUrl });
      })
      .catch((error: unknown) => {
        console.error("Unable to generate the order QR template preview.", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        if (active) {
          setQrPreview({
            payload: qrPayload,
            size: qrSize,
            error: "QR preview could not be generated.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [qrPayload, qrSize]);

  useEffect(() => {
    if (!selectedPageSetup) return;

    let active = true;
    const timer = window.setTimeout(() => {
      void createOrderQrStickerDataUrl(printPreviewRecord)
        .then((dataUrl) => {
          if (active) setPrintStickerPreview({ key: printPreviewKey, dataUrl });
        })
        .catch((error: unknown) => {
          if (active) {
            setPrintStickerPreview({
              key: printPreviewKey,
              error: error instanceof Error
                ? error.message
                : "Unable to prepare the print-sheet preview.",
            });
          }
        });
    }, 150);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [printPreviewKey, printPreviewRecord, selectedPageSetup]);

  const toggleDisplayField = (fieldKey: OrderQrTemplateFieldKey, checked: boolean) => {
    setDisplayFields((current) => checked
      ? [...current, fieldKey]
      : current.filter((key) => key !== fieldKey));
    if (checked) {
      setSelectedStyleField(fieldKey);
      setLayout((current) => {
        if (current.fields[fieldKey]) return current;
        const defaults = createDefaultOrderQrTemplateLayout([...displayFields, fieldKey]);
        return {
          ...current,
          fields: { ...current.fields, [fieldKey]: defaults.fields[fieldKey] },
        };
      });
    }
    setSaveError("");
  };

  const updateDisplayStyle = (
    fieldKey: OrderQrTemplateFieldKey,
    patch: Partial<OrderQrDisplayFieldStyle>,
  ) => {
    setDisplayFieldStyles((current) => ({
      ...current,
      [fieldKey]: {
        ...DEFAULT_QR_FIELD_STYLE,
        ...current[fieldKey],
        ...patch,
      },
    }));
    setSaveError("");
  };

  const updateLayoutPosition = (
    key: "qr" | OrderQrTemplateFieldKey,
    x: number,
    y: number,
  ) => {
    setLayout((current) => key === "qr"
      ? { ...current, qr: { x, y } }
      : { ...current, fields: { ...current.fields, [key]: { x, y } } });
    setSaveError("");
  };

  const handlePreviewPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const preview = previewRef.current;
    if (!drag || !preview || drag.pointerId !== event.pointerId) return;
    const bounds = preview.getBoundingClientRect();
    const x = Math.max(0, Math.min(
      drag.maxX,
      ((event.clientX - drag.offsetX - bounds.left) / bounds.width) * 100,
    ));
    const y = Math.max(0, Math.min(
      drag.maxY,
      ((event.clientY - drag.offsetY - bounds.top) / bounds.height) * 100,
    ));
    updateLayoutPosition(drag.key, Math.round(x * 100) / 100, Math.round(y * 100) / 100);
  };

  const startPreviewDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: "qr" | OrderQrTemplateFieldKey,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const previewBounds = previewRef.current?.getBoundingClientRect();
    dragRef.current = {
      key,
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
      maxX: previewBounds ? Math.max(0, 100 - bounds.width / previewBounds.width * 100) : 100,
      maxY: previewBounds ? Math.max(0, 100 - bounds.height / previewBounds.height * 100) : 100,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePreviewKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    key: "qr" | OrderQrTemplateFieldKey,
  ) => {
    const currentPosition = key === "qr" ? layout.qr : layout.fields[key];
    if (!currentPosition) return;
    const itemBounds = event.currentTarget.getBoundingClientRect();
    const previewBounds = previewRef.current?.getBoundingClientRect();
    const maxX = previewBounds
      ? Math.max(0, 100 - itemBounds.width / previewBounds.width * 100)
      : 100;
    const maxY = previewBounds
      ? Math.max(0, 100 - itemBounds.height / previewBounds.height * 100)
      : 100;
    const step = event.shiftKey ? 5 : 1;
    const delta = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    updateLayoutPosition(
      key,
      Math.max(0, Math.min(maxX, currentPosition.x + delta.x)),
      Math.max(0, Math.min(maxY, currentPosition.y + delta.y)),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveError("");

    try {
      const query = new URLSearchParams({ organizationId, workspaceId });
      const response = await fetch(
        templateId
          ? `/api/orders/qr-templates/${encodeURIComponent(templateId)}?${query}`
          : `/api/orders/qr-templates?${query}`,
        {
          method: templateId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            qrFieldKey,
            displayFields,
            displayFieldStyles,
            layout,
            qrSize,
            pageSetupTemplateId,
            stickerWidthMm,
            stickerLengthMm,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Unable to save QR template.");
      }

      router.push(detailHref);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save QR template.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="min-w-0 space-y-6">
      <header className="space-y-2">
        <Link
          href={templatesHref}
          className="text-sm font-medium text-[var(--erp-brand)] hover:underline"
        >
          Templates
        </Link>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">
            {templateId ? "Edit Template" : "Create Template"}
          </h1>
          <p className="text-sm text-slate-600">
            Select order fields and preview the QR tag before saving.
          </p>
        </div>
      </header>

      {templateLoadError && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-danger)]"
          role="alert"
        >
          <span>{templateLoadError}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsLoadingTemplate(true);
              setTemplateLoadAttempt((attempt) => attempt + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {isLoadingTemplate ? (
        <Card>
          <p className="text-sm text-[var(--erp-text-muted)]" role="status">Loading template...</p>
        </Card>
      ) : !templateLoadError ? (
        <form onSubmit={handleSubmit} className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
          <div className="min-w-0 space-y-6">
            <Card className="space-y-5">
            <Input
              label="Template Name"
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSaveError("");
              }}
              maxLength={100}
              required
              autoFocus
            />
            <Select
              label="Type"
              name="type"
              value="Order Tags"
              disabled
              options={[{ value: "Order Tags", label: "Order Tags" }]}
            />
            <Select
              label="QR Code Size"
              name="qrSize"
              value={String(qrSize)}
              onChange={(event) =>
                setQrSize(Number(event.target.value) as typeof qrSize)
              }
              options={ORDER_QR_TEMPLATE_SIZES.map((size) => ({
                value: String(size),
                label: `${size} × ${size} px`,
              }))}
            />
            <Select
              label="Page Setup"
              name="pageSetupTemplateId"
              value={pageSetupTemplateId}
              onChange={(event) => {
                const nextId = event.currentTarget.value;
                const pageSetup = pageSetupOptions.find(({ id }) => id === nextId);
                setPageSetupTemplateId(nextId);
                if (pageSetup) {
                  setStickerWidthMm(pageSetup.stickerWidthMm);
                  setStickerLengthMm(pageSetup.stickerLengthMm);
                  setLayout((current) => ({ ...current, printerType: "LASER" }));
                }
                setSaveError("");
              }}
              disabled={isLoadingPageSetups || Boolean(pageSetupLoadError)}
              required
            >
              <option value="">
                {isLoadingPageSetups ? "Loading Page Setups..." : "Select Page Setup"}
              </option>
              {pageSetupOptions.map((pageSetup) => (
                <option key={pageSetup.id} value={pageSetup.id}>
                  {pageSetup.name} · {pageSetup.paperSize} {pageSetup.orientation.toLowerCase()}
                </option>
              ))}
            </Select>
            {pageSetupLoadError && (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--erp-danger)]" role="alert">{pageSetupLoadError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsLoadingPageSetups(true);
                    setPageSetupLoadAttempt((attempt) => attempt + 1);
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
            {!isLoadingPageSetups && !pageSetupLoadError && pageSetupOptions.length === 0 && (
              <p className="text-sm text-[var(--erp-text-muted)]">
                Create a Page Setup before saving a QR template.{" "}
                <Link
                  href={`/dashboard/${workspaceId}/organizations/${organizationId}/design-development/barcode-qr-code/page-setup/create`}
                  className="font-medium text-[var(--erp-brand)] hover:underline"
                >
                  Create Page Setup
                </Link>
              </p>
            )}
            {selectedPageSetup && (
              <p className="text-sm text-[var(--erp-text-muted)]" role="status">
                Sticker size {selectedPageSetup.stickerWidthMm} × {selectedPageSetup.stickerLengthMm} mm ·{" "}
                {selectedPageSetup.paperSize} {selectedPageSetup.orientation.toLowerCase()} sheet. These dimensions and margins are fixed by the selected Page Setup.
              </p>
            )}
            </Card>

            <Card className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">QR Code Field</h2>
              <p className="text-sm text-slate-600">
                Choose exactly one order field to encode in the QR code.
              </p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {ORDER_QR_TEMPLATE_FIELDS.map((field) => (
                <Checkbox
                  key={field.key}
                  label={field.label}
                  checked={qrFieldKey === field.key}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setQrFieldKey(field.key);
                      setSaveError("");
                    }
                  }}
                />
              ))}
            </div>
            </Card>

            <Card className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-slate-900">Display Fields</h2>
                <p className="text-sm text-slate-600">
                  Select the order details to print beside the QR code and customize each field.
                </p>
              </div>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                {ORDER_QR_TEMPLATE_FIELDS.map((field) => (
                  <Checkbox
                    key={field.key}
                    label={field.label}
                    checked={displayFields.includes(field.key)}
                    onChange={(event) => toggleDisplayField(field.key, event.target.checked)}
                  />
                ))}
              </div>
              {displayFields.length === 0 && (
                <p className="text-sm text-[var(--erp-text-muted)]">
                  No additional fields will appear on the sticker.
                </p>
              )}
            </Card>

            {saveError && (
              <p className="text-sm text-[var(--erp-danger)]" role="alert">{saveError}</p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(templateId ? detailHref : templatesHref)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : templateId ? "Save Changes" : "Save Template"}
            </Button>
            </div>
          </div>

          <div className="min-w-0 space-y-6">
          <Card className="h-fit space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">QR Preview</h2>
            <p className="text-sm text-slate-600">
              Sample order values show how your selected fields will be encoded.
            </p>
          </div>
          {displayFields.length > 0 && (
            <div className="space-y-3 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-4">
              <h3 className="text-sm font-semibold text-slate-900">Selected field style</h3>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <Select
                  label="Field"
                  value={activeStyleFieldKey}
                  onChange={(event) => {
                    const fieldKey = event.target.value;
                    if (displayFields.includes(fieldKey as OrderQrTemplateFieldKey)) {
                      setSelectedStyleField(fieldKey as OrderQrTemplateFieldKey);
                    }
                  }}
                >
                  {displayFields.map((fieldKey) => (
                    <option key={fieldKey} value={fieldKey}>
                      {ORDER_QR_TEMPLATE_FIELDS.find(({ key }) => key === fieldKey)?.label ?? fieldKey}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Font Size (px)"
                  type="number"
                  min={8}
                  max={48}
                  step={1}
                  value={activeStyle.fontSize}
                  onChange={(event) => updateDisplayStyle(activeStyleFieldKey, {
                    fontSize: Number(event.target.value),
                  })}
                  required
                />
                <Input
                  label="Text Color"
                  type="color"
                  value={activeStyle.color}
                  onChange={(event) => updateDisplayStyle(activeStyleFieldKey, {
                    color: event.target.value,
                  })}
                  aria-label="Selected field text color"
                  className="h-10 p-1"
                />
                <div className="flex flex-wrap items-center gap-6 sm:pt-6">
                  <Checkbox
                    label="Bold"
                    checked={activeStyle.bold}
                    onChange={(event) => updateDisplayStyle(activeStyleFieldKey, {
                      bold: event.target.checked,
                    })}
                  />
                  <Checkbox
                    label="Underline"
                    checked={activeStyle.underline}
                    onChange={(event) => updateDisplayStyle(activeStyleFieldKey, {
                      underline: event.target.checked,
                    })}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="flex w-full items-center justify-center rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-soft)] p-3">
            <OrderQrStickerPreview
              rootRef={previewRef}
              qrDataUrl={qrDataUrl}
              qrError={qrError}
              fields={previewEntries.map(({ label, value }, index) => ({
                key: displayFields[index],
                label,
                value,
                style: {
                  ...DEFAULT_QR_FIELD_STYLE,
                  ...displayFieldStyles[displayFields[index]],
                },
              }))}
              layout={layout}
              stickerWidthMm={stickerWidthMm}
              stickerLengthMm={stickerLengthMm}
              interactive
              qrAlt="QR code template preview"
              onPointerMove={handlePreviewPointerMove}
              onPointerUp={(event) => {
                if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
              }}
              onPointerCancel={(event) => {
                if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
              }}
              onItemPointerDown={startPreviewDrag}
              onItemKeyDown={handlePreviewKeyDown}
            />
          </div>
          <p className="text-xs text-[var(--erp-text-muted)]">
            Drag the QR code and each display field to position them. Use arrow keys for precision.
            {" "}Sticker: {stickerWidthMm} × {stickerLengthMm} mm · {selectedPageSetup
              ? `${selectedPageSetup.paperSize} ${selectedPageSetup.orientation.toLowerCase()} sheet`
              : "Select Page Setup"}
            {" "}· QR field: {ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === qrFieldKey)?.label}
          </p>
          </Card>
          <Card className="h-fit space-y-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-900">Print Setup Preview</h2>
              <p className="text-sm text-slate-600">
                See the sticker artwork repeated on the selected Page Setup with its saved margins and gaps.
              </p>
            </div>
            {currentPrintStickerPreview.error ? (
              <p className="text-sm text-[var(--erp-danger)]" role="alert">
                {currentPrintStickerPreview.error}
              </p>
            ) : (
              <OrderQrPrintSheetPreview
                pageSetup={selectedPageSetup}
                stickerDataUrl={currentPrintStickerPreview.dataUrl}
                stickerWidthMm={stickerWidthMm}
                stickerLengthMm={stickerLengthMm}
              />
            )}
          </Card>
          </div>
        </form>
      ) : null}
    </section>
  );
}
