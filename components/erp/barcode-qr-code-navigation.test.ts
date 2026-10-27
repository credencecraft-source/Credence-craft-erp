import { describe, expect, it } from "vitest";

import { ERP_MODULES } from "./erp-config-registry";

describe("Barcode / QR Code module navigation", () => {
  it("places Templates and Print/Download under Design and Development > Barcode / QR Code", () => {
    const designDevelopment = ERP_MODULES.find(
      (module) => module.key === "design-development",
    );
    const barcodeQrCode = designDevelopment?.children.find(
      (child) => child.key === "barcode-qr-code",
    );

    expect(barcodeQrCode).toMatchObject({
      label: "Barcode / QR Code",
      pathSegment: "barcode-qr-code",
      children: [
        { key: "templates", label: "Templates", pathSegment: "templates" },
        { key: "print-download", label: "Print/Download", pathSegment: "print-download" },
      ],
    });
  });
});
