import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

import type { OrderQrCodeType } from "@/lib/services/orders/order-qr-template-contract";

export async function createOrderQrCodeDataUrl(
  payload: string,
  codeType: OrderQrCodeType,
  size: number,
) {
  if (!payload) throw new Error("Choose a field that has a value before generating a code.");
  if (codeType === "QR_CODE") {
    return QRCode.toDataURL(payload, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: size,
    });
  }
  if (!/^[\x20-\x7E]+$/.test(payload)) {
    throw new Error("Code 128 barcodes require printable ASCII values. Select an identifier field or use QR Code.");
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svg, payload, {
    format: "CODE128",
    width: 2,
    height: size,
    margin: 0,
    displayValue: false,
    lineColor: "#000000",
    background: "#FFFFFF",
  });
  const serializedSvg = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializedSvg)}`;
}
