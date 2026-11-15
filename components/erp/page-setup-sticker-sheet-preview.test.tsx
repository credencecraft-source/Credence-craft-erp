import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SETUP_LAYOUT,
} from "@/lib/services/design-development/page-setup-template-contract";
import PageSetupStickerSheetPreview from "./page-setup-sticker-sheet-preview";

describe("PageSetupStickerSheetPreview", () => {
  it("keeps thermal roll label and gap outlines visually thin at narrow roll widths", () => {
    const markup = renderToStaticMarkup(createElement(PageSetupStickerSheetPreview, {
      printerType: "THERMAL",
      paperSize: "ROLL",
      paperWidthMm: 35,
      paperLengthMm: null,
      orientation: "PORTRAIT",
      stickerWidthMm: 10,
      stickerLengthMm: 10,
      layout: DEFAULT_PAGE_SETUP_LAYOUT,
    }));

    expect(markup).toContain('stroke-width="0.75"');
    expect(markup).toContain('vector-effect="non-scaling-stroke"');
    expect(markup).toContain("Roll length is calculated from the actual print quantity.");
  });

  it("preserves the existing fixed-sheet preview stroke styling", () => {
    const markup = renderToStaticMarkup(createElement(PageSetupStickerSheetPreview, {
      printerType: "LASER",
      paperSize: "A4",
      paperWidthMm: null,
      paperLengthMm: null,
      orientation: "PORTRAIT",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      layout: DEFAULT_PAGE_SETUP_LAYOUT,
    }));

    expect(markup).toContain('stroke-width="0.35"');
    expect(markup).not.toContain('vector-effect="non-scaling-stroke"');
  });
});
