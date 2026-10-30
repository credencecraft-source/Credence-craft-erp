"use client";

import Image from "next/image";

import type { PageSetupPrintSnapshot } from "@/lib/services/design-development/page-setup-template-contract";
import { getA4StickerGrid } from "@/lib/services/orders/order-qr-template-contract";

type Props = {
  pageSetup: PageSetupPrintSnapshot | null;
  stickerDataUrl?: string;
  stickerWidthMm: number;
  stickerLengthMm: number;
};

export default function OrderQrPrintSheetPreview({
  pageSetup,
  stickerDataUrl,
  stickerWidthMm,
  stickerLengthMm,
}: Props) {
  if (!pageSetup) {
    return (
      <p className="text-sm text-[var(--erp-text-muted)]" role="status">
        Select a Page Setup to preview the printed sheet.
      </p>
    );
  }

  const grid = getA4StickerGrid(
    stickerWidthMm,
    stickerLengthMm,
    "A4_AUTO",
    pageSetup,
  );
  if (!grid) {
    return (
      <p className="text-sm text-[var(--erp-danger)]" role="alert">
        The sticker does not fit inside this Page Setup&apos;s printable area.
      </p>
    );
  }
  if (!stickerDataUrl) {
    return (
      <p className="text-sm text-[var(--erp-text-muted)]" role="status">
        Preparing the print-sheet preview...
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="relative mx-auto overflow-hidden border border-[var(--erp-border)] bg-white shadow-sm"
        aria-label={`${pageSetup.name}, ${pageSetup.paperSize} ${pageSetup.orientation.toLowerCase()} sheet with ${grid.count} stickers`}
        role="img"
        style={{
          width: grid.portrait ? "min(100%, 28rem)" : "min(100%, 48rem)",
          aspectRatio: `${grid.pageWidthMm} / ${grid.pageHeightMm}`,
        }}
      >
        {Array.from({ length: grid.count }, (_, index) => {
          const row = Math.floor(index / grid.columns);
          const column = index % grid.columns;
          return (
            <div
              key={index}
              className="absolute overflow-hidden border border-dashed border-[var(--erp-brand)]"
              aria-hidden="true"
              style={{
                left: `${(grid.marginLeftMm + column * (
                  stickerWidthMm + grid.horizontalGapMm
                )) / grid.pageWidthMm * 100}%`,
                top: `${(grid.marginTopMm + row * (
                  stickerLengthMm + grid.verticalGapMm
                )) / grid.pageHeightMm * 100}%`,
                width: `${stickerWidthMm / grid.pageWidthMm * 100}%`,
                aspectRatio: `${stickerWidthMm} / ${stickerLengthMm}`,
              }}
            >
              <Image
                src={stickerDataUrl}
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
        {pageSetup.paperSize} {pageSetup.orientation.toLowerCase()} ·{" "}
        {grid.pageWidthMm} × {grid.pageHeightMm} mm ·{" "}
        {grid.columns} columns × {grid.rows} rows · {grid.count} stickers per sheet
      </p>
      <p className="text-center text-xs text-[var(--erp-text-muted)]">
        Margins: {pageSetup.marginTopMm} mm top, {pageSetup.marginBottomMm} mm bottom,{" "}
        {pageSetup.marginLeftMm} mm left, {pageSetup.marginRightMm} mm right · Gaps:{" "}
        {pageSetup.horizontalGapMm} × {pageSetup.verticalGapMm} mm
      </p>
    </div>
  );
}
