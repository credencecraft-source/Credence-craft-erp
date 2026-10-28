import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OrderQrStickerPreview from "./order-qr-sticker-preview";

describe("OrderQrStickerPreview", () => {
  it("renders saved positions and field styling in the shared sticker layout", () => {
    const markup = renderToStaticMarkup(createElement(OrderQrStickerPreview, {
      qrDataUrl: "data:image/png;base64,AA==",
      fields: [{
        key: "orderNo",
        label: "Order Number",
        value: "ORD-1",
        style: {
          fontSize: 18,
          bold: true,
          underline: true,
          color: "#123456",
        },
      }],
      layout: {
        qr: { x: 70, y: 12 },
        fields: { orderNo: { x: 14, y: 81 } },
        printerType: "BARCODE",
        pdfPaperSize: "A4_AUTO",
      },
      stickerWidthMm: 50,
      stickerLengthMm: 30,
    }));

    expect(markup).toContain('aria-label="Sticker preview, 50 by 30 millimeters"');
    expect(markup).toContain("left:70%;top:12%;width:31.2%;aspect-ratio:1");
    expect(markup).toContain("left:14%;top:81%;width:52%;color:#123456;font-size:18px;font-weight:700;text-decoration:underline");
    expect(markup).toContain("Order Number: ORD-1");
  });
});
