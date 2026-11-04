import { describe, expect, it } from "vitest";

import { isOrderFormPdfData } from "./order-form-pdf-generator";

const orderFormPdfData = {
  orderForm: {
    id: "form-1",
    orderFormNo: "OF-1",
    orderFormDate: "2026-11-02",
    customer: "Contact A",
    status: "DRAFT",
    totalQuantity: 30,
    hasQuotation: false,
    createdAt: "2026-11-02T00:00:00.000Z",
    lines: [{
      bookingNo: "BK-1",
      orderNo: "ORD-1",
      brand: "Brand",
      styleName: "Style",
      quantity: 30,
      sizes: [
        { size: "M", bookedQuantity: 20 },
        { size: "S", bookedQuantity: 10 },
      ],
    }],
  },
  seller: {
    name: "Seller Ltd",
    email: "seller@example.com",
    phone: "1234567890",
    gstin: "SELLER-GST",
    address: "1 Main Street, Bengaluru",
  },
  buyer: {
    name: "Contact A",
    legalName: "Contact A Legal",
    email: "contact@example.com",
    phone: "9876543210",
    gstin: "29ABCDE1234F1Z5",
    registeredState: "Karnataka",
    billingAddress: { lines: ["10 Market Road", "Bengaluru"], gstin: "29ABCDE1234F1Z5" },
    shippingAddress: null,
  },
};

describe("distribution Order Form PDF data", () => {
  it("accepts saved Order Form data with source sizes and customer details", () => {
    expect(isOrderFormPdfData(orderFormPdfData)).toBe(true);
  });

  it("rejects incomplete or malformed Order Form PDF data", () => {
    expect(isOrderFormPdfData(null)).toBe(false);
    expect(isOrderFormPdfData({
      ...orderFormPdfData,
      orderForm: { ...orderFormPdfData.orderForm, totalQuantity: "30" },
    })).toBe(false);
  });
});
