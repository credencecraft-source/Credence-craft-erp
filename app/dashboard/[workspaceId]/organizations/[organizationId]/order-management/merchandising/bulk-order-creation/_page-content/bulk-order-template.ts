import * as XLSX from "xlsx";

export const BULK_ORDER_COLUMNS = [
  "Entity Name",
  "Product Category",
  "Product Sub Category",
  "Season",
  "Article",
  "Style Name",
  "Colors",
  "Buyer",
  "Brand",
  "Size Group",
  "Delivery Date",
] as const;

const MAX_BULK_ORDER_ROWS = 500;
const FINISHED_GOODS_HEADERS = ["Style Number", "Size Group", "Size", "Quantity", "Excess %", "Orders Row"] as const;
const ORDER_HEADERS = [
  "Example Row",
  "Entity Name",
  "Product Category",
  "Product Sub Category",
  "Season",
  "Article",
  "Style Name",
  "Colors",
  "Buyer",
  "Brand",
  "Size Group",
  "Delivery Date",
] as const;
const BOM_HEADERS = [
  "Orders Row",
  "RM Category Type",
  "BOM Category",
  "BOM Sub Category",
  "Raw Material",
  "Stock UOM",
  "Size",
  "Buyer Consumption",
  "Buyer Price",
  "Internal Consumption",
  "Internal Price",
  "Itemwise Excess %",
] as const;

export type BulkOrderInput = {
  entityName: string;
  category: string;
  subCategory: string;
  season: string;
  article: string;
  styleName: string;
  colors: string;
  buyer: string;
  brand: string;
  sizeGroup: string;
  orderQty: number | null;
  deliveryDate: string;
  rows?: Array<{ buyerSize: string; size: string; beforeExcessQty: number; excess?: number }>;
  bomRows: Array<{
    categoryType?: string;
    category?: string;
    subCategory?: string;
    rawMaterialName?: string;
    stockUom?: string;
    size?: string;
    buyerConsumption?: number;
    buyerPrice?: number;
    internalConsumption?: number;
    internalPrice?: number;
    itemWiseExcessPercentage?: number;
  }>;
};

export type ParsedBulkOrderRow = {
  spreadsheetRow: number;
  order: BulkOrderInput | null;
  candidateOrder?: BulkOrderInput;
  errors: string[];
};

export type OrderMasterOption = {
  id: string;
  value_id: string;
  label: string;
};

export type MissingOrderMaster = {
  moduleKey: string;
  label: string;
  relatedLabels: Record<string, string[]>;
};

const ORDER_MASTER_FIELDS = [
  { key: "entity", getValues: (order: BulkOrderInput) => [order.entityName] },
  { key: "category", getValues: (order: BulkOrderInput) => [order.category] },
  { key: "sub-category", getValues: (order: BulkOrderInput) => [order.subCategory], relatedKey: "category", getRelated: (order: BulkOrderInput) => order.category },
  { key: "season", getValues: (order: BulkOrderInput) => [order.season] },
  { key: "article", getValues: (order: BulkOrderInput) => [order.article] },
  { key: "color", getValues: (order: BulkOrderInput) => order.colors.split(",") },
  { key: "buyer", getValues: (order: BulkOrderInput) => [order.buyer] },
  { key: "brand", getValues: (order: BulkOrderInput) => [order.brand] },
  { key: "size-group", getValues: (order: BulkOrderInput) => [order.sizeGroup], relatedKey: "brand", getRelated: (order: BulkOrderInput) => order.brand },
] as const;

export function findMissingOrderMasters(
  rows: ParsedBulkOrderRow[],
  masterOptions: Record<string, OrderMasterOption[]>,
): MissingOrderMaster[] {
  const missing = new Map<string, MissingOrderMaster>();
  for (const row of rows) {
    const order = row.order ?? row.candidateOrder;
    if (!order) continue;
    for (const mapping of ORDER_MASTER_FIELDS) {
      const existingLabels = new Set((masterOptions[mapping.key] ?? [])
        .map((option) => cellText(option.label).toLocaleLowerCase()));
      for (const rawLabel of mapping.getValues(order)) {
        const label = cellText(rawLabel);
        if (!label || existingLabels.has(label.toLocaleLowerCase())) continue;
        const key = `${mapping.key}:${label.toLocaleLowerCase()}`;
        const entry = missing.get(key) ?? { moduleKey: mapping.key, label, relatedLabels: {} };
        if ("relatedKey" in mapping && mapping.relatedKey) {
          const relatedLabel = mapping.getRelated(order);
          const relatedLabels = entry.relatedLabels[mapping.relatedKey] ?? [];
          if (relatedLabel && !relatedLabels.some((item) => item.toLocaleLowerCase() === relatedLabel.toLocaleLowerCase())) {
            entry.relatedLabels[mapping.relatedKey] = [...relatedLabels, relatedLabel];
          }
        }
        missing.set(key, entry);
      }
    }
  }
  return [...missing.values()];
}

export function normalizeOrderMasterValues(
  rows: ParsedBulkOrderRow[],
  masterOptions: Record<string, OrderMasterOption[]>,
) {
  const normalize = (key: string, value: string) => {
    const option = (masterOptions[key] ?? []).find(
      (master) => cellText(master.label).toLocaleLowerCase() === value.toLocaleLowerCase(),
    );
    return option?.label ?? value;
  };

  return rows.map((row) => {
    if (!row.order) return row;
    const colors = row.order.colors.split(",").map((color) => normalize("color", cellText(color))).join(", ");
    return {
      ...row,
      order: {
        ...row.order,
        entityName: normalize("entity", row.order.entityName),
        category: normalize("category", row.order.category),
        subCategory: normalize("sub-category", row.order.subCategory),
        season: normalize("season", row.order.season),
        article: normalize("article", row.order.article),
        colors,
        buyer: normalize("buyer", row.order.buyer),
        brand: normalize("brand", row.order.brand),
        sizeGroup: normalize("size-group", row.order.sizeGroup),
      },
    };
  });
}

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function parseQuantity(value: unknown) {
  const quantity = typeof value === "number" ? value : Number(cellText(value));
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

function parseOptionalNumber(value: unknown, field: string, errors: string[]) {
  if (value === undefined || value === null || cellText(value) === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(cellText(value));
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  errors.push(`${field} must be a non-negative number.`);
  return undefined;
}

function parseDeliveryDate(value: unknown) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
    return null;
  }

  const text = cellText(value);
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dayFirstMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const year = Number(isoMatch?.[1] ?? dayFirstMatch?.[3]);
  const month = Number(isoMatch?.[2] ?? dayFirstMatch?.[2]);
  const day = Number(isoMatch?.[3] ?? dayFirstMatch?.[1]);
  if (!isoMatch && !dayFirstMatch) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getHeaderIndexes(headerRow: unknown[] | undefined, requiredHeaders: readonly string[]) {
  if (!headerRow) throw new Error("The uploaded file is empty.");
  const headerIndexes = new Map<string, number>();
  headerRow.forEach((header, index) => {
    const normalized = cellText(header).toLocaleLowerCase();
    if (normalized && !headerIndexes.has(normalized)) headerIndexes.set(normalized, index);
  });
  const articleIndex = headerIndexes.get("article");
  const legacyArticleIndex = headerIndexes.get("finished goods item");
  if (articleIndex === undefined && legacyArticleIndex !== undefined) headerIndexes.set("article", legacyArticleIndex);
  if (legacyArticleIndex === undefined && articleIndex !== undefined) headerIndexes.set("finished goods item", articleIndex);
  const missingHeaders = requiredHeaders.filter((header) => !headerIndexes.has(header.toLocaleLowerCase()));
  if (missingHeaders.length > 0) {
    throw new Error(`Template columns are missing: ${missingHeaders.join(", ")}.`);
  }
  return headerIndexes;
}

function readSheetRows(values: unknown[][]) {
  return values.map((row, index) => ({ row, spreadsheetRow: index + 2 }));
}

function rowHasValues(row: unknown[], columns: number[]) {
  return columns.some((column) => cellText(row[column]) !== "");
}

function parseFinishedGoodsBOM(value: unknown) {
  const text = cellText(value);
  if (!text) return { rows: [], error: "Finished Goods BOM is required." };

  const sizes = new Set<string>();
  const rows: BulkOrderInput["rows"] = [];
  for (const entry of text.split(";")) {
    const match = /^\s*(.+?)\s*:\s*(\d+)\s*$/.exec(entry);
    if (!match) {
      return { rows: [], error: "Use Finished Goods BOM entries in Size:Quantity format, separated by semicolons (for example S:10; M:20)." };
    }
    const size = match[1].trim();
    const quantity = parseQuantity(match[2]);
    if (!size || !quantity) {
      return { rows: [], error: "Each Finished Goods BOM size must have a positive whole-number quantity." };
    }
    if (sizes.has(size.toLocaleLowerCase())) {
      return { rows: [], error: `Finished Goods BOM contains the size "${size}" more than once.` };
    }
    sizes.add(size.toLocaleLowerCase());
    rows.push({ buyerSize: size, size, beforeExcessQty: quantity });
  }
  return { rows, error: null };
}

function readValuesByHeader(
  row: unknown[],
  headerIndexes: Map<string, number>,
  headers: readonly string[],
) {
  return Object.fromEntries(headers.map((header) => [
    header,
    row[headerIndexes.get(header.toLocaleLowerCase()) ?? -1],
  ]));
}

export function parseBulkOrderRows(values: unknown[][]): ParsedBulkOrderRow[] {
  const headerIndexes = getHeaderIndexes(values[0], BULK_ORDER_COLUMNS);
  const legacyFinishedGoodsIndex = headerIndexes.get("finished goods bom");
  const legacyQuantityIndex = headerIndexes.get("quantity");
  const hasLegacyFinishedGoodsColumns = legacyFinishedGoodsIndex !== undefined || legacyQuantityIndex !== undefined;
  const dataRows = readSheetRows(values.slice(1))
    .filter(({ row }) => row.some((value) => cellText(value) !== ""));
  if (dataRows.length > MAX_BULK_ORDER_ROWS) {
    throw new Error(`The file contains ${dataRows.length} orders. Upload no more than ${MAX_BULK_ORDER_ROWS} at a time.`);
  }

  return dataRows.map(({ row, spreadsheetRow }) => {
    const valuesByHeader = readValuesByHeader(row, headerIndexes, BULK_ORDER_COLUMNS);
    const order = {
      entityName: cellText(valuesByHeader["Entity Name"]),
      category: cellText(valuesByHeader["Product Category"]),
      subCategory: cellText(valuesByHeader["Product Sub Category"]),
      season: cellText(valuesByHeader.Season),
      article: cellText(valuesByHeader.Article),
      styleName: cellText(valuesByHeader["Style Name"]),
      colors: cellText(valuesByHeader.Colors),
      buyer: cellText(valuesByHeader.Buyer),
      brand: cellText(valuesByHeader.Brand),
      sizeGroup: cellText(valuesByHeader["Size Group"]),
      orderQty: null,
      deliveryDate: "",
      bomRows: [],
    } satisfies BulkOrderInput;

    const errors = BULK_ORDER_COLUMNS
      .filter((column) => !cellText(valuesByHeader[column]))
      .map((column) => `${column} is required.`);
    let legacyFinishedGoods: ReturnType<typeof parseFinishedGoodsBOM> | undefined;
    let legacyQuantity: number | null = null;
    if (hasLegacyFinishedGoodsColumns) {
      const rawFinishedGoods = row[legacyFinishedGoodsIndex ?? -1];
      const rawQuantity = row[legacyQuantityIndex ?? -1];
      if (legacyFinishedGoodsIndex === undefined) errors.push("Legacy Finished Goods BOM column is missing.");
      if (legacyQuantityIndex === undefined) errors.push("Legacy Quantity column is missing.");
      if (legacyFinishedGoodsIndex !== undefined) {
        legacyFinishedGoods = parseFinishedGoodsBOM(rawFinishedGoods);
        if (legacyFinishedGoods.error) errors.push(legacyFinishedGoods.error);
      }
      legacyQuantity = parseQuantity(rawQuantity);
      if (legacyQuantityIndex !== undefined && !legacyQuantity) {
        errors.push("Quantity must be a positive whole number.");
      }
      if (legacyQuantity && legacyFinishedGoods?.rows.length) {
        const finishedGoodsQuantity = legacyFinishedGoods.rows.reduce((total, item) => total + item.beforeExcessQty, 0);
        if (legacyQuantity !== finishedGoodsQuantity) {
          errors.push(`Quantity (${legacyQuantity}) must match the Finished Goods BOM total (${finishedGoodsQuantity}).`);
        }
      }
    }
    const deliveryDate = parseDeliveryDate(valuesByHeader["Delivery Date"]);
    if (cellText(valuesByHeader["Delivery Date"]) && !deliveryDate) {
      errors.push("Delivery Date must be a valid date in YYYY-MM-DD or DD/MM/YYYY format.");
    }

    if (errors.length > 0 || !deliveryDate) {
      return {
        spreadsheetRow,
        order: null,
        candidateOrder: {
          ...order,
          orderQty: legacyQuantity,
          deliveryDate: deliveryDate ?? "",
          ...(legacyFinishedGoods ? { rows: legacyFinishedGoods.rows } : {}),
        },
        errors,
      };
    }
    return {
      spreadsheetRow,
      order: {
        ...order,
        orderQty: legacyQuantity,
        deliveryDate,
        ...(legacyFinishedGoods ? { rows: legacyFinishedGoods.rows } : {}),
      },
      errors,
    };
  });
}

export function parseBulkOrderWorkbook(
  ordersValues: unknown[][],
  finishedGoodsValues: unknown[][],
  bomValues: unknown[][],
): ParsedBulkOrderRow[] {
  const orderHeaders = getHeaderIndexes(ordersValues[0], ORDER_HEADERS);
  const finishedGoodsHeaders = getHeaderIndexes(finishedGoodsValues[0], FINISHED_GOODS_HEADERS);
  const bomHeaders = getHeaderIndexes(bomValues[0], BOM_HEADERS);
  const exampleOrderRows = new Set(
    readSheetRows(ordersValues.slice(1))
      .filter(({ row }) => cellText(row[0]).toUpperCase().startsWith("EXAMPLE"))
      .map(({ spreadsheetRow }) => spreadsheetRow),
  );
  const orderRows = readSheetRows(ordersValues.slice(1))
    .filter(({ row, spreadsheetRow }) =>
      row.some((value) => cellText(value) !== "")
      && !exampleOrderRows.has(spreadsheetRow),
    );
  if (orderRows.length > MAX_BULK_ORDER_ROWS) {
    throw new Error(`The file contains ${orderRows.length} orders. Upload no more than ${MAX_BULK_ORDER_ROWS} at a time.`);
  }

  const parsedOrders = new Map<number, ParsedBulkOrderRow>();
  for (const { row, spreadsheetRow } of orderRows) {
    const values = readValuesByHeader(row, orderHeaders, ORDER_HEADERS);
    const order = {
      entityName: cellText(values["Entity Name"]),
      category: cellText(values["Product Category"]),
      subCategory: cellText(values["Product Sub Category"]),
      season: cellText(values.Season),
      article: cellText(values.Article),
      styleName: cellText(values["Style Name"]),
      colors: cellText(values.Colors),
      buyer: cellText(values.Buyer),
      brand: cellText(values.Brand),
      sizeGroup: cellText(values["Size Group"]),
      orderQty: 0,
      deliveryDate: "",
      rows: [],
      bomRows: [],
    } satisfies BulkOrderInput;
    const errors = ORDER_HEADERS
      .filter((column) => column !== "Example Row" && column !== "Delivery Date" && !cellText(values[column]))
      .map((column) => `${column} is required.`);
    const deliveryDate = parseDeliveryDate(values["Delivery Date"]);
    if (!deliveryDate) errors.push("Delivery Date must be a valid date in YYYY-MM-DD or DD/MM/YYYY format.");
    parsedOrders.set(spreadsheetRow, {
      spreadsheetRow,
      order: { ...order, deliveryDate: deliveryDate ?? "" },
      errors,
    });
  }

  const finishedGoodsByOrder = new Map<number, Map<string, { quantity: number; excess: number }>>();
  const finishedGoodsErrors = new Map<number, string[]>();
  const orderRowIndex = finishedGoodsHeaders.get("orders row") ?? -1;
  const sizeIndex = finishedGoodsHeaders.get("size") ?? -1;
  const quantityIndex = finishedGoodsHeaders.get("quantity") ?? -1;
  const excessIndex = finishedGoodsHeaders.get("excess %") ?? -1;
  for (const { row, spreadsheetRow } of readSheetRows(finishedGoodsValues.slice(1))) {
    if (!rowHasValues(row, [sizeIndex, quantityIndex, excessIndex])) continue;
    const orderRow = parseQuantity(row[orderRowIndex]);
    if (!orderRow || (!parsedOrders.has(orderRow) && !exampleOrderRows.has(orderRow))) {
      throw new Error(`Finished Goods row ${spreadsheetRow} must reference an order row on the Orders sheet.`);
    }
    if (exampleOrderRows.has(orderRow)) continue;
    const size = cellText(row[sizeIndex]);
    const quantity = parseQuantity(row[quantityIndex]);
    const errors = finishedGoodsErrors.get(orderRow) ?? [];
    const excess = parseOptionalNumber(row[excessIndex], `Finished Goods row ${spreadsheetRow} Excess %`, errors);
    if (!size) errors.push(`Finished Goods row ${spreadsheetRow}: Size is required.`);
    if (!quantity) errors.push(`Finished Goods row ${spreadsheetRow}: Quantity must be a positive whole number.`);
    finishedGoodsErrors.set(orderRow, errors);
    if (!size || !quantity) continue;
    const sizeQuantities = finishedGoodsByOrder.get(orderRow)
      ?? new Map<string, { quantity: number; excess: number }>();
    const normalizedSize = size.toLocaleLowerCase();
    if ([...sizeQuantities.keys()].some((existingSize) => existingSize.toLocaleLowerCase() === normalizedSize)) {
      errors.push(`Finished Goods row ${spreadsheetRow}: Size "${size}" is repeated for Orders row ${orderRow}.`);
    } else {
      sizeQuantities.set(size, { quantity, excess: excess ?? 0 });
      finishedGoodsByOrder.set(orderRow, sizeQuantities);
    }
  }

  const bomRowsByOrder = new Map<number, BulkOrderInput["bomRows"]>();
  const bomErrors = new Map<number, string[]>();
  const bomOrderRowIndex = bomHeaders.get("orders row") ?? -1;
  for (const { row, spreadsheetRow } of readSheetRows(bomValues.slice(1))) {
    if (!rowHasValues(row, Array.from({ length: BOM_HEADERS.length }, (_, index) => index))) continue;
    const orderRow = parseQuantity(row[bomOrderRowIndex]);
    if (!orderRow || (!parsedOrders.has(orderRow) && !exampleOrderRows.has(orderRow))) {
      throw new Error(`BOM row ${spreadsheetRow} must reference an order row on the Orders sheet.`);
    }
    if (exampleOrderRows.has(orderRow)) continue;
    const values = readValuesByHeader(row, bomHeaders, BOM_HEADERS);
    const rawMaterialName = cellText(values["Raw Material"]);
    const errors = bomErrors.get(orderRow) ?? [];
    if (!rawMaterialName) errors.push(`BOM row ${spreadsheetRow}: Raw Material is required.`);
    const bomRow = {
      categoryType: cellText(values["RM Category Type"]) || undefined,
      category: cellText(values["BOM Category"]) || undefined,
      subCategory: cellText(values["BOM Sub Category"]) || undefined,
      rawMaterialName: rawMaterialName || undefined,
      stockUom: cellText(values["Stock UOM"]) || undefined,
      size: cellText(values.Size) || undefined,
      buyerConsumption: parseOptionalNumber(values["Buyer Consumption"], `BOM row ${spreadsheetRow} Buyer Consumption`, errors),
      buyerPrice: parseOptionalNumber(values["Buyer Price"], `BOM row ${spreadsheetRow} Buyer Price`, errors),
      internalConsumption: parseOptionalNumber(values["Internal Consumption"], `BOM row ${spreadsheetRow} Internal Consumption`, errors),
      internalPrice: parseOptionalNumber(values["Internal Price"], `BOM row ${spreadsheetRow} Internal Price`, errors),
      itemWiseExcessPercentage: parseOptionalNumber(values["Itemwise Excess %"], `BOM row ${spreadsheetRow} Itemwise Excess %`, errors),
    };
    bomErrors.set(orderRow, errors);
    const existing = bomRowsByOrder.get(orderRow) ?? [];
    if (rawMaterialName) existing.push(bomRow);
    bomRowsByOrder.set(orderRow, existing);
  }

  for (const [orderRow, parsed] of parsedOrders) {
    const sizeQuantities = finishedGoodsByOrder.get(orderRow);
    const rows = [...(sizeQuantities ?? new Map())].map(([size, values]) => ({
      buyerSize: size,
      size,
      beforeExcessQty: values.quantity,
      excess: values.excess,
    }));
    if (rows.length === 0) parsed.errors.push("At least one Finished Goods size and quantity is required.");
    parsed.errors.push(...(finishedGoodsErrors.get(orderRow) ?? []), ...(bomErrors.get(orderRow) ?? []));
    if (parsed.order) {
      parsed.order.rows = rows;
      parsed.order.orderQty = rows.reduce((total, item) => total + item.beforeExcessQty, 0);
      parsed.order.bomRows = bomRowsByOrder.get(orderRow) ?? [];
    }
    if (parsed.errors.length > 0) {
      parsed.candidateOrder = parsed.order ?? undefined;
      parsed.order = null;
    }
  }

  return [...parsedOrders.values()];
}

export async function parseBulkOrderFile(file: File) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const readSheet = (name: string) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) throw new Error(`The uploaded workbook is missing the "${name}" sheet.`);
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });
  };

  if (workbook.Sheets.Orders && workbook.Sheets["Finished Goods"] && workbook.Sheets.BOM) {
    return parseBulkOrderWorkbook(
      readSheet("Orders"),
      readSheet("Finished Goods"),
      readSheet("BOM"),
    );
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("The uploaded workbook has no worksheets.");
  return parseBulkOrderRows(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheet], {
    header: 1,
    raw: true,
    defval: "",
    blankrows: false,
  }));
}
