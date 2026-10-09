import { describe, expect, it } from "vitest";

import {
  filterBookingsWaitingForWorkOrderAssignment,
  filterAdvanceBookingsForView,
  filterFullyAssignedBookings,
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
    vendorId: null,
    customer: null,
    totalBooked: 42,
  };

  it("allows missing or different booking vendors but validates order and quantity", () => {
    expect(validateBookingQuotationSelection([
      { ...bookingSource, vendorId: "vendor-8", customer: "Vendor Eight" },
      { ...bookingSource, bookingId: "BK 09", vendorId: "vendor-9", customer: "Vendor Nine" },
    ])).toBe("");
    expect(validateBookingQuotationSelection([
      { ...bookingSource, orderNo: "" },
    ])).toMatch(/order/i);
    expect(validateBookingQuotationSelection([
      { ...bookingSource, totalBooked: 0 },
    ])).toMatch(/positive whole-number quantity/i);
  });

  describe("filter advance bookings by workflow view", () => {
    const bookings = [
      { bookingId: "BK-1", quotationNo: null },
      { bookingId: "BK-2", quotationNo: "QT-2" },
    ];

    it("keeps unquoted bookings in the Advance Booking list", () => {
      expect(filterAdvanceBookingsForView(bookings, "booking")).toEqual([bookings[0]]);
    });

    it("shows only quotation-linked bookings in Fulfillment", () => {
      expect(filterAdvanceBookingsForView(bookings, "fulfillment")).toEqual([bookings[1]]);
    });

    it("shows only quotation-linked bookings in Shipment Tracking", () => {
      expect(filterAdvanceBookingsForView(bookings, "shipment")).toEqual([bookings[1]]);
    });
  });

  describe("split assigned bookings between work-order and shipment tracking", () => {
    const bookings = [
      { bookingId: "BK-1", assignmentStatus: "UNASSIGNED" },
      { bookingId: "BK-2", assignmentStatus: "PARTIALLY_ASSIGNED" },
      { bookingId: "BK-3", assignmentStatus: "FULLY_ASSIGNED" },
    ];

    it("keeps not-fully-assigned bookings in Work Order Tracking", () => {
      expect(filterBookingsWaitingForWorkOrderAssignment(bookings)).toEqual([bookings[0], bookings[1]]);
    });

    it("moves fully assigned bookings to Shipment Tracking", () => {
      expect(filterFullyAssignedBookings(bookings)).toEqual([bookings[2]]);
    });
  });
});
