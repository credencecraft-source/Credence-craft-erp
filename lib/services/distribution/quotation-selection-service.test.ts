import { describe, expect, it } from "vitest";

import {
  validateBookingQuotationSelection,
  validateMasterQuotationChildSelection,
} from "./quotation-selection-service";

describe("validateMasterQuotationChildSelection", () => {
  const quotations = [
    { quoteId: "QT 01" },
    { quoteId: "QT 02" },
    { quoteId: "QT 03", parentQuoteId: "QT 04" },
    { quoteId: "QT 04", childQuoteIds: ["QT 01", "QT 02"] },
  ];

  it("allows multiple unassigned quotations", () => {
    expect(validateMasterQuotationChildSelection(["QT 01", "QT 02"], quotations)).toBe("");
  });

  it("requires at least two unique quotations that are still available", () => {
    expect(validateMasterQuotationChildSelection(["QT 01"], quotations)).toMatch(/at least two/i);
    expect(validateMasterQuotationChildSelection(["QT 01", "QT 01"], quotations)).toMatch(/only be included once/i);
    expect(validateMasterQuotationChildSelection(["QT 01", "QT 05"], quotations)).toMatch(/no longer available/i);
  });

  it("rejects quotations already linked to a parent or containing children", () => {
    expect(validateMasterQuotationChildSelection(["QT 01", "QT 03"], quotations)).toMatch(/not already part/i);
    expect(validateMasterQuotationChildSelection(["QT 01", "QT 04"], quotations)).toMatch(/not already part/i);
  });
});

describe("validate advance-booking quotation selection", () => {
  const bookingSource = {
    bookingId: "BK 08",
    orderNo: "ORD-08",
    vendorId: "vendor-8",
    customer: "Vendor Eight",
    totalBooked: 42,
  };

  it("rejects bookings without a valid vendor or quantity and rejects mixed vendors", () => {
    expect(validateBookingQuotationSelection([
      { ...bookingSource, vendorId: "" },
    ])).toMatch(/Vendor Master customer/i);
    expect(validateBookingQuotationSelection([
      { ...bookingSource, totalBooked: 0 },
    ])).toMatch(/positive whole-number quantity/i);
    expect(validateBookingQuotationSelection([
      bookingSource,
      { ...bookingSource, bookingId: "BK 09", vendorId: "vendor-9", customer: "Vendor Nine" },
    ])).toMatch(/same Vendor Master vendor/i);
  });
});
