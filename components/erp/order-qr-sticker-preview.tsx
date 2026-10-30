"use client";

import Image from "next/image";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  Ref,
} from "react";

import Button from "@/components/ui/Button";
import {
  DEFAULT_QR_FIELD_STYLE,
  type OrderQrDisplayFieldStyle,
  type OrderQrTemplateFieldKey,
  type OrderQrTemplateLayout,
} from "@/lib/services/orders/order-qr-template-contract";

export type OrderQrStickerPreviewField = {
  key: OrderQrTemplateFieldKey;
  label: string;
  value: string;
  style?: OrderQrDisplayFieldStyle;
};

type Props = {
  qrDataUrl?: string;
  qrError?: string;
  fields: OrderQrStickerPreviewField[];
  layout: OrderQrTemplateLayout;
  stickerWidthMm: number;
  stickerLengthMm: number;
  interactive?: boolean;
  qrAlt?: string;
  className?: string;
  rootRef?: Ref<HTMLDivElement>;
  onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onItemPointerDown?: (
    event: ReactPointerEvent<HTMLButtonElement>,
    key: "qr" | OrderQrTemplateFieldKey,
  ) => void;
  onItemKeyDown?: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    key: "qr" | OrderQrTemplateFieldKey,
  ) => void;
  onRetry?: () => void;
};

export default function OrderQrStickerPreview({
  qrDataUrl,
  qrError,
  fields,
  layout,
  stickerWidthMm,
  stickerLengthMm,
  interactive = false,
  qrAlt = "Order QR code",
  className = "",
  rootRef,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onItemPointerDown,
  onItemKeyDown,
  onRetry,
}: Props) {
  const qrWidthPercent = Math.min(
    52,
    Math.min(stickerWidthMm, stickerLengthMm) * 52 / stickerWidthMm,
  );
  const qrClassName = interactive
    ? "border border-dashed border-[var(--erp-brand)]/50 bg-[var(--erp-surface)]/70 shadow-sm cursor-move"
    : "border border-transparent bg-transparent shadow-none pointer-events-none";
  const fieldClassName = interactive
    ? "border border-dashed border-[var(--erp-brand)]/50 bg-[var(--erp-surface)]/70 shadow-sm cursor-move"
    : "border border-transparent bg-transparent shadow-none pointer-events-none";

  return (
    <div
      ref={rootRef}
      aria-label={`Sticker preview, ${stickerWidthMm} by ${stickerLengthMm} millimeters`}
      className={`relative w-full overflow-hidden rounded border-2 border-dashed border-[var(--erp-brand)] bg-white ${className}`}
      style={{ aspectRatio: `${stickerWidthMm} / ${stickerLengthMm}` }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-layout-item={interactive ? true : undefined}
        tabIndex={interactive ? undefined : -1}
        aria-hidden={interactive ? undefined : true}
        aria-label={interactive
          ? "Move QR code. Use arrow keys to reposition; hold Shift to move farther."
          : undefined}
        title={interactive ? "Drag to move QR code; use arrow keys for precise placement" : undefined}
        className={`absolute min-h-0 justify-start rounded p-1 touch-none text-left focus-visible:outline-none ${qrClassName}`}
        style={{
          left: `${layout.qr.x}%`,
          top: `${layout.qr.y}%`,
          width: `${qrWidthPercent}%`,
          aspectRatio: "1",
        }}
        onPointerDown={interactive && onItemPointerDown
          ? (event) => onItemPointerDown(event, "qr")
          : undefined}
        onKeyDown={interactive && onItemKeyDown
          ? (event) => onItemKeyDown(event, "qr")
          : undefined}
      >
        {qrDataUrl ? (
          <Image
            src={qrDataUrl}
            alt={qrAlt}
            fill
            unoptimized
            draggable={false}
            className="pointer-events-none object-contain"
          />
        ) : qrError ? (
          <span className="text-xs text-[var(--erp-danger)]" role="alert">{qrError}</span>
        ) : (
          <span className="text-xs text-[var(--erp-text-muted)]" role="status">
            Preparing QR...
          </span>
        )}
      </Button>

      {qrError && onRetry && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            Retry QR
          </Button>
        </div>
      )}

      {fields.map((field, index) => {
        const position = layout.fields[field.key]
          ?? { x: 44, y: 16 + index * 16 };
        const style = { ...DEFAULT_QR_FIELD_STYLE, ...field.style };

        return (
          <Button
            key={field.key}
            type="button"
            variant="ghost"
            size="sm"
            data-layout-item={interactive ? true : undefined}
            tabIndex={interactive ? undefined : -1}
            aria-hidden={interactive ? undefined : true}
            aria-label={interactive
              ? `Move ${field.label}. Use arrow keys to reposition; hold Shift to move farther.`
              : undefined}
            title={interactive ? `Drag to move ${field.label}; use arrow keys for precise placement` : undefined}
            className={`absolute min-h-0 justify-start gap-0 rounded px-1 py-0.5 touch-none truncate text-left focus-visible:outline-none ${fieldClassName}`}
            style={{
              left: `${position.x}%`,
              top: `${position.y}%`,
              width: "52%",
              color: style.color,
              fontSize: style.fontSize,
              fontWeight: style.bold ? 700 : 400,
              textDecoration: style.underline ? "underline" : "none",
            }}
            onPointerDown={interactive && onItemPointerDown
              ? (event) => onItemPointerDown(event, field.key)
              : undefined}
            onKeyDown={interactive && onItemKeyDown
              ? (event) => onItemKeyDown(event, field.key)
              : undefined}
          >
            {field.label}: {field.value}
          </Button>
        );
      })}
    </div>
  );
}
