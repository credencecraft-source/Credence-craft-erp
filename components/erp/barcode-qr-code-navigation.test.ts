import { describe, expect, it } from "vitest";

import { ERP_MODULES } from "./erp-config-registry";

describe("Barcode / QR Code module navigation", () => {
  it("places Page Setup, Templates, and Print/Download under Admin > Barcode / QR Code", () => {
    const admin = ERP_MODULES.find((module) => module.key === "admin");
    const barcodeQrCode = admin?.children.find(
      (child) => child.key === "barcode-qr-code",
    );

    expect(barcodeQrCode).toMatchObject({
      label: "Barcode / QR Code",
      pathSegment: "barcode-qr-code",
      children: [
        { key: "page-setup", label: "Page Setup", pathSegment: "page-setup" },
        { key: "templates", label: "Templates", pathSegment: "templates" },
        { key: "print-download", label: "Print/Download", pathSegment: "print-download" },
      ],
    });
  });
});
