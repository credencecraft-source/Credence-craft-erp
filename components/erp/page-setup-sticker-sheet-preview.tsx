"use client";

import { useId } from "react";

import Card from "@/components/ui/Card";
import {
  getPageSetupDimensions,
  getPageSetupStickerGrid,
  type PageSetupLayout,
  type PageSetupOrientation,
  type PageSetupPaperSize,
} from "@/lib/services/design-development/page-setup-template-contract";

function formatMillimeters(value: number) {
  return Number(value.toFixed(2)).toString();
}

export default function PageSetupStickerSheetPreview({
  paperSize,
  orientation,
  stickerWidthMm,
  stickerLengthMm,
  layout,
}: {
  paperSize: PageSetupPaperSize;
  orientation: PageSetupOrientation;
  stickerWidthMm: number;
  stickerLengthMm: number;
  layout: PageSetupLayout;
}) {
  const patternId = `page-setup-stickers-${useId().replace(/:/g, "")}`;
  const dimensions = getPageSetupDimensions(paperSize, orientation);
  const grid = getPageSetupStickerGrid(
    paperSize,
    orientation,
    stickerWidthMm,
    stickerLengthMm,
    layout,
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
          {paperSize} {orientation.toLowerCase()} page · {formatMillimeters(dimensions.pageWidthMm)}
          {" × "}{formatMillimeters(dimensions.pageLengthMm)} mm
        </p>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Stickers per row</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{grid.columns}</p>
        </div>
        <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Rows per page</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{grid.rows}</p>
        </div>
        <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Maximum stickers per page
          </p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{grid.count}</p>
        </div>
      </div>

      <div className="min-w-0 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
        <svg
          className="mx-auto block h-auto w-full max-w-[42rem] rounded-md border border-[var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-text-muted)]"
          viewBox={`0 0 ${dimensions.pageWidthMm} ${dimensions.pageLengthMm}`}
          role="img"
          aria-label={`${grid.columns} sticker columns by ${grid.rows} rows on ${paperSize} ${orientation.toLowerCase()}`}
        >
          <title>{grid.columns} stickers per row by {grid.rows} rows, {grid.count} stickers maximum</title>
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
                strokeWidth="0.35"
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
              strokeWidth="0.35"
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
            strokeWidth="0.4"
          />
          <rect
            x="0"
            y="0"
            width={dimensions.pageWidthMm}
            height={dimensions.pageLengthMm}
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
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
        Capacity includes your entered margins and sticker gaps. Confirm printer calibration before
        printing.
      </p>
    </Card>
  );
}
