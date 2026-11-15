import { Prisma } from "@prisma/client";

import { calculateTax } from "@/lib/services/orders/gst-calculation-service";

export type QuotationTaxProfile = {
  tax_regime: string;
  country: string;
  cgst_rate: Prisma.Decimal | null;
  sgst_rate: Prisma.Decimal | null;
  igst_rate: Prisma.Decimal | null;
  vat_rate: Prisma.Decimal | null;
  sales_tax_rate: Prisma.Decimal | null;
};

export type QuotationGstRate = {
  gst: Prisma.Decimal | null;
  cgst_rate: Prisma.Decimal | null;
  sgst_rate: Prisma.Decimal | null;
  igst_rate: Prisma.Decimal | null;
};

export type QuotationTaxAmounts = {
  taxType: string;
  cgstRate: Prisma.Decimal;
  sgstRate: Prisma.Decimal;
  igstRate: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  salesTaxRate: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  igstAmount: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  salesTaxAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

const zero = () => new Prisma.Decimal(0);

function percentage(amount: Prisma.Decimal, rate: Prisma.Decimal) {
  return amount.mul(rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateQuotationTax(input: {
  taxableAmount: Prisma.Decimal;
  selectedRate: Prisma.Decimal;
  profile: QuotationTaxProfile | null;
  gstRate: QuotationGstRate | null;
  organizationState: string | null;
  organizationGstin: string | null;
  counterpartyState: string | null;
  counterpartyGstin: string | null;
}): QuotationTaxAmounts {
  const { taxableAmount, selectedRate, profile, gstRate } = input;
  const regime = String(profile?.tax_regime ?? "GST").trim().toUpperCase();
  const country = String(profile?.country ?? "IN").trim().toUpperCase();
  if (!taxableAmount.isFinite() || taxableAmount.isNegative() || !selectedRate.isFinite()
    || selectedRate.isNegative() || selectedRate.gt(100)) {
    throw new Error("Quotation taxable amount and tax rate are outside the allowed range.");
  }

  if (regime === "NONE") {
    if (!selectedRate.isZero()) throw new Error("Tax rate must be zero when the organization tax regime is NONE.");
    return {
      taxType: "NONE",
      cgstRate: zero(), sgstRate: zero(), igstRate: zero(), vatRate: zero(), salesTaxRate: zero(),
      cgstAmount: zero(), sgstAmount: zero(), igstAmount: zero(), vatAmount: zero(), salesTaxAmount: zero(),
      taxAmount: zero(), totalAmount: taxableAmount,
    };
  }

  const cgstRate = gstRate?.cgst_rate ?? profile?.cgst_rate ?? null;
  const sgstRate = gstRate?.sgst_rate ?? profile?.sgst_rate ?? null;
  const igstRate = gstRate?.igst_rate ?? profile?.igst_rate ?? null;
  let vatRate = zero();
  let salesTaxRate = zero();
  if (regime === "VAT") {
    vatRate = profile?.vat_rate ?? zero();
    if (!selectedRate.eq(vatRate)) throw new Error("Select the configured VAT rate for this quotation.");
  } else if (regime === "SALES_TAX") {
    salesTaxRate = profile?.sales_tax_rate ?? zero();
    if (!selectedRate.eq(salesTaxRate)) throw new Error("Select the configured Sales Tax rate for this quotation.");
  } else if (regime !== "GST") {
    throw new Error("The organization tax regime is not supported for quotations.");
  } else if (!selectedRate.isZero()) {
    if (!gstRate?.gst || !gstRate.gst.eq(selectedRate)) {
      throw new Error(`GST ${selectedRate.toFixed(2)}% is not configured as active for this organization.`);
    }
    if (cgstRate && sgstRate && !cgstRate.plus(sgstRate).eq(selectedRate)) {
      throw new Error(`CGST and SGST rates for ${selectedRate.toFixed(2)}% do not match the configured GST rate.`);
    }
    if (igstRate && !igstRate.eq(selectedRate)) {
      throw new Error(`IGST rate for ${selectedRate.toFixed(2)}% does not match the configured GST rate.`);
    }
  }

  const classification = calculateTax({
    taxableAmount: 0,
    totalRate: selectedRate.toNumber(),
    taxRegime: regime,
    country,
    cgstRate: cgstRate?.toNumber(),
    sgstRate: sgstRate?.toNumber(),
    igstRate: igstRate?.toNumber(),
    vatRate: vatRate.toNumber(),
    salesTaxRate: salesTaxRate.toNumber(),
    organizationState: input.organizationState,
    organizationGstin: input.organizationGstin,
    vendorState: input.counterpartyState,
    vendorGstin: input.counterpartyGstin,
  });

  const zeroAmount = zero();
  const calculatedCgstRate = new Prisma.Decimal(classification.cgstRate);
  const calculatedSgstRate = new Prisma.Decimal(classification.sgstRate);
  const calculatedIgstRate = new Prisma.Decimal(classification.igstRate);
  const calculatedVatRate = new Prisma.Decimal(classification.vatRate);
  const calculatedSalesTaxRate = new Prisma.Decimal(classification.salesTaxRate);
  let cgstAmount = zeroAmount;
  let sgstAmount = zeroAmount;
  let igstAmount = zeroAmount;
  let vatAmount = zeroAmount;
  let salesTaxAmount = zeroAmount;

  if (classification.taxType === "CGST_SGST") {
    const combinedTax = percentage(taxableAmount, selectedRate);
    cgstAmount = percentage(taxableAmount, calculatedCgstRate);
    sgstAmount = combinedTax.minus(cgstAmount);
  } else if (classification.taxType === "IGST") {
    igstAmount = percentage(taxableAmount, calculatedIgstRate);
  } else if (classification.taxType === "VAT") {
    if (regime === "VAT") vatAmount = percentage(taxableAmount, calculatedVatRate);
  } else if (classification.taxType === "SALES_TAX") {
    salesTaxAmount = percentage(taxableAmount, calculatedSalesTaxRate);
  }

  const taxAmount = cgstAmount.plus(sgstAmount).plus(igstAmount).plus(vatAmount).plus(salesTaxAmount);
  return {
    taxType: classification.taxType,
    cgstRate: calculatedCgstRate,
    sgstRate: calculatedSgstRate,
    igstRate: calculatedIgstRate,
    vatRate: calculatedVatRate,
    salesTaxRate: calculatedSalesTaxRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    vatAmount,
    salesTaxAmount,
    taxAmount,
    totalAmount: taxableAmount.plus(taxAmount),
  };
}
