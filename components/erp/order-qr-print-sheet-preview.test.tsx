import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { PageSetupPrintSnapshot } from "@/lib/services/design-development/page-setup-template-contract";
import OrderQrPrintSheetPreview from "./order-qr-print-sheet-preview";

const pageSetup: PageSetupPrintSnapshot = {
  id: "setup-1",
  name: "A4 MARGIN TEST",
  printerType: "LASER",
  paperSize: "A4",
  paperWidthMm: null,
  paperLengthMm: null,
  orientation: "PORTRAIT",
  stickerWidthMm: 50,
  stickerLengthMm: 30,
  marginTopMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  marginRightMm: 10,
  horizontalGapMm: 5,
  verticalGapMm: 5,
};

describe("OrderQrPrintSheetPreview", () => {
  it("shows a page of stickers aligned to the saved setup and reports its capacity", () => {
    const markup = renderToStaticMarkup(createElement(OrderQrPrintSheetPreview, {
      pageSetup,
      stickerDataUrl: "data:image/png;base64,AA==",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
    }));

    expect(markup).toContain("A4 portrait");
    expect(markup).toContain("3 columns × 8 rows · 24 stickers per sheet");
    expect(markup).toContain("Margins: 10 mm top, 10 mm bottom, 10 mm left, 10 mm right");
    expect(markup.match(/aria-hidden="true"/g)).toHaveLength(24);
    expect(markup).toContain("left:4.761904761904762%;top:3.3670033670033668%");
  });

  it("shows an actionable prompt when no Page Setup has been selected", () => {
    const markup = renderToStaticMarkup(createElement(OrderQrPrintSheetPreview, {
      pageSetup: null,
      stickerWidthMm: 50,
      stickerLengthMm: 30,
    }));

    expect(markup).toContain("Select a Page Setup to preview the printed sheet.");
  });

  it("does not render a sheet when the sticker cannot fit within the selected setup", () => {
    const markup = renderToStaticMarkup(createElement(OrderQrPrintSheetPreview, {
      pageSetup,
      stickerDataUrl: "data:image/png;base64,AA==",
      stickerWidthMm: 500,
      stickerLengthMm: 500,
    }));

    expect(markup).toContain("The sticker does not fit inside this Page Setup");
    expect(markup).not.toContain('role="img"');
  });

  it("previews a thermal roll using the requested label count and automatic length", () => {
    const markup = renderToStaticMarkup(createElement(OrderQrPrintSheetPreview, {
      pageSetup: {
        ...pageSetup,
        name: "58MM ROLL",
        printerType: "THERMAL",
        paperSize: "ROLL",
        paperWidthMm: 58,
        paperLengthMm: null,
        marginTopMm: 5,
        marginBottomMm: 5,
        marginLeftMm: 3,
        marginRightMm: 3,
        horizontalGapMm: 2,
        verticalGapMm: 2,
      },
      stickerDataUrl: "data:image/png;base64,AA==",
      stickerWidthMm: 25,
      stickerLengthMm: 30,
      quantity: 3,
    }));

    expect(markup).toContain("Thermal roll · 58 mm wide × 72 mm calculated length");
    expect(markup.match(/aria-hidden="true"/g)).toHaveLength(3);
  });
});
