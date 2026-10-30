import QRCode from "qrcode";

import {
  DEFAULT_QR_FIELD_STYLE,
  getA4StickerGrid,
  ORDER_QR_TEMPLATE_FIELDS,
  type OrderQrTemplateFieldKey,
  type OrderQrTemplateLayout,
  type OrderQrDisplayFieldStyle,
} from "@/lib/services/orders/order-qr-template-contract";
import type { PageSetupPrintSnapshot } from "@/lib/services/design-development/page-setup-template-contract";

export type OrderQrPrintOutputRecord = {
  orderNo: string;
  qrSize: string | number;
  qrPayload: string;
  stickerWidthMm: number;
  stickerLengthMm: number;
  pageSetup?: PageSetupPrintSnapshot | null;
  layout: OrderQrTemplateLayout;
  displayFields: OrderQrTemplateFieldKey[];
  displayValues: Partial<Record<OrderQrTemplateFieldKey, string>>;
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  printQuantity: number;
  bulkItems?: Array<{
    orderId: string;
    orderNo: string;
    styleName: string;
    quantity: number;
    qrPayload: string;
    displayValues: Partial<Record<OrderQrTemplateFieldKey, string>>;
  }>;
};

export async function createOrderQrStickerDataUrl(
  record: OrderQrPrintOutputRecord,
  qrPayload = record.qrPayload,
  displayValues = record.displayValues,
) {
  const qrDataUrl = await QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: typeof record.qrSize === "number" ? record.qrSize : Number.parseInt(record.qrSize, 10),
  });
  const widthPx = Math.max(1, Math.round(record.stickerWidthMm * 96 / 25.4));
  const heightPx = Math.max(1, Math.round(record.stickerLengthMm * 96 / 25.4));
  const resolution = Math.min(2, 4096 / widthPx, 4096 / heightPx);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(widthPx * resolution));
  canvas.height = Math.max(1, Math.round(heightPx * resolution));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.scale(resolution, resolution);
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, widthPx, heightPx);

  const qrImage = new window.Image();
  await new Promise<void>((resolve, reject) => {
    qrImage.onload = () => resolve();
    qrImage.onerror = () => reject(new Error("QR image could not be loaded."));
    qrImage.src = qrDataUrl;
  });

  const qrExtent = Math.max(1, Math.min(widthPx, heightPx) * 0.52);
  const qrX = widthPx * record.layout.qr.x / 100;
  const qrY = heightPx * record.layout.qr.y / 100;
  context.drawImage(qrImage, qrX, qrY, qrExtent, qrExtent);

  record.displayFields.forEach((fieldKey, index) => {
    const label = ORDER_QR_TEMPLATE_FIELDS.find((field) => field.key === fieldKey)?.label ?? fieldKey;
    const value = displayValues[fieldKey] ?? "";
    const style = {
      ...DEFAULT_QR_FIELD_STYLE,
      ...record.displayFieldStyles[fieldKey],
    };
    const fontSize = Math.max(6, Math.min(style.fontSize, heightPx * 0.3));
    const position = record.layout.fields[fieldKey]
      ?? { x: 44, y: 16 + index * 16 };
    const textX = widthPx * position.x / 100;
    const textY = heightPx * position.y / 100;
    const textWidth = Math.max(1, widthPx - textX);
    context.fillStyle = style.color;
    context.font = `${style.bold ? "700" : "400"} ${fontSize}px Arial, sans-serif`;
    const baseline = Math.min(heightPx - 1, textY + fontSize);
    const displayText = value ? `${label}: ${value}` : label;
    context.fillText(displayText, textX, baseline, textWidth);
    if (style.underline) {
      const textWidthPx = Math.min(textWidth, context.measureText(displayText).width);
      context.strokeStyle = style.color;
      context.lineWidth = Math.max(1, fontSize / 16);
      context.beginPath();
      context.moveTo(textX, baseline + Math.max(1, fontSize / 12));
      context.lineTo(textX + textWidthPx, baseline + Math.max(1, fontSize / 12));
      context.stroke();
    }
  });
  return canvas.toDataURL("image/png");
}

export async function createOrderQrStickerSamples(record: OrderQrPrintOutputRecord) {
  if (!record.bulkItems?.length) {
    return [await createOrderQrStickerDataUrl(record)];
  }
  const stickers: string[] = [];
  for (const item of record.bulkItems) {
    stickers.push(await createOrderQrStickerDataUrl(
      record,
      item.qrPayload,
      item.displayValues,
    ));
  }
  return stickers;
}

export async function createOrderQrStickerDataUrls(record: OrderQrPrintOutputRecord) {
  const samples = await createOrderQrStickerSamples(record);
  if (!record.bulkItems?.length) {
    return Array.from({ length: record.printQuantity }, () => samples[0]);
  }
  return record.bulkItems.flatMap((item, index) =>
    Array.from({ length: item.quantity }, () => samples[index]),
  );
}

export async function createOrderQrPrintPdf(
  record: OrderQrPrintOutputRecord,
  stickerDataUrls: string | readonly string[],
) {
  const { jsPDF } = await import("jspdf");
  const providedStickers = typeof stickerDataUrls === "string"
    ? Array.from({ length: record.printQuantity }, () => stickerDataUrls)
    : stickerDataUrls;
  const stickers = typeof stickerDataUrls !== "string" && record.bulkItems?.length
    ? record.bulkItems.flatMap((item, index) =>
      Array.from({ length: item.quantity }, () => providedStickers[index]),
    )
    : providedStickers;
  if (record.layout.printerType === "LASER" || record.pageSetup) {
    const grid = getA4StickerGrid(
      record.stickerWidthMm,
      record.stickerLengthMm,
      record.layout.pdfPaperSize,
      record.pageSetup,
    );
    if (!grid) {
      throw new Error(
        "The sticker does not fit on the selected page setup. Change the page orientation or sticker size.",
      );
    }
    const orientation = grid.portrait ? "portrait" : "landscape";
    const format = grid.paperSize.toLowerCase();
    const pdf = new jsPDF({ orientation, unit: "mm", format });
    for (let index = 0; index < stickers.length; index += 1) {
      if (index > 0 && index % grid.count === 0) pdf.addPage(format, orientation);
      const indexOnPage = index % grid.count;
      const row = Math.floor(indexOnPage / grid.columns);
      const column = indexOnPage % grid.columns;
      pdf.addImage(
        stickers[index],
        "PNG",
        grid.marginLeftMm + column * (record.stickerWidthMm + grid.horizontalGapMm),
        grid.marginTopMm + row * (record.stickerLengthMm + grid.verticalGapMm),
        record.stickerWidthMm,
        record.stickerLengthMm,
      );
    }
    return pdf.output("blob");
  }

  const orientation = record.stickerWidthMm >= record.stickerLengthMm
    ? "landscape"
    : "portrait";
  const format: [number, number] = [record.stickerWidthMm, record.stickerLengthMm];
  const pdf = new jsPDF({ orientation, unit: "mm", format });
  for (let index = 0; index < stickers.length; index += 1) {
    if (index > 0) pdf.addPage(format, orientation);
    pdf.addImage(stickers[index], "PNG", 0, 0, record.stickerWidthMm, record.stickerLengthMm);
  }
  return pdf.output("blob");
}
