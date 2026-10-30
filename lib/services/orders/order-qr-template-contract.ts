import { normalizeUppercase } from "@/lib/utilities/text-case";
import {
  getPageSetupStickerGrid,
  parsePageSetupPrintSnapshot,
  type PageSetupPrintSnapshot,
} from "@/lib/services/design-development/page-setup-template-contract";

export const ORDER_QR_TEMPLATE_FIELDS = [
  { key: "orderNo", label: "Order Number" },
  { key: "entityName", label: "Entity" },
  { key: "category", label: "Category" },
  { key: "subCategory", label: "Sub Category" },
  { key: "season", label: "Season" },
  { key: "article", label: "Article" },
  { key: "styleName", label: "Style Name" },
  { key: "colors", label: "Colors" },
  { key: "buyer", label: "Buyer" },
  { key: "brand", label: "Brand" },
  { key: "sizeGroup", label: "Size Group" },
  { key: "orderQty", label: "Order Quantity" },
  { key: "deliveryDate", label: "Delivery Date" },
] as const;

export const ORDER_QR_TEMPLATE_SAMPLE_VALUES: Record<
  (typeof ORDER_QR_TEMPLATE_FIELDS)[number]["key"],
  string
> = {
  orderNo: "ORD-2026-001",
  entityName: "CREDENCE CRAFT",
  category: "T-SHIRT",
  subCategory: "CREW NECK",
  season: "SS 2026",
  article: "ART-001",
  styleName: "CLASSIC TEE",
  colors: "NAVY",
  buyer: "SAMPLE BUYER",
  brand: "CREDENCE",
  sizeGroup: "S-M-L-XL",
  orderQty: "1200",
  deliveryDate: "2026-12-15",
};

export type OrderQrTemplateFieldKey =
  (typeof ORDER_QR_TEMPLATE_FIELDS)[number]["key"];

export const ORDER_QR_TEMPLATE_SIZES = [128, 192, 256, 320] as const;
export const DEFAULT_QR_FIELD_STYLE: OrderQrDisplayFieldStyle = {
  fontSize: 12,
  bold: false,
  underline: false,
  color: "#111827",
};

export type OrderQrDisplayFieldStyle = {
  fontSize: number;
  bold: boolean;
  underline: boolean;
  color: string;
};

export type OrderQrTemplatePosition = { x: number; y: number };
export type OrderQrPrinterType = "BARCODE" | "LASER";
export type OrderQrPdfPaperSize = "A4_PORTRAIT" | "A4_LANDSCAPE" | "A4_AUTO";
export type OrderQrTemplateLayout = {
  qr: OrderQrTemplatePosition;
  fields: Partial<Record<OrderQrTemplateFieldKey, OrderQrTemplatePosition>>;
  printerType: OrderQrPrinterType;
  pdfPaperSize: OrderQrPdfPaperSize;
};

export type OrderQrTemplateInput = {
  name: string;
  pageSetupTemplateId: string;
  qrFieldKey: OrderQrTemplateFieldKey;
  displayFields: OrderQrTemplateFieldKey[];
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  qrSize: (typeof ORDER_QR_TEMPLATE_SIZES)[number];
  stickerWidthMm: number;
  stickerLengthMm: number;
};

export function createDefaultOrderQrTemplateLayout(
  displayFields: readonly OrderQrTemplateFieldKey[],
): OrderQrTemplateLayout {
  const fieldStep = Math.min(20, 66 / Math.max(displayFields.length, 1));
  return {
    qr: { x: 3, y: 25 },
    fields: Object.fromEntries(displayFields.map((key, index) => [
      key,
      { x: 44, y: 16 + fieldStep * index },
    ])),
    printerType: "BARCODE",
    pdfPaperSize: "A4_AUTO",
  };
}

export function getA4StickerGrid(
  stickerWidthMm: number,
  stickerLengthMm: number,
  paperSize: OrderQrPdfPaperSize,
  pageSetup?: PageSetupPrintSnapshot | null,
) {
  if (pageSetup) {
    const grid = getPageSetupStickerGrid(
      pageSetup.paperSize,
      pageSetup.orientation,
      stickerWidthMm,
      stickerLengthMm,
      pageSetup,
    );
    if (grid.count < 1) return null;
    return {
      ...grid,
      pageHeightMm: grid.pageLengthMm,
      marginMm: pageSetup.marginTopMm,
      gapMm: pageSetup.horizontalGapMm,
      marginTopMm: pageSetup.marginTopMm,
      marginLeftMm: pageSetup.marginLeftMm,
      horizontalGapMm: pageSetup.horizontalGapMm,
      verticalGapMm: pageSetup.verticalGapMm,
      portrait: pageSetup.orientation === "PORTRAIT",
      paperSize: pageSetup.paperSize,
    };
  }
  const portrait = paperSize === "A4_PORTRAIT"
    || (paperSize === "A4_AUTO" && stickerWidthMm <= stickerLengthMm);
  const pageWidthMm = portrait ? 210 : 297;
  const pageHeightMm = portrait ? 297 : 210;
  const marginMm = 5;
  const gapMm = 2;
  const columns = Math.floor(
    (pageWidthMm - marginMm * 2 + gapMm) / (stickerWidthMm + gapMm),
  );
  const rows = Math.floor(
    (pageHeightMm - marginMm * 2 + gapMm) / (stickerLengthMm + gapMm),
  );
  if (columns < 1 || rows < 1) return null;
  return {
    pageWidthMm,
    pageHeightMm,
    marginMm,
    gapMm,
    marginTopMm: marginMm,
    marginLeftMm: marginMm,
    horizontalGapMm: gapMm,
    verticalGapMm: gapMm,
    columns,
    rows,
    count: columns * rows,
    portrait,
    paperSize: "A4" as const,
  };
}

function isPosition(value: unknown): value is OrderQrTemplatePosition {
  if (!isRecord(value)) return false;
  return typeof value.x === "number"
    && Number.isFinite(value.x)
    && value.x >= 0
    && value.x <= 100
    && typeof value.y === "number"
    && Number.isFinite(value.y)
    && value.y >= 0
    && value.y <= 100;
}

export function parseOrderQrTemplateLayout(
  value: unknown,
  displayFields: readonly OrderQrTemplateFieldKey[],
): { success: true; data: OrderQrTemplateLayout } | { success: false; error: string } {
  const fallback = createDefaultOrderQrTemplateLayout(displayFields);
  if (value === undefined) return { success: true, data: fallback };
  if (!isRecord(value) || !isPosition(value.qr) || !isRecord(value.fields)) {
    return { success: false, error: "QR sticker layout is invalid." };
  }
  if (
    (value.printerType !== undefined
      && value.printerType !== "BARCODE"
      && value.printerType !== "LASER")
    || (value.pdfPaperSize !== undefined
      && value.pdfPaperSize !== "A4_PORTRAIT"
      && value.pdfPaperSize !== "A4_LANDSCAPE"
      && value.pdfPaperSize !== "A4_AUTO")
  ) {
    return { success: false, error: "Printer or PDF paper size is invalid." };
  }
  const fields: OrderQrTemplateLayout["fields"] = {};
  for (const key of displayFields) {
    const position = value.fields[key];
    if (position === undefined) {
      fields[key] = fallback.fields[key];
    } else if (isPosition(position)) {
      fields[key] = { x: position.x, y: position.y };
    } else {
      return { success: false, error: "QR sticker layout is invalid." };
    }
  }
  return {
    success: true,
    data: {
      qr: { x: value.qr.x, y: value.qr.y },
      fields,
      printerType: value.printerType === "LASER" ? "LASER" : fallback.printerType,
      pdfPaperSize: value.pdfPaperSize === "A4_PORTRAIT"
        || value.pdfPaperSize === "A4_LANDSCAPE"
        || value.pdfPaperSize === "A4_AUTO"
        ? value.pdfPaperSize
        : fallback.pdfPaperSize,
    },
  };
}

export function buildOrderQrPayload(
  fieldKeys: readonly OrderQrTemplateFieldKey[],
  orderFields: Partial<Record<OrderQrTemplateFieldKey, string | number | null>>,
) {
  const entries = fieldKeys.flatMap((key) => {
    const field = ORDER_QR_TEMPLATE_FIELDS.find((option) => option.key === key);
    const value = orderFields[key];
    if (!field || value === null || value === undefined || String(value).trim() === "") {
      return [];
    }
    return [{ label: field.label, value: String(value) }];
  });

  return {
    entries,
    payload: entries.length > 0
      ? JSON.stringify(Object.fromEntries(entries.map(({ label, value }) => [label, value])))
      : "",
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseDisplayFieldStyles(
  value: unknown,
  displayFields: OrderQrTemplateFieldKey[],
):
  | { success: true; data: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>> }
  | { success: false; error: string } {
  if (value !== undefined && !isRecord(value)) {
    return { success: false, error: "Display field styles are invalid." };
  }
  const styles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>> = {};
  for (const key of displayFields) {
    const rawStyle = value && isRecord(value) ? value[key] : undefined;
    if (rawStyle === undefined) {
      styles[key] = { ...DEFAULT_QR_FIELD_STYLE };
      continue;
    }
    if (!isRecord(rawStyle)) {
      return { success: false, error: "Display field styles are invalid." };
    }
    const { fontSize, bold, underline, color } = rawStyle;
    if (
      typeof fontSize !== "number"
      || !Number.isInteger(fontSize)
      || fontSize < 8
      || fontSize > 48
      || typeof bold !== "boolean"
      || typeof underline !== "boolean"
      || typeof color !== "string"
      || !/^#[0-9A-Fa-f]{6}$/.test(color)
    ) {
      return {
        success: false,
        error: "Each display field needs a font size from 8 to 48 and a valid color.",
      };
    }
    styles[key] = { fontSize, bold, underline, color: color.toUpperCase() };
  }
  return { success: true, data: styles };
}

export function parseOrderQrTemplateInput(
  value: unknown,
):
  | { success: true; data: OrderQrTemplateInput }
  | { success: false; error: string } {
  if (!isRecord(value)) {
    return { success: false, error: "Template details are required." };
  }

  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    return { success: false, error: "Template name is required." };
  }

  const name = normalizeUppercase(value.name.trim());
  if (name.length > 100) {
    return { success: false, error: "Template name must be 100 characters or fewer." };
  }

  if (
    typeof value.pageSetupTemplateId !== "string"
    || !value.pageSetupTemplateId.trim()
    || value.pageSetupTemplateId.length > 100
  ) {
    return { success: false, error: "Select a Page Setup template for this QR template." };
  }

  const legacyFields = Array.isArray(value.fieldKeys)
    ? value.fieldKeys
    : [];
  if (value.qrFieldKey === undefined && Array.isArray(value.fieldKeys) && legacyFields.length === 0) {
    return { success: false, error: "Select one valid QR code field." };
  }
  const qrFieldKey = value.qrFieldKey ?? legacyFields[0] ?? "orderNo";
  if (!isOrderQrTemplateFieldKey(qrFieldKey)) {
    return { success: false, error: "Select one valid QR code field." };
  }

  const rawDisplayFields = value.displayFields ?? legacyFields;
  if (
    !Array.isArray(rawDisplayFields)
    || rawDisplayFields.length > ORDER_QR_TEMPLATE_FIELDS.length
    || rawDisplayFields.some((field) => !isOrderQrTemplateFieldKey(field))
  ) {
    return { success: false, error: "Select valid display fields." };
  }
  const displayFields = rawDisplayFields as OrderQrTemplateFieldKey[];
  if (new Set(displayFields).size !== displayFields.length) {
    return { success: false, error: "Display fields cannot be selected more than once." };
  }

  const parsedStyles = parseDisplayFieldStyles(value.displayFieldStyles, displayFields);
  if (!parsedStyles.success) return parsedStyles;
  const parsedLayout = parseOrderQrTemplateLayout(value.layout, displayFields);
  if (!parsedLayout.success) return parsedLayout;

  if (
    typeof value.qrSize !== "number"
    || !ORDER_QR_TEMPLATE_SIZES.includes(
      value.qrSize as (typeof ORDER_QR_TEMPLATE_SIZES)[number],
    )
  ) {
    return { success: false, error: "Select a supported QR code size." };
  }
  const stickerWidthMm = value.stickerWidthMm ?? 50;
  const stickerLengthMm = value.stickerLengthMm ?? 30;
  if (
    typeof stickerWidthMm !== "number"
    || !Number.isFinite(stickerWidthMm)
    || stickerWidthMm < 10
    || stickerWidthMm > 500
    || !Number.isInteger(stickerWidthMm * 100)
    || typeof stickerLengthMm !== "number"
    || !Number.isFinite(stickerLengthMm)
    || stickerLengthMm < 10
    || stickerLengthMm > 500
    || !Number.isInteger(stickerLengthMm * 100)
  ) {
    return {
      success: false,
      error: "Sticker width and length must be between 10 and 500 mm, with at most two decimal places.",
    };
  }

  return {
    success: true,
    data: {
      name,
      pageSetupTemplateId: value.pageSetupTemplateId.trim(),
      qrFieldKey,
      displayFields,
      displayFieldStyles: parsedStyles.data,
      layout: parsedLayout.data,
      qrSize: value.qrSize as OrderQrTemplateInput["qrSize"],
      stickerWidthMm,
      stickerLengthMm,
    },
  };
}

export function isOrderQrTemplateFieldKey(value: unknown): value is OrderQrTemplateFieldKey {
  return typeof value === "string"
    && ORDER_QR_TEMPLATE_FIELDS.some((option) => option.key === value);
}

export function parseStoredOrderQrTemplateDesign(
  value: unknown,
  displayFields: readonly OrderQrTemplateFieldKey[],
): {
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  pageSetup: PageSetupPrintSnapshot | null;
} {
  const saved = isRecord(value) ? value : {};
  const wrapped = isRecord(saved.styles) || isRecord(saved.layout);
  const styleSource = wrapped ? saved.styles : saved;
  const parsedStyles = parseDisplayFieldStyles(styleSource, [...displayFields]);
  const displayFieldStyles = parsedStyles.success
    ? parsedStyles.data
    : Object.fromEntries(displayFields.map((key) => [key, { ...DEFAULT_QR_FIELD_STYLE }]));
  const parsedLayout = parseOrderQrTemplateLayout(wrapped ? saved.layout : undefined, displayFields);
  return {
    displayFieldStyles,
    layout: parsedLayout.success
      ? parsedLayout.data
      : createDefaultOrderQrTemplateLayout(displayFields),
    pageSetup: parsePageSetupPrintSnapshot(saved.pageSetup),
  };
}

export function serializeOrderQrTemplateDesign(
  displayFieldStyles: Partial<Record<OrderQrTemplateFieldKey, OrderQrDisplayFieldStyle>>,
  layout: OrderQrTemplateLayout,
  pageSetup?: PageSetupPrintSnapshot | null,
) {
  return {
    styles: displayFieldStyles,
    layout: {
      qr: layout.qr,
      fields: layout.fields,
      printerType: layout.printerType,
      pdfPaperSize: layout.pdfPaperSize,
    },
    ...(pageSetup ? { pageSetup } : {}),
  };
}
