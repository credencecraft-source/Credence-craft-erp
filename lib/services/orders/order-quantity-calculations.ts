export type FinishedGoodsQuantityInput = {
  buyerSize?: string | null;
  size?: string | null;
  beforeExcessQty?: number | string | null;
  excess?: number | string | null;
  excessQty?: number | string | null;
  totalQty?: number | string | null;
  buyerPoPrice?: number | string | null;
  exchangePrice?: number | string | null;
  priceInInr?: number | string | null;
};

export type CalculatedFinishedGoodsQuantity = FinishedGoodsQuantityInput & {
  excessQty: number;
  totalQty: number;
};

export type BomQuantityInput = {
  categoryType?: string | null;
  category?: string | null;
  subCategory?: string | null;
  rawMaterialName?: string | null;
  size?: string | null;
  buyerConsumption?: number | string | null;
  buyerPrice?: number | string | null;
  internalConsumption?: number | string | null;
  internalPrice?: number | string | null;
  consumption?: number | string | null;
  itemWiseExcessPercentage?: number | string | null;
};

export type CalculatedBomQuantity = BomQuantityInput & {
  orderQty: number;
  requiredQty: number;
  itemWiseExcessQty: number;
  totalRequiredQty: number;
  valuePerGarmentRm: number;
};

function numericValue(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function calculateFinishedGoodsRow(row: FinishedGoodsQuantityInput): CalculatedFinishedGoodsQuantity {
  const beforeExcessQty = numericValue(row.beforeExcessQty);
  const excessPercentage = numericValue(row.excess);
  const excessQty = beforeExcessQty * excessPercentage / 100;

  return {
    ...row,
    beforeExcessQty,
    excess: excessPercentage,
    excessQty,
    totalQty: beforeExcessQty + excessQty,
  };
}

export function calculateFinishedGoodsRows(rows: FinishedGoodsQuantityInput[]) {
  const calculatedRows = rows.map(calculateFinishedGoodsRow);
  const orderQty = calculatedRows.reduce((total, row) => total + row.totalQty, 0);
  return { rows: calculatedRows, orderQty };
}

export function calculateBomRow(
  row: BomQuantityInput,
  finishedGoodsRows: CalculatedFinishedGoodsQuantity[],
  orderQty: number,
): CalculatedBomQuantity {
  const normalizedSize = String(row.size ?? "").trim();
  const sizeOrderQty = normalizedSize
    ? finishedGoodsRows
      .filter((finishedGoodsRow) => String(finishedGoodsRow.size ?? "").trim() === normalizedSize)
      .reduce((total, finishedGoodsRow) => total + finishedGoodsRow.totalQty, 0)
    : orderQty;
  const buyerConsumption = numericValue(row.buyerConsumption);
  const internalConsumption = numericValue(row.internalConsumption ?? row.consumption);
  const internalPrice = numericValue(row.internalPrice);
  const itemWiseExcessPercentage = numericValue(row.itemWiseExcessPercentage);
  const requiredQty = internalConsumption * sizeOrderQty;
  const itemWiseExcessQty = requiredQty * itemWiseExcessPercentage / 100;

  return {
    ...row,
    orderQty: sizeOrderQty,
    buyerConsumption,
    internalConsumption,
    consumption: internalConsumption,
    internalPrice,
    valuePerGarmentRm: internalConsumption * internalPrice,
    itemWiseExcessPercentage,
    requiredQty,
    itemWiseExcessQty,
    totalRequiredQty: requiredQty + itemWiseExcessQty,
  };
}

export function calculateBomRows(
  rows: BomQuantityInput[],
  finishedGoodsRows: CalculatedFinishedGoodsQuantity[],
  orderQty: number,
) {
  return rows.map((row) => calculateBomRow(row, finishedGoodsRows, orderQty));
}
