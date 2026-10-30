import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SETUP_LAYOUT,
  getPageSetupStickerGrid,
  parsePageSetupPrintSnapshot,
  parsePageSetupTemplateInput,
} from "./page-setup-template-contract";

describe("page setup template input", () => {
  it("normalizes the name and accepts supported paper settings", () => {
    expect(parsePageSetupTemplateInput({
      name: "  sample page  ",
      paperSize: "A4",
      orientation: "LANDSCAPE",
      stickerWidthMm: 46,
      stickerLengthMm: 11.1,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    })).toEqual({
      success: true,
      data: {
        name: "SAMPLE PAGE",
        paperSize: "A4",
        orientation: "LANDSCAPE",
        stickerWidthMm: 46,
        stickerLengthMm: 11.1,
        ...DEFAULT_PAGE_SETUP_LAYOUT,
      },
    });
  });

  it("rejects missing names and unsupported page settings", () => {
    expect(parsePageSetupTemplateInput({
      name: " ",
      paperSize: "A4",
      orientation: "PORTRAIT",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    })).toMatchObject({ success: false });
    expect(parsePageSetupTemplateInput({
      name: "VALID",
      paperSize: "LEGAL",
      orientation: "PORTRAIT",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    })).toMatchObject({ success: false, error: "Select a supported paper size." });
    expect(parsePageSetupTemplateInput({
      name: "VALID",
      paperSize: "A4",
      orientation: "SIDEWAYS",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    })).toMatchObject({ success: false, error: "Select a supported page orientation." });
  });

  it("requires finite sticker dimensions within supported bounds", () => {
    expect(parsePageSetupTemplateInput({
      name: "LABEL",
      paperSize: "A4",
      orientation: "PORTRAIT",
      stickerWidthMm: 0,
      stickerLengthMm: 30,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    })).toMatchObject({ success: false, error: "Sticker width must be between 1 and 500 mm." });
    expect(parsePageSetupTemplateInput({
      name: "LABEL",
      paperSize: "A4",
      orientation: "PORTRAIT",
      stickerWidthMm: 50,
      stickerLengthMm: Number.NaN,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    })).toMatchObject({ success: false, error: "Sticker length must be between 1 and 500 mm." });
  });
});

describe("Page Setup sticker sheet capacity", () => {
  it("parses valid saved print snapshots and rejects malformed geometry", () => {
    const snapshot = {
      id: "setup-1",
      name: "A4 STICKERS",
      paperSize: "A4",
      orientation: "LANDSCAPE",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    };
    expect(parsePageSetupPrintSnapshot(snapshot)).toEqual(snapshot);
    expect(parsePageSetupPrintSnapshot({ ...snapshot, marginLeftMm: 101 })).toBeNull();
    expect(parsePageSetupPrintSnapshot({ ...snapshot, paperSize: "LEGAL" })).toBeNull();
  });

  it("calculates the theoretical maximum grid and switches page dimensions for orientation", () => {
    expect(getPageSetupStickerGrid("A4", "PORTRAIT", 70, 30, DEFAULT_PAGE_SETUP_LAYOUT)).toEqual({
      pageWidthMm: 210,
      pageLengthMm: 297,
      columns: 2,
      rows: 9,
      count: 18,
      gridWidthMm: 142,
      gridLengthMm: 286,
      startXmm: 5,
      startYmm: 5,
    });
    expect(getPageSetupStickerGrid("A4", "LANDSCAPE", 70, 30, DEFAULT_PAGE_SETUP_LAYOUT)).toEqual({
      pageWidthMm: 297,
      pageLengthMm: 210,
      columns: 4,
      rows: 6,
      count: 24,
      gridWidthMm: 286,
      gridLengthMm: 190,
      startXmm: 5,
      startYmm: 5,
    });
  });

  it("positions stickers at the entered margins and includes gaps in capacity", () => {
    const layout = {
      marginTopMm: 5,
      marginBottomMm: 10,
      marginLeftMm: 10,
      marginRightMm: 20,
      horizontalGapMm: 2,
      verticalGapMm: 3,
    };
    expect(getPageSetupStickerGrid("A4", "PORTRAIT", 46, 11.1, layout)).toMatchObject({
      columns: 3,
      rows: 20,
      count: 60,
      gridWidthMm: 142,
      gridLengthMm: 279,
      startXmm: 10,
      startYmm: 5,
    });
  });

  it("returns no labels when the sticker or margins cannot fit on the selected page", () => {
    expect(getPageSetupStickerGrid("A4", "PORTRAIT", 300, 30, DEFAULT_PAGE_SETUP_LAYOUT)).toMatchObject({
      columns: 0,
      startXmm: 5,
      startYmm: 5,
      count: 0,
    });
    expect(getPageSetupStickerGrid("A4", "PORTRAIT", 10, 10, {
      ...DEFAULT_PAGE_SETUP_LAYOUT,
      marginLeftMm: 100,
      marginRightMm: 100,
    })).toMatchObject({ columns: 1, count: 24 });
    expect(getPageSetupStickerGrid("A4", "PORTRAIT", 11, 10, {
      ...DEFAULT_PAGE_SETUP_LAYOUT,
      marginLeftMm: 100,
      marginRightMm: 100,
    })).toMatchObject({ columns: 0, count: 0 });
  });

  it("rejects negative and excessive page margins and label gaps", () => {
    const valid = {
      name: "LABEL",
      paperSize: "A4",
      orientation: "PORTRAIT",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      ...DEFAULT_PAGE_SETUP_LAYOUT,
    };
    expect(parsePageSetupTemplateInput({ ...valid, marginLeftMm: -1 }))
      .toMatchObject({ success: false, error: "Left margin must be between 0 and 100 mm." });
    expect(parsePageSetupTemplateInput({ ...valid, horizontalGapMm: 51 }))
      .toMatchObject({ success: false, error: "Horizontal gap must be between 0 and 50 mm." });
  });

  it("defaults older template payloads to the standard page margins and label gaps", () => {
    expect(parsePageSetupTemplateInput({
      name: "LEGACY",
      paperSize: "A4",
      orientation: "PORTRAIT",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
    })).toMatchObject({ success: true, data: { ...DEFAULT_PAGE_SETUP_LAYOUT } });
  });
});
