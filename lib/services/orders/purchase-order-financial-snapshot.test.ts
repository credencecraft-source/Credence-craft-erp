import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { calculatePurchaseOrderGrandTotal } from "./purchase-order-financial-snapshot";

describe("calculatePurchaseOrderGrandTotal", () => {
  it("adds line amounts and tax components using Decimal arithmetic", () => {
    const total = calculatePurchaseOrderGrandTotal([
      {
        quantity: new Prisma.Decimal("1000000000.10"),
        price: new Prisma.Decimal("0.10"),
        cgst_amount: new Prisma.Decimal("0.05"),
      },
      {
        total: new Prisma.Decimal("0.15"),
        igst_amount: new Prisma.Decimal("0.03"),
      },
    ]);

    expect(total.toFixed(2)).toBe("100000000.24");
  });

  it("falls back to quantity times price when a line total is absent", () => {
    expect(calculatePurchaseOrderGrandTotal([
      { quantity: "3.25", price: "4.10", sgst_amount: "0.05" },
    ]).toFixed(2)).toBe("13.38");
  });
});
