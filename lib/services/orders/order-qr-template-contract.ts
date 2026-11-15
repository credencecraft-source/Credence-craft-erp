import { normalizeUppercase } from "@/lib/utilities/text-case";
import {
  getThermalRollLayout,
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

export const POS_ITEM_BARCODE_TEMPLATE_FIELDS = [
  { key: "posItemCode", label: "Item Barcode" },
  { key: "posItemName", label: "Item Name" },
  { key: "posSize", label: "Size" },
  { key: "posItemType", label: "Item Type" },
  { key: "posRecordNumber", label: "POS Item Record" },
  { key: "posVendor", label: "Vendor" },
  { key: "posBillNumber", label: "Purchase Bill Number" },
  { key: "posBillDate", label: "Purchase Bill Date" },
  { key: "posBillQuantity", label: "Bill Quantity" },
  { key: "posSkuCode", label: "Stock SKU" },
] as const;

export const FINISHED_GOODS_BARCODE_TEMPLATE_FIELDS = [
  { key: "fgBarcode", label: "FG Barcode" },
  { key: "fgSkuCode", label: "FG SKU" },
  { key: "fgSize", label: "Size" },
  { key: "fgBuyerSize", label: "Buyer Size" },
  { key: "fgOrderNo", label: "Order Number" },
  { key: "fgStyleName", label: "Style Name" },
  { key: "fgArticle", label: "Article" },
  { key: "fgColor", label: "Color" },
  { key: "fgQuantity", label: "Order Quantity" },
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

export const POS_ITEM_BARCODE_TEMPLATE_SAMPLE_VALUES: Record<
  (typeof POS_ITEM_BARCODE_TEMPLATE_FIELDS)[number]["key"],
  string
> = {
  posItemCode: "PB-2026-001-L001",
  posItemName: "CLASSIC TEE",
  posSize: "M",
  posItemType: "FINISHED GOODS",
  posRecordNumber: "GPR-0001",
  posVendor: "SAMPLE SUPPLIER",
  posBillNumber: "SUPPLIER-BILL-001",
  posBillDate: "2026-11-04",
  posBillQuantity: "120",
  posSkuCode: "SKU-0001",
};

export const FINISHED_GOODS_BARCODE_TEMPLATE_SAMPLE_VALUES: Record<
  (typeof FINISHED_GOODS_BARCODE_TEMPLATE_FIELDS)[number]["key"],
  string
> = {
  fgBarcode: "FG-2026-001-L001",
  fgSkuCode: "FGSKU-2026-001-L001",
  fgSize: "M",
  fgBuyerSize: "M",
  fgOrderNo: "ORD-2026-001",
  fgStyleName: "CLASSIC TEE",
  fgArticle: "ART-001",
  fgColor: "NAVY",
  fgQuantity: "120",
};

export const ORDER_QR_TEMPLATE_TYPES = [
  "ORDER_TAGS",
  "POS_ITEM_BARCODE",
  "FG_BARCODE",
] as const;
export type OrderQrTemplateType = (typeof ORDER_QR_TEMPLATE_TYPES)[number];

export function getQrTemplateTypeLabel(type: OrderQrTemplateType): string {
  switch (type) {
    case "POS_ITEM_BARCODE":
      return "POS Item Barcode";
    case "FG_BARCODE":
      return "FG Barcode";
    default:
      return "Order Tags";
  }
}
export type OrderQrTemplateFieldKey =
  (typeof ORDER_QR_TEMPLATE_FIELDS)[number]["key"];
export type PosItemBarcodeTemplateFieldKey =
  (typeof POS_ITEM_BARCODE_TEMPLATE_FIELDS)[number]["key"];
export type FinishedGoodsBarcodeTemplateFieldKey =
  (typeof FINISHED_GOODS_BARCODE_TEMPLATE_FIELDS)[number]["key"];
export type QrTemplateFieldKey =
  | OrderQrTemplateFieldKey
  | PosItemBarcodeTemplateFieldKey
  | FinishedGoodsBarcodeTemplateFieldKey;

export function getQrTemplateFields(type: OrderQrTemplateType) {
  switch (type) {
    case "POS_ITEM_BARCODE":
      return POS_ITEM_BARCODE_TEMPLATE_FIELDS;
    case "FG_BARCODE":
      return FINISHED_GOODS_BARCODE_TEMPLATE_FIELDS;
    default:
      return ORDER_QR_TEMPLATE_FIELDS;
  }
}

export function getQrTemplateSampleValues(
  type: OrderQrTemplateType,
): Partial<Record<QrTemplateFieldKey, string>> {
  switch (type) {
    case "POS_ITEM_BARCODE":
      return POS_ITEM_BARCODE_TEMPLATE_SAMPLE_VALUES;
    case "FG_BARCODE":
      return FINISHED_GOODS_BARCODE_TEMPLATE_SAMPLE_VALUES;
    default:
      return ORDER_QR_TEMPLATE_SAMPLE_VALUES;
  }
}

export function getQrTemplateFieldLabel(key: QrTemplateFieldKey): string {
  return [
    ...ORDER_QR_TEMPLATE_FIELDS,
    ...POS_ITEM_BARCODE_TEMPLATE_FIELDS,
    ...FINISHED_GOODS_BARCODE_TEMPLATE_FIELDS,
  ]
    .find((field) => field.key === key)?.label ?? key;
}

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
  fields: Partial<Record<QrTemplateFieldKey, OrderQrTemplatePosition>>;
  printerType: OrderQrPrinterType;
  pdfPaperSize: OrderQrPdfPaperSize;
};

export type OrderQrTemplateInput = {
  name: string;
  type: OrderQrTemplateType;
  pageSetupTemplateId: string;
  qrFieldKey: QrTemplateFieldKey;
  displayFields: QrTemplateFieldKey[];
  displayFieldStyles: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
  layout: OrderQrTemplateLayout;
  qrSize: (typeof ORDER_QR_TEMPLATE_SIZES)[number];
  stickerWidthMm: number;
  stickerLengthMm: number;
};

export function createDefaultOrderQrTemplateLayout(
  displayFields: readonly QrTemplateFieldKey[],
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
  quantity = 1,
) {
  if (pageSetup) {
    const grid = pageSetup.printerType === "THERMAL"
      ? getThermalRollLayout(
        pageSetup.paperWidthMm ?? 0,
        quantity,
        stickerWidthMm,
        stickerLengthMm,
        pageSetup,
      )
      : getPageSetupStickerGrid(
        pageSetup.paperSize,
        pageSetup.orientation,
        stickerWidthMm,
        stickerLengthMm,
        pageSetup,
        pageSetup.paperWidthMm,
        pageSetup.paperLengthMm,
      );
    if (!grid || grid.count < 1) return null;
    return {
      ...grid,
      pageHeightMm: grid.pageLengthMm,
      marginMm: pageSetup.marginTopMm,
      gapMm: pageSetup.horizontalGapMm,
      marginTopMm: pageSetup.marginTopMm,
      marginLeftMm: pageSetup.marginLeftMm,
      horizontalGapMm: pageSetup.horizontalGapMm,
      verticalGapMm: pageSetup.verticalGapMm,
      portrait: pageSetup.printerType === "THERMAL"
        || pageSetup.orientation === "PORTRAIT",
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
  displayFields: readonly QrTemplateFieldKey[],
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
  fieldKeys: readonly QrTemplateFieldKey[],
  orderFields: Partial<Record<QrTemplateFieldKey, string | number | null>>,
) {
  const entries = fieldKeys.flatMap((key) => {
    const label = getQrTemplateFieldLabel(key);
    const value = orderFields[key];
    if (value === null || value === undefined || String(value).trim() === "") {
      return [];
    }
    return [{ label, value: String(value) }];
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
  displayFields: QrTemplateFieldKey[],
):
  | { success: true; data: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>> }
  | { success: false; error: string } {
  if (value !== undefined && !isRecord(value)) {
    return { success: false, error: "Display field styles are invalid." };
  }
  const styles: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>> = {};
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

  const type = value.type === undefined ? "ORDER_TAGS" : value.type;
  if (!ORDER_QR_TEMPLATE_TYPES.includes(type as OrderQrTemplateType)) {
    return { success: false, error: "Select a supported QR template type." };
  }
  const templateType = type as OrderQrTemplateType;
  const allowedFields = getQrTemplateFields(templateType);
  const allowedFieldKeys = new Set<string>(allowedFields.map(({ key }) => key));

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
  if (typeof qrFieldKey !== "string" || !allowedFieldKeys.has(qrFieldKey)) {
    return { success: false, error: "Select one valid QR code field." };
  }

  const rawDisplayFields = value.displayFields ?? legacyFields;
  if (
    !Array.isArray(rawDisplayFields)
    || rawDisplayFields.length > allowedFields.length
    || rawDisplayFields.some((field) => typeof field !== "string" || !allowedFieldKeys.has(field))
  ) {
    return { success: false, error: "Select valid display fields." };
  }
  const displayFields = rawDisplayFields as QrTemplateFieldKey[];
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
      type: templateType,
      pageSetupTemplateId: value.pageSetupTemplateId.trim(),
      qrFieldKey: qrFieldKey as QrTemplateFieldKey,
      displayFields,
      displayFieldStyles: parsedStyles.data,
      layout: parsedLayout.data,
      qrSize: value.qrSize as OrderQrTemplateInput["qrSize"],
      stickerWidthMm,
      stickerLengthMm,
    },
  };
}

export function isOrderQrTemplateFieldKey(value: unknown): value is QrTemplateFieldKey {
  return typeof value === "string"
    && [
      ...ORDER_QR_TEMPLATE_FIELDS,
      ...POS_ITEM_BARCODE_TEMPLATE_FIELDS,
      ...FINISHED_GOODS_BARCODE_TEMPLATE_FIELDS,
    ]
      .some((option) => option.key === value);
}

export function parseStoredOrderQrTemplateDesign(
  value: unknown,
  displayFields: readonly QrTemplateFieldKey[],
): {
  displayFieldStyles: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>>;
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
  displayFieldStyles: Partial<Record<QrTemplateFieldKey, OrderQrDisplayFieldStyle>>,
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
