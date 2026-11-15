import { Prisma } from "@prisma/client";

type DecimalInput = Prisma.Decimal | number | string | null | undefined;

export type PurchaseOrderFinancialLine = {
  quantity?: DecimalInput;
  price?: DecimalInput;
  total?: DecimalInput;
  cgst_amount?: DecimalInput;
  sgst_amount?: DecimalInput;
  igst_amount?: DecimalInput;
};

const decimal = (value: DecimalInput) => new Prisma.Decimal(value ?? 0);

export function calculatePurchaseOrderGrandTotal(lines: readonly PurchaseOrderFinancialLine[]) {
  const total = lines.reduce((sum, line) => {
    const lineTotal = line.total == null
      ? decimal(line.quantity).mul(decimal(line.price))
      : decimal(line.total);
    return sum
      .plus(lineTotal)
      .plus(decimal(line.cgst_amount))
      .plus(decimal(line.sgst_amount))
      .plus(decimal(line.igst_amount));
  }, new Prisma.Decimal(0));

  return total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
