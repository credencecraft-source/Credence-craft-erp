import { describe, expect, it } from "vitest";

import {
  getOrderQrPrintPreviewMode,
  getNextOrderQrPrintRequestStatus,
  parseCreateOrderQrPrintRequestInput,
} from "./order-qr-print-request-contract";

describe("order QR print request contract", () => {
  it("requires a Page Setup before showing a laser sheet preview", () => {
    expect(getOrderQrPrintPreviewMode("LASER", false)).toBe("page-setup-required");
    expect(getOrderQrPrintPreviewMode("LASER", true)).toBe("page-setup-sheet");
    expect(getOrderQrPrintPreviewMode("BARCODE", false)).toBe("single-sticker");
  });

  it("accepts only a valid order, required template, and supported request type", () => {
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
    })).toEqual({
      success: true,
      data: {
        orderId: "order-1",
        templateId: "template-1",
        requestType: "PRINT",
        quantityMode: "BULK_QTY",
      },
    });
  });

  it("accepts PCS or Bulk Qty and defaults existing callers to Bulk Qty", () => {
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "PCS",
    })).toMatchObject({ success: true, data: { quantityMode: "PCS" } });
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "UNKNOWN",
    })).toMatchObject({ success: false, error: "Select PCS or Bulk Qty." });
  });

  it("accepts only positive safe whole-number bulk quantities", () => {
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "BULK_QTY",
      bulkQuantity: 125,
    })).toMatchObject({
      success: true,
      data: { quantityMode: "BULK_QTY", bulkQuantity: 125 },
    });
    for (const bulkQuantity of [0, -1, 1.5, 10_001, Number.MAX_SAFE_INTEGER + 1, "10"]) {
      expect(parseCreateOrderQrPrintRequestInput({
        orderId: "order-1",
        templateId: "template-1",
        requestType: "PRINT",
        quantityMode: "BULK_QTY",
        bulkQuantity,
      })).toMatchObject({
        success: false,
        error: "Bulk quantity must be a positive whole number up to 10,000.",
      });
    }
  });

  it("accepts bulk orders within order and aggregate label limits", () => {
    expect(parseCreateOrderQrPrintRequestInput({
      bulkOrders: [
        { orderId: "order-1", quantity: 75 },
        { orderId: "order-2", quantity: 125 },
      ],
      templateId: "template-1",
      requestType: "PRINT",
      quantityMode: "BULK_QTY",
    })).toMatchObject({
      success: true,
      data: {
        bulkOrders: [
          { orderId: "order-1", quantity: 75 },
          { orderId: "order-2", quantity: 125 },
        ],
      },
    });
  });

  it("rejects duplicate orders and aggregate quantities over the request limit", () => {
    for (const bulkOrders of [
      [
        { orderId: "order-1", quantity: 1 },
        { orderId: "order-1", quantity: 1 },
      ],
      [
        { orderId: "order-1", quantity: 5_000 },
        { orderId: "order-2", quantity: 5_001 },
      ],
    ]) {
      expect(parseCreateOrderQrPrintRequestInput({
        bulkOrders,
        templateId: "template-1",
        requestType: "PRINT",
      }).success).toBe(false);
    }
  });

  it("rejects ambiguous single-plus-bulk input and invalid PCS batch quantities", () => {
    const shared = {
      templateId: "template-1",
      requestType: "PRINT",
    };
    expect(parseCreateOrderQrPrintRequestInput({
      ...shared,
      orderId: "order-1",
      bulkOrders: [{ orderId: "order-2", quantity: 1 }],
    })).toMatchObject({ success: false });
    expect(parseCreateOrderQrPrintRequestInput({
      ...shared,
      quantityMode: "PCS",
      bulkOrders: [{ orderId: "order-1", quantity: 2 }],
    })).toMatchObject({ success: false });
  });

  it("rejects malformed or unsupported request input", () => {
    expect(parseCreateOrderQrPrintRequestInput(null).success).toBe(false);
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "",
      requestType: "PRINT",
    }).success).toBe(false);
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      requestType: "DELETE",
    }).success).toBe(false);
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      requestType: "PRINT",
    })).toEqual({
      success: false,
      error: "Select a QR template before requesting print or download.",
    });
    expect(parseCreateOrderQrPrintRequestInput({
      orderId: "order-1",
      templateId: null,
      requestType: "PRINT",
    }).success).toBe(false);
  });

  it("enforces the pending-to-progress-to-completed lifecycle", () => {
    expect(getNextOrderQrPrintRequestStatus("PENDING")).toBe("IN_PROGRESS");
    expect(getNextOrderQrPrintRequestStatus("IN_PROGRESS")).toBe("COMPLETED");
    expect(getNextOrderQrPrintRequestStatus("COMPLETED")).toBeNull();
  });
});
