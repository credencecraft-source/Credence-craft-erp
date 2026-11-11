"use client";

import { useId } from "react";

import Card from "@/components/ui/Card";
import {
  getThermalRollLayout,
  getPageSetupDimensions,
  getPageSetupPaperSizeLabel,
  getPageSetupStickerGrid,
  type PageSetupLayout,
  type PageSetupOrientation,
  type PageSetupPaperSize,
  type PageSetupPrinterType,
} from "@/lib/services/design-development/page-setup-template-contract";

function formatMillimeters(value: number) {
  return Number(value.toFixed(2)).toString();
}

export default function PageSetupStickerSheetPreview({
  printerType,
  paperSize,
  paperWidthMm,
  paperLengthMm,
  orientation,
  stickerWidthMm,
  stickerLengthMm,
  layout,
}: {
  printerType: PageSetupPrinterType;
  paperSize: PageSetupPaperSize;
  paperWidthMm: number | null;
  paperLengthMm: number | null;
  orientation: PageSetupOrientation;
  stickerWidthMm: number;
  stickerLengthMm: number;
  layout: PageSetupLayout;
}) {
  const patternId = `page-setup-stickers-${useId().replace(/:/g, "")}`;
  const thermalGrid = printerType === "THERMAL"
    ? getThermalRollLayout(
      paperWidthMm ?? 0,
      1,
      stickerWidthMm,
      stickerLengthMm,
      layout,
    )
    : null;
  const dimensions = printerType === "THERMAL"
    ? {
      pageWidthMm: paperWidthMm ?? 0,
      pageLengthMm: thermalGrid?.pageLengthMm
        ?? layout.marginTopMm + stickerLengthMm + layout.marginBottomMm,
    }
    : getPageSetupDimensions(
      paperSize,
      orientation,
      paperWidthMm,
      paperLengthMm,
    );
  const grid = thermalGrid
    ? { ...thermalGrid, count: thermalGrid.columns }
    : getPageSetupStickerGrid(
      paperSize,
      orientation,
      stickerWidthMm,
      stickerLengthMm,
      layout,
      paperWidthMm,
      paperLengthMm,
    );
  const usableWidth = dimensions.pageWidthMm - layout.marginLeftMm - layout.marginRightMm;
  const usableLength = dimensions.pageLengthMm - layout.marginTopMm - layout.marginBottomMm;
  const previewUsableWidth = Math.max(0, usableWidth);
  const previewUsableLength = Math.max(0, usableLength);
  const patternWidth = stickerWidthMm + layout.horizontalGapMm;
  const patternHeight = stickerLengthMm + layout.verticalGapMm;

  return (
    <Card className="min-w-0 space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">Sticker Sheet Preview</h2>
        <p className="text-sm text-slate-600">
          {printerType === "THERMAL"
            ? "Thermal roll"
            : `${getPageSetupPaperSizeLabel(paperSize)} ${orientation.toLowerCase()} page`} ·{" "}
          {formatMillimeters(dimensions.pageWidthMm)}
          {printerType === "THERMAL"
            ? " mm wide · length calculated for each print request"
            : ` × ${formatMillimeters(dimensions.pageLengthMm)} mm`}
        </p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Stickers per row</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{grid.columns}</p>
        </div>
        <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {printerType === "THERMAL" ? "Rows in preview" : "Rows per page"}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{grid.rows}</p>
        </div>
        <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {printerType === "THERMAL" ? "Roll length" : "Maximum stickers per page"}
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {printerType === "THERMAL" ? "Automatic" : grid.count}
          </p>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
        <svg
          className="mx-auto block h-auto w-full max-w-[42rem] rounded-md border border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-text-muted)]"
          viewBox={`0 0 ${Math.max(1, dimensions.pageWidthMm)} ${Math.max(1, dimensions.pageLengthMm)}`}
          role="img"
          aria-label={printerType === "THERMAL"
            ? `${grid.columns} sticker columns on thermal roll, ${formatMillimeters(dimensions.pageWidthMm)} mm wide`
            : `${grid.columns} sticker columns by ${grid.rows} rows on ${getPageSetupPaperSizeLabel(paperSize)} ${orientation.toLowerCase()}`}
        >
          <title>{printerType === "THERMAL"
            ? `${grid.columns} stickers per row on a roll with automatic length`
            : `${grid.columns} stickers per row by ${grid.rows} rows, ${grid.count} stickers maximum`}</title>
          <defs>
            <pattern
              id={patternId}
              x={grid.startXmm}
              y={grid.startYmm}
              width={patternWidth}
              height={patternHeight}
              patternUnits="userSpaceOnUse"
            >
              <rect
                x="0"
                y="0"
                width={stickerWidthMm}
                height={stickerLengthMm}
                fill="var(--erp-surface)"
                stroke="currentColor"
                strokeWidth={printerType === "THERMAL" ? "0.75" : "0.35"}
                vectorEffect={printerType === "THERMAL" ? "non-scaling-stroke" : undefined}
              />
            </pattern>
          </defs>
          {grid.count > 0 && (
            <rect
              x={grid.startXmm}
              y={grid.startYmm}
              width={grid.gridWidthMm}
              height={grid.gridLengthMm}
              fill={`url(#${patternId})`}
              stroke="currentColor"
              strokeWidth={printerType === "THERMAL" ? "0.75" : "0.35"}
              vectorEffect={printerType === "THERMAL" ? "non-scaling-stroke" : undefined}
            />
          )}
          <rect
            x={layout.marginLeftMm}
            y={layout.marginTopMm}
            width={previewUsableWidth}
            height={previewUsableLength}
            fill="none"
            stroke="currentColor"
            strokeDasharray="2 1"
            strokeWidth={printerType === "THERMAL" ? "0.75" : "0.4"}
            vectorEffect={printerType === "THERMAL" ? "non-scaling-stroke" : undefined}
          />
          <rect
            x="0"
            y="0"
            width={dimensions.pageWidthMm}
            height={dimensions.pageLengthMm}
            fill="none"
            stroke="currentColor"
            strokeWidth={printerType === "THERMAL" ? "0.75" : "0.5"}
            vectorEffect={printerType === "THERMAL" ? "non-scaling-stroke" : undefined}
          />
        </svg>
      </div>
      {grid.count === 0 && (
        <p className="text-sm text-[var(--erp-text-muted)]" role="status">
          The current sticker size and margins do not fit any labels on this page.
        </p>
      )}
      <p className="text-xs text-[var(--erp-text-muted)]">
        Dashed border shows the margin limits; the sticker grid starts at the top and left margins.
        {printerType === "THERMAL"
          ? " Roll length is calculated from the actual print quantity."
          : " Capacity includes your entered margins and sticker gaps."}{" "}
        Confirm printer calibration before printing.
      </p>
    </Card>
  );
}
