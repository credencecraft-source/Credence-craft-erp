import { calculateFinishedGoodsRows } from "@/lib/services/orders/order-quantity-calculations";
import type { BomRow, CreateOrderInput, OrderRow, ProcessRow } from "@/lib/services/orders/order-service";

type VariantRowInput = {
  size?: unknown;
  qty?: unknown;
};

export type VariantSourceOrder = {
  entityName: string | null;
  category: string | null;
  subCategory: string | null;
  season: string | null;
  article: string | null;
  styleName: string | null;
  colors: string | null;
  buyer: string | null;
  brand: string | null;
  sizeGroup: string | null;
  haveSizeRatio: boolean | null;
  ratioOrderQty: number | null;
  deliveryDate: Date | string | null;
  finishedGoods: Array<{
    buyerSize: string | null;
    size: string | null;
    buyerPoPrice: { toString(): string } | number | null;
    exchangePrice: { toString(): string } | number | null;
    priceInInr: { toString(): string } | number | null;
  }>;
  bomItems: Array<{
    categoryType: string | null;
    category: string | null;
    subCategory: string | null;
    rawMaterialName: string | null;
    stockUom: string | null;
    size: string | null;
    buyerConsumption: unknown;
    buyerPrice: unknown;
    internalConsumption: unknown;
    internalPrice: unknown;
    valuePerGarmentRm: unknown;
    consumption: unknown;
    requiredQty: unknown;
    itemWiseExcessPercentage: unknown;
    itemWiseExcessQty: unknown;
    totalRequiredQty: unknown;
  }>;
  processTemplateId: string | null;
  processSteps: Array<{
    source_template_step_id: string | null;
    process_id: string;
    process_name: string;
    sl_no: number;
    operations: Array<{
      id: string;
      source_operation_template_step_id: string | null;
      operation: string;
      sl_no: number;
      price: { toString(): string } | number;
    }>;
  }>;
};

export type VariantCreateRequest = {
  preparedToken?: unknown;
  styleName?: unknown;
  colors?: unknown;
  rows?: unknown;
};

function requireText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 255) {
    throw new Error(`${field} is required and must be no longer than 255 characters.`);
  }
  return value.trim();
}

function decimalString(value: unknown) {
  return value === null || value === undefined ? value : String(value);
}

function dateOnly(value: Date | string | null) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export function buildVariantOrderInput(
  source: VariantSourceOrder,
  request: VariantCreateRequest,
  allowedSizes: string[],
): CreateOrderInput {
  const styleName = requireText(request.styleName, "Style name");
  const colors = requireText(request.colors, "Colour");
  if (!Array.isArray(request.rows)) throw new Error("Finished-goods quantities are required.");

  const allowedSizeSet = new Set(allowedSizes.map((size) => size.trim()).filter(Boolean));
  const sourceRows = new Map(source.finishedGoods.map((row) => [String(row.size || row.buyerSize || "").trim(), row]));
  const seenSizes = new Set<string>();
  const rows: OrderRow[] = [];

  for (const rawRow of request.rows as VariantRowInput[]) {
    const size = typeof rawRow?.size === "string" ? rawRow.size.trim() : "";
    const rawQty = rawRow?.qty;
    if (!size || rawQty === "" || rawQty === null || rawQty === undefined) continue;
    if (!allowedSizeSet.has(size)) throw new Error(`Size ${size} is not available for the source order.`);
    if (seenSizes.has(size)) throw new Error(`Size ${size} was submitted more than once.`);
    const qtyText = typeof rawQty === "string" ? rawQty.trim() : "";
    const qty = typeof rawQty === "number"
      ? rawQty
      : /^\d+$/.test(qtyText) ? Number(qtyText) : Number.NaN;
    if (!Number.isSafeInteger(qty) || qty < 0 || qty > 2_147_483_647) {
      throw new Error(`Quantity for size ${size} must be a non-negative whole number within the supported range.`);
    }
    seenSizes.add(size);
    const sourceRow = sourceRows.get(size);
    rows.push({
      buyerSize: sourceRow?.buyerSize ?? null,
      size,
      beforeExcessQty: qty,
      excess: 0,
      buyerPoPrice: sourceRow?.buyerPoPrice === null ? null : String(sourceRow?.buyerPoPrice ?? ""),
      exchangePrice: sourceRow?.exchangePrice === null ? null : String(sourceRow?.exchangePrice ?? ""),
      priceInInr: sourceRow?.priceInInr === null ? null : String(sourceRow?.priceInInr ?? ""),
    });
  }

  if (rows.length === 0 || !rows.some((row) => Number(row.beforeExcessQty) > 0)) {
    throw new Error("Enter a quantity greater than zero for at least one size.");
  }

  const bomRows: BomRow[] = source.bomItems.map((row) => ({
    categoryType: row.categoryType,
    category: row.category,
    subCategory: row.subCategory,
    rawMaterialName: row.rawMaterialName,
    stockUom: row.stockUom,
    size: row.size,
    buyerConsumption: decimalString(row.buyerConsumption) as BomRow["buyerConsumption"],
    buyerPrice: decimalString(row.buyerPrice) as BomRow["buyerPrice"],
    internalConsumption: decimalString(row.internalConsumption) as BomRow["internalConsumption"],
    internalPrice: decimalString(row.internalPrice) as BomRow["internalPrice"],
    valuePerGarmentRm: decimalString(row.valuePerGarmentRm) as BomRow["valuePerGarmentRm"],
    consumption: decimalString(row.consumption) as BomRow["consumption"],
    requiredQty: decimalString(row.requiredQty) as BomRow["requiredQty"],
    itemWiseExcessPercentage: decimalString(row.itemWiseExcessPercentage) as BomRow["itemWiseExcessPercentage"],
    itemWiseExcessQty: decimalString(row.itemWiseExcessQty) as BomRow["itemWiseExcessQty"],
    totalRequiredQty: decimalString(row.totalRequiredQty) as BomRow["totalRequiredQty"],
  }));

  const processRows: ProcessRow[] = source.processSteps.map((step) => ({
    processId: step.process_id,
    processName: step.process_name,
    slNo: step.sl_no,
    operations: step.operations.map((operation) => ({
      id: operation.id,
      sourceOperationId: operation.source_operation_template_step_id ?? undefined,
      operation: operation.operation,
      slNo: operation.sl_no,
      price: String(operation.price),
    })),
  }));
  const calculatedOrderQty = calculateFinishedGoodsRows(rows).orderQty;

  return {
    entityName: source.entityName ?? undefined,
    category: source.category ?? undefined,
    subCategory: source.subCategory ?? undefined,
    season: source.season ?? undefined,
    article: source.article ?? undefined,
    styleName,
    colors,
    buyer: source.buyer ?? undefined,
    brand: source.brand ?? undefined,
    sizeGroup: source.sizeGroup ?? undefined,
    haveSizeRatio: source.haveSizeRatio ?? false,
    ratioOrderQty: undefined,
    orderQty: calculatedOrderQty,
    deliveryDate: dateOnly(source.deliveryDate),
    finalStatus: "Draft",
    processStatus: "Draft",
    processTemplateId: source.processTemplateId,
    processRows,
    rows,
    bomRows,
  };
}