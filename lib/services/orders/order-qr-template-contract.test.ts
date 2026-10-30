import { describe, expect, it } from "vitest";

import {
  buildOrderQrPayload,
  getA4StickerGrid,
  parseOrderQrTemplateInput,
  parseStoredOrderQrTemplateDesign,
} from "./order-qr-template-contract";

describe("parseOrderQrTemplateInput", () => {
  it("normalizes names and accepts QR, display, style, and sticker settings", () => {
    expect(parseOrderQrTemplateInput({
      name: "order tag - sample",
      pageSetupTemplateId: "setup-1",
      qrFieldKey: "orderNo",
      displayFields: ["orderNo", "styleName", "buyer"],
      displayFieldStyles: {
        orderNo: { fontSize: 12, bold: false, underline: false, color: "#111827" },
        styleName: { fontSize: 12, bold: false, underline: false, color: "#111827" },
        buyer: { fontSize: 12, bold: false, underline: false, color: "#111827" },
      },
      qrSize: 192,
      stickerWidthMm: 50,
      stickerLengthMm: 30,
    })).toEqual({
      success: true,
      data: {
        name: "ORDER TAG - SAMPLE",
        pageSetupTemplateId: "setup-1",
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "styleName", "buyer"],
        displayFieldStyles: {
          orderNo: { fontSize: 12, bold: false, underline: false, color: "#111827" },
          styleName: { fontSize: 12, bold: false, underline: false, color: "#111827" },
          buyer: { fontSize: 12, bold: false, underline: false, color: "#111827" },
        },
        qrSize: 192,
        stickerWidthMm: 50,
        stickerLengthMm: 30,
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            styleName: { x: 44, y: 36 },
            buyer: { x: 44, y: 56 },
          },
          printerType: "BARCODE",
          pdfPaperSize: "A4_AUTO",
        },
      },
    });
  });

  it("converts legacy field selections into a QR field and display fields", () => {
    expect(parseOrderQrTemplateInput({
      name: "order tag",
      pageSetupTemplateId: "setup-1",
      fieldKeys: ["orderNo", "styleName"],
      qrSize: 192,
    })).toMatchObject({
      success: true,
      data: {
        qrFieldKey: "orderNo",
        displayFields: ["orderNo", "styleName"],
        stickerWidthMm: 50,
        stickerLengthMm: 30,
        layout: {
          qr: { x: 3, y: 25 },
          fields: {
            orderNo: { x: 44, y: 16 },
            styleName: { x: 44, y: 36 },
          },
        },
      },
    });
  });

  it("validates and preserves user-defined sticker positions", () => {
    const layout = {
      qr: { x: 20.5, y: 30 },
      fields: {
        buyer: { x: 70, y: 12 },
      },
    };
    expect(parseOrderQrTemplateInput({
      name: "MOVABLE",
      pageSetupTemplateId: "setup-1",
      qrFieldKey: "orderNo",
      displayFields: ["buyer"],
      qrSize: 128,
      layout,
    })).toMatchObject({ success: true, data: { layout } });
    expect(parseOrderQrTemplateInput({
      name: "INVALID POSITION",
      pageSetupTemplateId: "setup-1",
      qrFieldKey: "orderNo",
      displayFields: ["buyer"],
      qrSize: 128,
      layout: { qr: { x: 101, y: 0 }, fields: {} },
    })).toEqual({ success: false, error: "QR sticker layout is invalid." });
  });

  it("uses A4 pages to tile stickers while keeping paper and sticker dimensions separate", () => {
    expect(getA4StickerGrid(50, 30, "A4_PORTRAIT")).toMatchObject({
      pageWidthMm: 210,
      pageHeightMm: 297,
      columns: 3,
      rows: 9,
      portrait: true,
    });
    expect(getA4StickerGrid(50, 30, "A4_AUTO")?.count).toBe(30);
    expect(getA4StickerGrid(350, 30, "A4_PORTRAIT")).toBeNull();
  });

  it("uses the saved Page Setup dimensions, margins, and gaps for print-sheet placement", () => {
    const pageSetup = {
      id: "setup-1",
      name: "A3 STOCK",
      paperSize: "A3" as const,
      orientation: "LANDSCAPE" as const,
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      marginTopMm: 10,
      marginBottomMm: 10,
      marginLeftMm: 15,
      marginRightMm: 15,
      horizontalGapMm: 3,
      verticalGapMm: 4,
    };

    expect(getA4StickerGrid(50, 30, "A4_AUTO", pageSetup)).toMatchObject({
      pageWidthMm: 420,
      pageHeightMm: 297,
      columns: 7,
      rows: 8,
      count: 56,
      marginTopMm: 10,
      marginLeftMm: 15,
      horizontalGapMm: 3,
      verticalGapMm: 4,
      portrait: false,
      paperSize: "A3",
    });
  });

  it("reads legacy template styles with the existing barcode printer defaults", () => {
    expect(parseStoredOrderQrTemplateDesign({
      buyer: { fontSize: 16, bold: true, underline: false, color: "#123456" },
    }, ["buyer"])).toEqual({
      displayFieldStyles: {
        buyer: { fontSize: 16, bold: true, underline: false, color: "#123456" },
      },
      layout: {
        qr: { x: 3, y: 25 },
        fields: { buyer: { x: 44, y: 16 } },
        printerType: "BARCODE",
        pdfPaperSize: "A4_AUTO",
      },
      pageSetup: null,
    });
  });

  it("encodes only the selected populated order fields", () => {
    expect(buildOrderQrPayload(
      ["orderNo", "buyer"],
      { orderNo: "ORD-100", buyer: "BUYER A", styleName: "UNSELECTED" },
    )).toEqual({
      entries: [
        { label: "Order Number", value: "ORD-100" },
        { label: "Buyer", value: "BUYER A" },
      ],
      payload: JSON.stringify({ "Order Number": "ORD-100", Buyer: "BUYER A" }),
    });
  });

  it("does not substitute an order number when the selected QR field is empty", () => {
    expect(buildOrderQrPayload(["buyer"], { buyer: " " })).toEqual({
      entries: [],
      payload: "",
    });
  });

  it.each([
    [null, "Template details are required."],
    [{ name: " ", pageSetupTemplateId: "setup-1", fieldKeys: ["orderNo"], qrSize: 128 }, "Template name is required."],
    [{ name: "valid", pageSetupTemplateId: "setup-1", qrFieldKey: "bad", qrSize: 128 }, "Select one valid QR code field."],
    [{ name: "valid", pageSetupTemplateId: "setup-1", fieldKeys: [], qrSize: 128 }, "Select one valid QR code field."],
    [{ name: "valid", pageSetupTemplateId: "setup-1", fieldKeys: ["notAnOrderField"], qrSize: 128 }, "Select one valid QR code field."],
    [{ name: "valid", pageSetupTemplateId: "setup-1", displayFields: ["orderNo", "orderNo"], qrSize: 128 }, "Display fields cannot be selected more than once."],
    [{ name: "valid", pageSetupTemplateId: "setup-1", fieldKeys: ["orderNo"], qrSize: 129 }, "Select a supported QR code size."],
  ])("rejects invalid input %#", (input, message) => {
    expect(parseOrderQrTemplateInput(input)).toEqual({ success: false, error: message });
  });

  it("rejects a name longer than the storage limit", () => {
    expect(parseOrderQrTemplateInput({
      name: "T".repeat(101),
      pageSetupTemplateId: "setup-1",
      fieldKeys: ["orderNo"],
      qrSize: 128,
    })).toEqual({
      success: false,
      error: "Template name must be 100 characters or fewer.",
    });
  });

  it("rejects invalid styles and sticker dimensions", () => {
    expect(parseOrderQrTemplateInput({
      name: "BAD STYLE",
      pageSetupTemplateId: "setup-1",
      qrFieldKey: "orderNo",
      displayFields: ["buyer"],
      displayFieldStyles: {
        buyer: { fontSize: 90, bold: false, underline: false, color: "#FFFFFF" },
      },
      qrSize: 128,
      stickerWidthMm: 50,
      stickerLengthMm: 30,
    })).toMatchObject({ success: false });

    expect(parseOrderQrTemplateInput({
      name: "BAD SIZE",
      pageSetupTemplateId: "setup-1",
      qrFieldKey: "orderNo",
      displayFields: [],
      qrSize: 128,
      stickerWidthMm: 9,
      stickerLengthMm: 30,
    })).toEqual({
      success: false,
      error: "Sticker width and length must be between 10 and 500 mm, with at most two decimal places.",
    });

  });

  it("requires a Page Setup template selection", () => {
    expect(parseOrderQrTemplateInput({
      name: "ORDER TAG",
      fieldKeys: ["orderNo"],
      qrSize: 128,
    })).toEqual({
      success: false,
      error: "Select a Page Setup template for this QR template.",
    });
  });
});
