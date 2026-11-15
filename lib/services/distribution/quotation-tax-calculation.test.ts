import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { calculateQuotationTax } from "./quotation-tax-calculation";

const gstProfile = {
  tax_regime: "GST",
  country: "IN",
  cgst_rate: null,
  sgst_rate: null,
  igst_rate: null,
  vat_rate: null,
  sales_tax_rate: null,
};

function calculate(input: {
  amount: string;
  rate: string;
  state?: string;
  counterpartyState?: string;
}) {
  const rate = new Prisma.Decimal(input.rate);
  return calculateQuotationTax({
    taxableAmount: new Prisma.Decimal(input.amount),
    selectedRate: rate,
    profile: gstProfile,
    gstRate: rate.isZero() ? null : {
      gst: rate,
      cgst_rate: rate.div(2),
      sgst_rate: rate.div(2),
      igst_rate: rate,
    },
    organizationState: input.state ?? "KARNATAKA",
    organizationGstin: null,
    counterpartyState: input.counterpartyState ?? "KARNATAKA",
    counterpartyGstin: null,
  });
}

describe("calculateQuotationTax", () => {
  it("calculates local CGST and SGST with half-up money rounding", () => {
    const result = calculate({ amount: "100.01", rate: "5" });
    expect(result.taxType).toBe("CGST_SGST");
    expect(result.cgstAmount.toFixed(2)).toBe("2.50");
    expect(result.sgstAmount.toFixed(2)).toBe("2.50");
    expect(result.taxAmount.toFixed(2)).toBe("5.00");
    expect(result.totalAmount.toFixed(2)).toBe("105.01");
  });

  it("calculates IGST for interstate supplies", () => {
    const result = calculate({ amount: "1000.00", rate: "12", counterpartyState: "MAHARASHTRA" });
    expect(result.taxType).toBe("IGST");
    expect(result.igstAmount.toFixed(2)).toBe("120.00");
    expect(result.cgstAmount.isZero()).toBe(true);
    expect(result.sgstAmount.isZero()).toBe(true);
  });

  it("rejects unconfigured GST rates", () => {
    expect(() => calculateQuotationTax({
      taxableAmount: new Prisma.Decimal(100),
      selectedRate: new Prisma.Decimal(7),
      profile: gstProfile,
      gstRate: null,
      organizationState: "KARNATAKA",
      organizationGstin: null,
      counterpartyState: "KARNATAKA",
      counterpartyGstin: null,
    })).toThrow("is not configured as active");
  });

  it("rejects inconsistent configured GST component rates", () => {
    expect(() => calculateQuotationTax({
      taxableAmount: new Prisma.Decimal(100),
      selectedRate: new Prisma.Decimal(5),
      profile: gstProfile,
      gstRate: {
        gst: new Prisma.Decimal(5),
        cgst_rate: new Prisma.Decimal(2),
        sgst_rate: new Prisma.Decimal(2),
        igst_rate: new Prisma.Decimal(5),
      },
      organizationState: "KARNATAKA",
      organizationGstin: null,
      counterpartyState: "KARNATAKA",
      counterpartyGstin: null,
    })).toThrow("do not match");
  });
});
