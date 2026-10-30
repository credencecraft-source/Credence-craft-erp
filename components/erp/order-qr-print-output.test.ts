import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  addPage: vi.fn(),
  jsPDF: vi.fn(),
  output: vi.fn(() => new Blob(["pdf"])),
}));

vi.mock("jspdf", () => ({
  jsPDF: mocks.jsPDF.mockImplementation(() => ({
    addImage: mocks.addImage,
    addPage: mocks.addPage,
    output: mocks.output,
  })),
}));

import { createOrderQrPrintPdf } from "./order-qr-print-output";
import type { OrderQrTemplateFieldKey } from "@/lib/services/orders/order-qr-template-contract";

describe("order QR print output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jsPDF.mockImplementation(() => ({
      addImage: mocks.addImage,
      addPage: mocks.addPage,
      output: mocks.output,
    }));
  });

  it("repeats each bulk order's own sticker artwork by its requested quantity", async () => {
    const record = {
      orderNo: "BULK: 2 ORDERS",
      qrSize: 256,
      qrPayload: "batch",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      layout: {
        qr: { x: 3, y: 25 },
        fields: {},
        printerType: "BARCODE" as const,
        pdfPaperSize: "A4_AUTO" as const,
      },
      displayFields: ["orderNo"] as OrderQrTemplateFieldKey[],
      displayValues: {},
      displayFieldStyles: {},
      printQuantity: 3,
      bulkItems: [
        {
          orderId: "order-1",
          orderNo: "ORD-1",
          styleName: "STYLE-1",
          quantity: 2,
          qrPayload: "qr-order-1",
          displayValues: { orderNo: "ORD-1" },
        },
        {
          orderId: "order-2",
          orderNo: "ORD-2",
          styleName: "STYLE-2",
          quantity: 1,
          qrPayload: "qr-order-2",
          displayValues: { orderNo: "ORD-2" },
        },
      ],
    };

    await createOrderQrPrintPdf(record, ["sticker-order-1", "sticker-order-2"]);

    expect(mocks.addImage.mock.calls.map(([sticker]) => sticker)).toEqual([
      "sticker-order-1",
      "sticker-order-1",
      "sticker-order-2",
    ]);
    expect(mocks.output).toHaveBeenCalledWith("blob");
  });

  it("uses the selected Page Setup paper dimensions and margin positions in the PDF", async () => {
    const record = {
      orderNo: "ORD-1",
      qrSize: 256,
      qrPayload: "order-1",
      stickerWidthMm: 50,
      stickerLengthMm: 30,
      pageSetup: {
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
      },
      layout: {
        qr: { x: 3, y: 25 },
        fields: {},
        printerType: "LASER" as const,
        pdfPaperSize: "A4_AUTO" as const,
      },
      displayFields: ["orderNo"] as OrderQrTemplateFieldKey[],
      displayValues: {},
      displayFieldStyles: {},
      printQuantity: 1,
    };

    await createOrderQrPrintPdf(record, ["sticker-a3"]);

    expect(mocks.jsPDF).toHaveBeenCalledWith({
      orientation: "landscape",
      unit: "mm",
      format: "a3",
    });
    expect(mocks.addImage).toHaveBeenCalledWith("sticker-a3", "PNG", 15, 10, 50, 30);
  });
});
