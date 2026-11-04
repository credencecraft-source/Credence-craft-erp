import { describe, expect, it } from "vitest";

import { isDistributionQuotationPdfData } from "./quotation-pdf-generator";

const quotationPdfData = {
  quotation: {
    id: "quotation-1",
    quotationNo: "QT-1",
    quotationDate: "2026-11-02",
    validUntil: "2026-11-30",
    orderNo: "ORD-1",
    customer: "Distributor A",
    notes: "Delivery terms apply.",
    status: "DRAFT",
    totalQuantity: 10,
    subtotal: "100.00",
    deliveryCharge: "0.00",
    cgstAmount: "9.00",
    sgstAmount: "9.00",
    igstAmount: "0.00",
    vatAmount: "0.00",
    salesTaxAmount: "0.00",
    taxAmount: "18.00",
    grandTotal: "118.00",
    lines: [{
      description: "Ready Garment",
      brand: "Brand",
      styleName: "Style",
      bookingNo: "BK-1",
      orderNo: "ORD-1",
      quantity: 10,
      unitPrice: "10.0000",
      lineTotal: "100.00",
      taxAmount: "18.00",
      totalAmount: "118.00",
      sizes: [{ size: "M", bookedQuantity: 10 }],
    }],
  },
  quotationParty: {
    name: "Distributor A",
    legalName: "Distributor A Private Limited",
    email: "distributor@example.com",
    phone: "9876543210",
    gstin: "29ABCDE1234F1Z5",
    registeredState: "Karnataka",
    billingAddress: { lines: ["10 Market Road", "Bengaluru"], gstin: "29ABCDE1234F1Z5" },
    shippingAddress: { lines: ["20 Warehouse Road", "Bengaluru"], gstin: "29ABCDE1234F1Z5" },
  },
};

describe("distribution quotation PDF data", () => {
  it("accepts a quotation with saved totals, lines, and distributor addresses", () => {
    expect(isDistributionQuotationPdfData(quotationPdfData)).toBe(true);
  });

  it("rejects incomplete or invalid monetary data", () => {
    expect(isDistributionQuotationPdfData(null)).toBe(false);
    expect(isDistributionQuotationPdfData({
      ...quotationPdfData,
      quotation: { ...quotationPdfData.quotation, grandTotal: "NaN" },
    })).toBe(false);
  });
});
