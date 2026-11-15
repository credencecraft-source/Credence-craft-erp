import type { FinishedGoodsQuantityInput } from "@/lib/services/orders/order-quantity-calculations";

export function normalizeFinishedGoodsOrderRow<T extends Record<string, unknown>>(row: T) {
  const skuCode = row.skuCode ?? row.sku_code;

  return {
    ...row,
    skuCode: typeof skuCode === "string" ? skuCode : "",
    barcode: typeof row.barcode === "string" ? row.barcode : "",
  };
}

function getSizeLabel(size: unknown): string {
  if (typeof size === "object" && size !== null && !Array.isArray(size)) {
    const record = size as Record<string, unknown>;
    return String(record.label ?? record.name ?? "").trim();
  }
  return String(size ?? "").trim();
}

export function buildFinishedGoodsRowsFromSizes(
  existingRows: FinishedGoodsQuantityInput[],
  sizes: unknown[],
): FinishedGoodsQuantityInput[] | null {
  const sizeLabels = sizes.map(getSizeLabel).filter(Boolean);
  if (sizeLabels.length === 0) return null;

  const existingRowsBySize = new Map(
    existingRows.map((row) => [String(row.size ?? "").trim(), row]),
  );
  return sizeLabels.map((size) => ({
    buyerSize: "",
    skuCode: "",
    barcode: "",
    beforeExcessQty: "",
    excess: "",
    excessQty: "",
    totalQty: "",
    buyerPoPrice: "",
    exchangePrice: "",
    priceInInr: "",
    ...(existingRowsBySize.get(size) ?? {}),
    size,
  }));
}
